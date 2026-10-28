import "server-only";
import { decrypt, encrypt } from "../crypto";
import { db } from "../db";
import { HttpError } from "../errors";
import { slugify } from "../site-builder";
import { collectFiles } from "./files";
import { requireApp, updateApp } from "./repo";

/**
 * Pushes an app's source to GitHub using the REST git-data API (no git binary needed).
 * Each push is one commit that makes the repo's default branch match the project exactly.
 */

const API = "https://api.github.com";

export function getGithubToken(): { token: string | null; source: "settings" | "env" | "none" } {
  const row = db().prepare("SELECT value FROM settings WHERE key = 'github_token'").get() as { value: string } | undefined;
  if (row) {
    try {
      return { token: decrypt(row.value), source: "settings" };
    } catch {
      /* APP_SECRET changed */
    }
  }
  const env = process.env.GITHUB_TOKEN?.trim();
  return env ? { token: env, source: "env" } : { token: null, source: "none" };
}

export function setGithubToken(token: string | null) {
  if (token === null) db().prepare("DELETE FROM settings WHERE key = 'github_token'").run();
  else
    db()
      .prepare("INSERT INTO settings (key, value) VALUES ('github_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(encrypt(token.trim()));
}

async function gh<T>(token: string, method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "caphub-studio",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

async function ghOk<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const r = await gh<T & { message?: string }>(token, method, path, body);
  if (r.status >= 300) {
    const hint = r.status === 401 ? " — the GitHub token is invalid or expired" : r.status === 403 || r.status === 404 ? " — the token may lack access to this repository (needs Contents: read & write)" : "";
    throw new HttpError(502, `GitHub ${method} ${path} failed (${r.status}): ${r.data.message ?? "error"}${hint}`);
  }
  return r.data;
}

export async function pushToGithub(appId: string, opts: { repo?: string; private?: boolean; message?: string }) {
  const { token } = getGithubToken();
  if (!token) throw new HttpError(400, "Add a GitHub token in Settings → AI & runtime → GitHub first");
  const app = requireApp(appId);

  const me = await ghOk<{ login: string }>(token, "GET", "/user");
  const target = (opts.repo?.trim() || app.github_repo || `${me.login}/${slugify(app.name)}`).replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(target)) throw new HttpError(400, "Repository must look like owner/name");
  const [owner, name] = target.split("/");

  // Find or create the repository (auto_init gives it a first commit so the git data API works).
  let repo = await gh<{ default_branch: string; html_url: string; message?: string }>(token, "GET", `/repos/${owner}/${name}`);
  if (repo.status === 404) {
    const createPath = owner.toLowerCase() === me.login.toLowerCase() ? "/user/repos" : `/orgs/${owner}/repos`;
    await ghOk(token, "POST", createPath, { name, private: opts.private ?? true, auto_init: true, description: `${app.name} — built with CapHub Studio` });
    repo = await gh(token, "GET", `/repos/${owner}/${name}`);
  }
  if (repo.status >= 300) throw new HttpError(502, `Couldn't access ${target}: ${repo.data.message ?? repo.status}`);
  const branch = repo.data.default_branch || "main";

  // Current head (an empty repo has none: seed it with a README first).
  let ref = await gh<{ object: { sha: string } }>(token, "GET", `/repos/${owner}/${name}/git/ref/heads/${branch}`);
  if (ref.status === 404 || ref.status === 409) {
    await ghOk(token, "PUT", `/repos/${owner}/${name}/contents/README.md`, { message: "Initial commit", content: Buffer.from(`# ${app.name}\n`).toString("base64"), branch });
    ref = await gh(token, "GET", `/repos/${owner}/${name}/git/ref/heads/${branch}`);
  }
  if (ref.status >= 300) throw new HttpError(502, `Couldn't read branch ${branch} of ${target}`);
  const parent = ref.data.object.sha;

  // Blobs → tree (full tree, so files deleted in the project are deleted in the repo) → commit → move branch.
  const files = await collectFiles(appId);
  const tree: { path: string; mode: string; type: string; sha: string }[] = [];
  for (const [p, data] of files) {
    const blob = await ghOk<{ sha: string }>(token, "POST", `/repos/${owner}/${name}/git/blobs`, { content: data.toString("base64"), encoding: "base64" });
    tree.push({ path: p, mode: "100644", type: "blob", sha: blob.sha });
  }
  const newTree = await ghOk<{ sha: string }>(token, "POST", `/repos/${owner}/${name}/git/trees`, { tree });
  const commit = await ghOk<{ sha: string }>(token, "POST", `/repos/${owner}/${name}/git/commits`, {
    message: opts.message?.trim() || `Update from CapHub Studio`,
    tree: newTree.sha,
    parents: [parent],
  });
  await ghOk(token, "PATCH", `/repos/${owner}/${name}/git/refs/heads/${branch}`, { sha: commit.sha });

  updateApp(appId, { github_repo: `${owner}/${name}` });
  return { repo: `${owner}/${name}`, url: repo.data.html_url, branch, commit: commit.sha, files: files.length };
}
