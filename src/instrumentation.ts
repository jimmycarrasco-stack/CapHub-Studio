/**
 * Starts the background worker once per server process: automation steps that are due
 * (after "Wait" steps) run every 15 seconds.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.CAPHUB_DISABLE_WORKER === "1") return;
  const g = globalThis as unknown as { __caphubWorker?: NodeJS.Timeout };
  if (g.__caphubWorker) return;
  const { startWorker } = await import("./lib/crm/worker");
  g.__caphubWorker = startWorker();
}
