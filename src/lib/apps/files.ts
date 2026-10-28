import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { HttpError } from "../errors";
import { IGNORED_DIRS, snapshotsDir, workspaceDir } from "./config";

/**
 * Workspace file access for an app. Every path is resolved inside the app's
 * workspace; absolute paths, `..` escapes and symlinks pointing outside are refused.
 */

export const MAX_FILE_BYTES = 1_000_000;

export function resolveInWorkspace(appId: string, rel: string) {
  const root = workspaceDir(appId);
  const cleaned = String(rel ?? "").replace(/\\/g, "/").replace(/^\.?\/+/, "").trim();
  if (!cleaned || cleaned === ".") return { root, abs: root, rel: "" };
  if (path.isAbsolute(cleaned) || cleaned.split("/").includes("..")) throw new HttpError(400, `Path must be inside the project: ${rel}`);
  const abs = path.resolve(root, cleaned);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new HttpError(400, `Path must be inside the project: ${rel}`);
  const top = cleaned.split("/")[0];
  if (IGNORED_DIRS.has(top)) throw new HttpError(400, `${top}/ is managed by the platform and can't be accessed directly`);
  return { root, abs, rel: cleaned };
}

async function assertNoSymlinkEscape(root: string, abs: string) {
  // realpath of the deepest existing ancestor must stay inside the workspace
  let probe = abs;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      const realRoot = await fs.realpath(root);
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new HttpError(400, "Path resolves outside the project");
      return;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const parent = path.dirname(probe);
      if (parent === probe) return;
      probe = parent;
    }
  }
}

export async function readFile(appId: string, rel: string) {
  const { root, abs, rel: r } = resolveInWorkspace(appId, rel);
  await assertNoSymlinkEscape(root, abs);
  const stat = await fs.stat(abs).catch(() => null);
  if (!stat) throw new HttpError(404, `File not found: ${r}`);
  if (stat.isDirectory()) throw new HttpError(400, `${r} is a directory`);
  if (stat.size > MAX_FILE_BYTES) throw new HttpError(400, `${r} is too large to open (${stat.size} bytes)`);
  return fs.readFile(abs, "utf8");
}

export async function writeFile(appId: string, rel: string, content: string) {
  const { root, abs, rel: r } = resolveInWorkspace(appId, rel);
  if (!r) throw new HttpError(400, "A file path is required");
  if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new HttpError(400, "File is too large");
  await assertNoSymlinkEscape(root, abs);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const existed = await fs.stat(abs).then(() => true, () => false);
  await fs.writeFile(abs, content, "utf8");
  return { created: !existed };
}

export async function deletePath(appId: string, rel: string) {
  const { root, abs, rel: r } = resolveInWorkspace(appId, rel);
  if (!r) throw new HttpError(400, "Refusing to delete the project root");
  await assertNoSymlinkEscape(root, abs);
  await fs.rm(abs, { recursive: true, force: true });
}

/** Exact-string edit. old must appear exactly once unless replaceAll. */
export async function editFile(appId: string, rel: string, oldStr: string, newStr: string, replaceAll = false) {
  const content = await readFile(appId, rel);
  if (!oldStr) throw new HttpError(400, "old_string must not be empty");
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new HttpError(400, `old_string was not found in ${rel}. Read the file again and copy the text exactly.`);
  if (count > 1 && !replaceAll) throw new HttpError(400, `old_string appears ${count} times in ${rel}; include more surrounding text or set replace_all.`);
  const next = replaceAll ? content.split(oldStr).join(newStr) : content.replace(oldStr, () => newStr);
  await writeFile(appId, rel, next);
  return { replacements: replaceAll ? count : 1 };
}

export interface TreeEntry {
  path: string;
  type: "file" | "dir";
  size?: number;
}

/** Recursive listing, skipping platform-managed directories. */
export async function listTree(appId: string, rel = "", limit = 2000): Promise<TreeEntry[]> {
  const { abs, rel: base } = resolveInWorkspace(appId, rel);
  const out: TreeEntry[] = [];
  async function walk(dir: string, prefix: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
    for (const e of entries) {
      if (out.length >= limit) return;
      if (IGNORED_DIRS.has(e.name) || e.name === ".DS_Store") continue;
      const p = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        out.push({ path: p, type: "dir" });
        await walk(path.join(dir, e.name), p);
      } else if (e.isFile()) {
        const size = (await fs.stat(path.join(dir, e.name)).catch(() => null))?.size;
        out.push({ path: p, type: "file", size });
      }
    }
  }
  await walk(abs, base);
  return out;
}

export function formatTree(entries: TreeEntry[]) {
  return entries.map((e) => (e.type === "dir" ? `${e.path}/` : e.path)).join("\n");
}

/** Regex search across text files. Returns "path:line: text" lines. */
export async function searchFiles(appId: string, pattern: string, rel = "", maxResults = 200) {
  let re: RegExp;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    throw new HttpError(400, `Invalid regular expression: ${pattern}`);
  }
  const results: string[] = [];
  for (const e of await listTree(appId, rel, 5000)) {
    if (e.type !== "file" || (e.size ?? 0) > 300_000 || /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip|lock)$/i.test(e.path)) continue;
    const text = await fs.readFile(path.join(workspaceDir(appId), e.path), "utf8").catch(() => "");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        results.push(`${e.path}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
        if (results.length >= maxResults) return results;
      }
    }
  }
  return results;
}

/** Copies a directory tree, skipping platform-managed directories. */
async function copyTree(src: string, dst: string) {
  await fs.mkdir(dst, { recursive: true });
  let files = 0;
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(e.name) || e.name === ".DS_Store") continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) files += await copyTree(s, d);
    else if (e.isFile()) {
      await fs.copyFile(s, d);
      files++;
    }
  }
  return files;
}

export async function createWorkspaceFromTemplate(appId: string, templateDir: string) {
  return copyTree(templateDir, workspaceDir(appId));
}

export async function saveSnapshot(appId: string, snapshotId: number) {
  return copyTree(workspaceDir(appId), path.join(snapshotsDir(appId), String(snapshotId)));
}

/** Replaces workspace files with a snapshot (node_modules/.next volumes are untouched). */
export async function restoreSnapshot(appId: string, snapshotId: number) {
  const src = path.join(snapshotsDir(appId), String(snapshotId));
  if (!(await fs.stat(src).catch(() => null))) throw new HttpError(404, "Snapshot files are missing");
  const ws = workspaceDir(appId);
  for (const e of await fs.readdir(ws, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(e.name)) continue;
    await fs.rm(path.join(ws, e.name), { recursive: true, force: true });
  }
  return copyTree(src, ws);
}

export async function deleteSnapshotFiles(appId: string, snapshotId: number) {
  await fs.rm(path.join(snapshotsDir(appId), String(snapshotId)), { recursive: true, force: true });
}

/** All workspace files as [relativePath, Buffer] for zips and GitHub pushes. */
export async function collectFiles(appId: string) {
  const out: [string, Buffer][] = [];
  for (const e of await listTree(appId, "", 10_000)) {
    if (e.type === "file") out.push([e.path, await fs.readFile(path.join(workspaceDir(appId), e.path))]);
  }
  return out;
}
