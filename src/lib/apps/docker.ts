import "server-only";
import { spawn } from "node:child_process";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const MAX_CAPTURE = 2_000_000;

/**
 * Runs the docker CLI (works with Docker Desktop, Colima and OrbStack, which all provide `docker`).
 * Never uses a shell on the host: arguments are passed as an array.
 */
export function docker(args: string[], opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const cap = (cur: string, chunk: Buffer) => (cur.length > MAX_CAPTURE ? cur : cur + chunk.toString("utf8"));
    child.stdout.on("data", (c: Buffer) => (stdout = cap(stdout, c)));
    child.stderr.on("data", (c: Buffer) => (stderr = cap(stderr, c)));

    const kill = () => child.kill("SIGKILL");
    const timer = opts.timeoutMs ? setTimeout(() => ((timedOut = true), kill()), opts.timeoutMs) : null;
    opts.signal?.addEventListener("abort", kill, { once: true });

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      const missing = (err as NodeJS.ErrnoException).code === "ENOENT";
      resolve({ code: 127, stdout, stderr: missing ? "docker CLI not found. Install Docker Desktop or Colima." : err.message, timedOut });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", kill);
      resolve({ code: code ?? 1, stdout, stderr, timedOut });
    });
  });
}

/** Like docker(), but throws with stderr on a non-zero exit. */
export async function dockerOk(args: string[], opts: { timeoutMs?: number } = {}) {
  const r = await docker(args, opts);
  if (r.code !== 0) throw new Error(`docker ${args[0]} failed: ${(r.stderr || r.stdout).trim().slice(0, 800)}`);
  return r.stdout.trim();
}

export async function dockerStatus() {
  const r = await docker(["version", "--format", "{{.Server.Version}}"], { timeoutMs: 10_000 });
  if (r.code !== 0) {
    const notRunning = /Cannot connect|daemon|connection refused|no such file/i.test(r.stderr);
    return {
      available: false,
      version: null as string | null,
      error:
        r.code === 127
          ? "Docker isn't installed. On a Mac: `brew install colima docker && colima start` (or install Docker Desktop)."
          : notRunning
            ? "Docker is installed but not running. Start it with `colima start` (or open Docker Desktop)."
            : r.stderr.trim().slice(0, 300),
    };
  }
  return { available: true, version: r.stdout.trim(), error: null as string | null };
}

/** Strips ANSI colour codes from container output. */
export function stripAnsi(s: string) {
  return s.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

/** Keeps the start and end of long output so errors at either end survive. */
export function clip(s: string, max = 12_000) {
  if (s.length <= max) return s;
  const head = Math.floor(max * 0.3);
  return `${s.slice(0, head)}\n\n… [${s.length - max} characters omitted] …\n\n${s.slice(-(max - head))}`;
}
