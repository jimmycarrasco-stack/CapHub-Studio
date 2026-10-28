import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { HttpError } from "../errors";
import { appsRoot, templatesDir } from "./config";
import { createWorkspaceFromTemplate, deleteSnapshotFiles, restoreSnapshot, saveSnapshot } from "./files";
import { createAppRow, deleteAppRow, getSnapshot, insertSnapshot, pruneSnapshots, requireApp, setSnapshotFiles } from "./repo";
import { appState, dropAppDatabase, removeContainer, restartApp } from "./runtime";

/** High-level app operations used by the API routes. */

export async function createApp(name: string) {
  const app = createAppRow(name);
  try {
    await createWorkspaceFromTemplate(app.id, path.join(templatesDir(), app.template));
    // Name the app in the template so the first preview isn't "My App".
    for (const f of ["src/app/layout.tsx", "src/components/nav.tsx", "src/app/page.tsx"]) {
      const p = path.join(appsRoot(), app.id, "workspace", f);
      const src = await fs.readFile(p, "utf8").catch(() => null);
      if (src) await fs.writeFile(p, src.replaceAll("My App", name.replace(/[<>{}"`$\\]/g, "").slice(0, 60) || "My App"));
    }
    await takeSnapshot(app.id, "Starter template");
  } catch (err) {
    deleteAppRow(app.id);
    await fs.rm(path.join(appsRoot(), app.id), { recursive: true, force: true });
    throw err;
  }
  return app;
}

export async function takeSnapshot(appId: string, note: string) {
  const id = insertSnapshot(appId, note);
  setSnapshotFiles(id, await saveSnapshot(appId, id));
  for (const old of pruneSnapshots(appId)) await deleteSnapshotFiles(appId, old);
  return id;
}

export async function restoreAppSnapshot(appId: string, snapshotId: number) {
  const snap = getSnapshot(appId, snapshotId);
  if (!snap) throw new HttpError(404, "Version not found");
  await restoreSnapshot(appId, snapshotId);
  // Many files changed on the host at once: restart so the dev server rescans them (see workspace.ts).
  if ((await appState(appId)) === "running") await restartApp(appId);
  return takeSnapshot(appId, `Restored: ${snap.note}`);
}

/** Removes the container, its volumes, its database and all files. Irreversible. */
export async function deleteApp(appId: string) {
  const app = requireApp(appId);
  await removeContainer(appId, { volumes: true });
  await dropAppDatabase(app).catch(() => {});
  deleteAppRow(appId);
  await fs.rm(path.join(appsRoot(), appId), { recursive: true, force: true });
}
