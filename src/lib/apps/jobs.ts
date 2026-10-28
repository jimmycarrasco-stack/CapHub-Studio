import "server-only";
import { getProvider } from "../llm";
import { HttpError } from "../errors";
import { runAgent, type AgentEvent } from "./agent";
import { addAppMessage, listAppMessages, requireApp } from "./repo";
import { appState, startApp, waitForHttp } from "./runtime";
import { takeSnapshot } from "./service";

/**
 * Agent turns run in the background (they can take several minutes), independent of the
 * HTTP request that started them. Clients subscribe to a job's event stream and can
 * reconnect after a reload. One job per app at a time.
 */

export interface Job {
  appId: string;
  prompt: string;
  events: AgentEvent[];
  done: boolean;
  controller: AbortController;
  listeners: Set<() => void>;
  startedAt: number;
}

const g = globalThis as unknown as { __caphubJobs?: Map<string, Job> };
const jobs = (g.__caphubJobs ??= new Map());

export function getJob(appId: string): Job | undefined {
  return jobs.get(appId);
}

export function isRunning(appId: string) {
  const j = jobs.get(appId);
  return !!j && !j.done;
}

function push(job: Job, e: AgentEvent) {
  job.events.push(e);
  for (const l of job.listeners) l();
}

export function startAgentJob(appId: string, prompt: string) {
  requireApp(appId);
  if (isRunning(appId)) throw new HttpError(409, "The AI is already working on this app. Wait for it to finish or stop it.");
  const provider = getProvider("default"); // throws a clear 400 if no API key

  const job: Job = { appId, prompt, events: [], done: false, controller: new AbortController(), listeners: new Set(), startedAt: Date.now() };
  jobs.set(appId, job);
  const history = listAppMessages(appId);
  addAppMessage(appId, "user", prompt);

  void (async () => {
    const emit = (e: AgentEvent) => push(job, e);
    try {
      if ((await appState(appId)) !== "running") {
        emit({ type: "status", message: "Starting the app container…" });
        await startApp(appId);
      }
      emit({ type: "status", message: "Waiting for the dev server…" });
      const up = await waitForHttp(requireApp(appId), 300_000, job.controller.signal);
      if (!up && !job.controller.signal.aborted) emit({ type: "status", message: "The dev server isn't responding yet — the AI will check the logs." });

      emit({ type: "status", message: `Working with ${provider.name} · ${provider.model}` });
      const result = await runAgent({ appId, provider, prompt, history, signal: job.controller.signal, emit });
      addAppMessage(appId, "assistant", result.summary, result.log);
      if (result.changed) await takeSnapshot(appId, prompt);
    } catch (err) {
      const stopped = (err as Error).name === "AbortError" || job.controller.signal.aborted;
      const message = stopped ? "Stopped." : (err as Error).message || "The AI run failed";
      addAppMessage(appId, "assistant", stopped ? "Stopped." : `⚠️ ${message}`);
      // Keep whatever was done before the stop/failure restorable.
      await takeSnapshot(appId, `${stopped ? "Stopped" : "Failed"}: ${prompt}`).catch(() => {});
      push(job, { type: "error", message });
    } finally {
      job.done = true;
      for (const l of job.listeners) l();
      // Let late subscribers read the final events, then forget the job.
      setTimeout(() => {
        if (jobs.get(appId) === job) jobs.delete(appId);
      }, 60_000);
    }
  })();

  return job;
}

export function cancelJob(appId: string) {
  const j = jobs.get(appId);
  if (j && !j.done) j.controller.abort();
}

/** NDJSON stream of a job's events from index `from`, ending when the job finishes. */
export function streamJob(appId: string, from = 0): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const job = jobs.get(appId);
      if (!job) {
        controller.enqueue(enc.encode(JSON.stringify({ type: "idle" }) + "\n"));
        controller.close();
        return;
      }
      let i = Math.max(0, from);
      let closed = false;
      const flush = () => {
        if (closed) return;
        try {
          while (i < job.events.length) controller.enqueue(enc.encode(JSON.stringify({ ...job.events[i], i: i++ }) + "\n"));
          if (job.done) {
            closed = true;
            job.listeners.delete(flush);
            controller.enqueue(enc.encode(JSON.stringify({ type: "end" }) + "\n"));
            controller.close();
          }
        } catch {
          closed = true;
          job.listeners.delete(flush);
        }
      };
      job.listeners.add(flush);
      flush();
    },
  });
}
