import "server-only";
import { HttpError } from "../errors";
import { containerName } from "./config";
import { docker } from "./docker";
import * as files from "./files";
import { appState } from "./runtime";

/**
 * Write path for project files that keeps the app's dev server in sync.
 *
 * On macOS, Docker runs in a VM and the project folder is shared into it. Changes made on the
 * Mac side of that share don't produce file-change events inside the VM, so `next dev` in the
 * container never notices them (e.g. a newly created component stays "Module not found").
 * While the container runs, we therefore perform writes and deletes inside it, which produces
 * native events. When it's stopped, we write on the host (it rescans on start).
 */

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

async function inContainer(appId: string, command: string, input?: string) {
  const r = await docker(["exec", "-i", containerName(appId), "bash", "/caphub.sh", "exec", command], { timeoutMs: 30_000, input });
  if (r.code !== 0) throw new HttpError(500, `Couldn't update the file inside the app container: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
}

export async function writeFile(appId: string, rel: string, content: string) {
  const { rel: r } = files.resolveInWorkspace(appId, rel);
  if (!r) throw new HttpError(400, "A file path is required");
  if (Buffer.byteLength(content) > files.MAX_FILE_BYTES) throw new HttpError(400, "File is too large");
  if ((await appState(appId)) !== "running") return files.writeFile(appId, r, content);
  // Validate on the host first (symlink escapes etc.), then write through the container.
  const existed = await files.readFile(appId, r).then(() => true, () => false);
  await inContainer(appId, `mkdir -p "$(dirname ${q(r)})" && cat > ${q(r)}`, content);
  return { created: !existed };
}

export async function editFile(appId: string, rel: string, oldStr: string, newStr: string, replaceAll = false) {
  const content = await files.readFile(appId, rel);
  if (!oldStr) throw new HttpError(400, "old_string must not be empty");
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new HttpError(400, `old_string was not found in ${rel}. Read the file again and copy the text exactly.`);
  if (count > 1 && !replaceAll) throw new HttpError(400, `old_string appears ${count} times in ${rel}; include more surrounding text or set replace_all.`);
  const next = replaceAll ? content.split(oldStr).join(newStr) : content.replace(oldStr, () => newStr);
  await writeFile(appId, rel, next);
  return { replacements: replaceAll ? count : 1 };
}

export async function deletePath(appId: string, rel: string) {
  const { rel: r } = files.resolveInWorkspace(appId, rel);
  if (!r) throw new HttpError(400, "Refusing to delete the project root");
  if ((await appState(appId)) !== "running") return files.deletePath(appId, r);
  await inContainer(appId, `rm -rf -- ${q(r)}`);
}

export const { readFile, listTree, formatTree, searchFiles } = files;
