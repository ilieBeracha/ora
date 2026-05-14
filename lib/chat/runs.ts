export type ChatRunScope = {
  companyId: string;
  userId: string;
};

export type ChatRunStatus = "running" | "complete" | "error" | "cancelled";

export type ChatRunEventType =
  | "run"
  | "session"
  | "status"
  | "tool"
  | "complete"
  | "error"
  | "cancelled";

export type ChatRunEvent = {
  id: number;
  runId: string;
  type: ChatRunEventType;
  data: unknown;
  createdAt: string;
};

type ChatRun = {
  id: string;
  companyId: string;
  userId: string;
  status: ChatRunStatus;
  controller: AbortController;
  events: ChatRunEvent[];
  createdAt: number;
  updatedAt: number;
};

const maxRunAgeMs = 15 * 60 * 1000;
const maxEventsPerRun = 120;

const globalForRuns = globalThis as unknown as {
  oraChatRuns?: Map<string, ChatRun>;
};

const runs = globalForRuns.oraChatRuns ?? new Map<string, ChatRun>();
globalForRuns.oraChatRuns = runs;

export function createChatRun(scope: ChatRunScope) {
  pruneOldRuns();

  const run: ChatRun = {
    id: crypto.randomUUID(),
    companyId: scope.companyId,
    userId: scope.userId,
    status: "running",
    controller: new AbortController(),
    events: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  runs.set(run.id, run);

  return run;
}

export function getChatRun(runId: string, scope: ChatRunScope) {
  const run = runs.get(runId);

  if (!run) return null;
  if (run.companyId !== scope.companyId || run.userId !== scope.userId) {
    return null;
  }

  return run;
}

export function cancelChatRun(runId: string, scope: ChatRunScope) {
  const run = getChatRun(runId, scope);

  if (!run || run.status !== "running") return false;

  run.controller.abort();
  run.updatedAt = Date.now();

  return true;
}

export function emitChatRunEvent(
  runId: string,
  type: ChatRunEventType,
  data: unknown,
) {
  const run = runs.get(runId);

  if (!run) {
    return {
      id: 0,
      runId,
      type,
      data,
      createdAt: new Date().toISOString(),
    } satisfies ChatRunEvent;
  }

  const event = {
    id: run.events.length + 1,
    runId,
    type,
    data,
    createdAt: new Date().toISOString(),
  } satisfies ChatRunEvent;

  run.events.push(event);
  run.events = run.events.slice(-maxEventsPerRun);
  run.updatedAt = Date.now();

  if (type === "complete") run.status = "complete";
  if (type === "error") run.status = "error";
  if (type === "cancelled") run.status = "cancelled";

  return event;
}

export function getChatRunEvents(runId: string, scope: ChatRunScope) {
  return getChatRun(runId, scope)?.events ?? [];
}

function pruneOldRuns() {
  const cutoff = Date.now() - maxRunAgeMs;

  for (const [runId, run] of runs) {
    if (run.updatedAt < cutoff) {
      runs.delete(runId);
    }
  }
}
