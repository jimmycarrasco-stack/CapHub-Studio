import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { dataDir } from "../apps/config";
import { db } from "../db";
import { HttpError } from "../errors";

/**
 * Files library per sub-account (email attachments). Stored under data/files/<locationId>/<id>;
 * names and types are kept in the database and never used as paths.
 */

export interface CrmFile {
  id: string;
  location_id: string;
  name: string;
  mime: string;
  size: number;
  created_at: string;
}

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_ATTACH_TOTAL = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

// Executables and scripts are refused (mail providers block them anyway).
const BLOCKED_EXT = /\.(exe|msi|bat|cmd|com|scr|js|jse|vbs|vbe|ps1|sh|jar|app|dmg|pkg|apk|dll|cpl|hta|lnk|reg)$/i;

const fileDir = (locationId: string) => path.join(dataDir(), "files", locationId.replace(/[^\w-]/g, ""));
const filePath = (f: Pick<CrmFile, "id" | "location_id">) => path.join(fileDir(f.location_id), f.id.replace(/[^\w-]/g, ""));

export function cleanFileName(name: string) {
  const base = path.basename(name.replace(/\\/g, "/")).replace(/[\u0000-\u001f<>:"|?*]/g, "_").trim();
  return (base || "file").slice(0, 150);
}

export function listFiles(locationId: string): CrmFile[] {
  return db().prepare("SELECT * FROM crm_files WHERE location_id = ? ORDER BY created_at DESC").all(locationId) as CrmFile[];
}

export function getFile(id: string): CrmFile | null {
  return (db().prepare("SELECT * FROM crm_files WHERE id = ?").get(id) as CrmFile | undefined) ?? null;
}

export async function saveFile(locationId: string, name: string, mime: string, data: Buffer): Promise<CrmFile> {
  const clean = cleanFileName(name);
  if (BLOCKED_EXT.test(clean)) throw new HttpError(400, "That file type can't be attached to emails");
  if (!data.length) throw new HttpError(400, "The file is empty");
  if (data.length > MAX_FILE_BYTES) throw new HttpError(413, "Files can be up to 15 MB");
  const id = nanoid(14);
  await mkdir(fileDir(locationId), { recursive: true });
  await writeFile(filePath({ id, location_id: locationId }), data);
  db()
    .prepare("INSERT INTO crm_files (id, location_id, name, mime, size) VALUES (?, ?, ?, ?, ?)")
    .run(id, locationId, clean, (mime || "application/octet-stream").slice(0, 120), data.length);
  return getFile(id)!;
}

export async function readFileData(f: CrmFile) {
  return readFile(filePath(f));
}

export async function deleteFile(f: CrmFile) {
  db().prepare("DELETE FROM crm_files WHERE id = ?").run(f.id);
  await rm(filePath(f), { force: true });
}

/** Resolves attachment ids for a send, checking they belong to the sub-account and fit the limits. */
export function resolveAttachments(locationId: string, ids: string[] | undefined) {
  const unique = [...new Set(ids ?? [])];
  if (unique.length > MAX_ATTACHMENTS) throw new HttpError(400, `Attach up to ${MAX_ATTACHMENTS} files`);
  const files = unique.map((id) => {
    const f = getFile(id);
    if (!f || f.location_id !== locationId) throw new HttpError(400, "An attached file no longer exists");
    return f;
  });
  if (files.reduce((n, f) => n + f.size, 0) > MAX_ATTACH_TOTAL) throw new HttpError(400, "Attachments can total up to 20 MB");
  return files.map((f) => ({ ...f, path: filePath(f) }));
}
