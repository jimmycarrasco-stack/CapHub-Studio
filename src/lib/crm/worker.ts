import { processDueRuns, recoverStuckRuns } from "./automations";

export function startWorker() {
  try {
    recoverStuckRuns();
  } catch (err) {
    // DB not ready (e.g. missing APP_SECRET during a build) — the interval retries.
    console.error("[caphub] worker startup", (err as Error).message);
  }
  const tick = () => void processDueRuns().catch((e) => console.error("[caphub] automations", e));
  setTimeout(tick, 2000);
  return setInterval(tick, 15_000);
}
