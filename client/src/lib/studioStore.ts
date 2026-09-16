import {
  defaultModelForMode,
  defaultParamsForModel,
  getAtlasModel,
  validateModelParams,
  type AtlasModelMode,
} from "@shared/atlasModels";

export type StudioMode = AtlasModelMode;
export type GenerationKind = "image" | "video";
export type GenerationStatus = "pending" | "processing" | "completed" | "failed";
export type StudioReference = {
  id: string;
  url: string;
  name: string;
  source: "upload" | "artifact";
  createdAt: string;
  artifactId?: string;
};

export type ChatRequestConfig = { model: string; params: Record<string, unknown> };
export type StudioMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: string; config?: ChatRequestConfig };
export type StudioArtifact = {
  id: string;
  kind: GenerationKind;
  url: string;
  prompt: string;
  model: string;
  createdAt: string;
  params: Record<string, unknown>;
  generationJobId?: string;
  references: StudioReference[];
  finalFrame?: StudioReference;
};
export type StudioSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  mode: StudioMode;
  selectedModel: string;
  params: Record<string, unknown>;
  messages: StudioMessage[];
  artifacts: StudioArtifact[];
  references: StudioReference[];
  finalFrame?: StudioReference;
};
export type GenerationJob = {
  id: string;
  requestId: string;
  sessionId: string;
  kind: GenerationKind;
  model: string;
  prompt: string;
  params: Record<string, unknown>;
  status: GenerationStatus;
  providerStatus: string;
  createdAt: string;
  updatedAt: string;
  resultUrl?: string;
  error?: string;
  artifactId?: string;
  references: StudioReference[];
  finalFrame?: StudioReference;
};
export type StudioStore = { version: 5; activeSessionId: string; sessions: StudioSession[]; jobs: GenerationJob[] };

type StorageLike = Pick<Storage, "getItem" | "setItem">;
export const STUDIO_STORAGE_KEY = "atlas_cloud_studio_state_v1";
const DEFAULT_WELCOME = "Welcome to Atlas Cloud Studio. Ask anything, or switch to Image and Video to make something visual.";
const now = () => new Date().toISOString();

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
function browserStorage(): StorageLike | null { try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; } }

export function createMessage(role: StudioMessage["role"], content: string, config?: ChatRequestConfig): StudioMessage {
  return { id: createId("msg"), role, content, createdAt: now(), ...(config ? { config } : {}) };
}
export function createReference(input: Omit<StudioReference, "id" | "createdAt">): StudioReference {
  return { ...input, id: createId("reference"), createdAt: now() };
}
export function createArtifact(input: Omit<StudioArtifact, "id" | "createdAt" | "references"> & { references?: StudioReference[] }): StudioArtifact {
  return { ...input, references: input.references ?? [], id: createId("artifact"), createdAt: now() };
}
export function createSession(options: Partial<Pick<StudioSession, "title" | "mode" | "selectedModel" | "params" | "references" | "finalFrame">> = {}): StudioSession {
  const timestamp = now();
  const mode = options.mode ?? "chat";
  const requestedModel = options.selectedModel ? getAtlasModel(options.selectedModel) : undefined;
  const model = requestedModel?.mode === mode ? requestedModel : defaultModelForMode(mode);
  let params = defaultParamsForModel(model.id);
  if (options.params) {
    try { params = validateModelParams(model.id, { ...params, ...options.params }); } catch {}
  }
  return {
    id: createId("session"),
    title: options.title?.trim() || "Untitled session",
    createdAt: timestamp,
    updatedAt: timestamp,
    mode,
    selectedModel: model.id,
    params,
    messages: [createMessage("assistant", DEFAULT_WELCOME)],
    artifacts: [],
    references: options.references ?? [],
    ...(options.finalFrame ? { finalFrame: options.finalFrame } : {}),
  };
}
export function normalizeGenerationStatus(status: string): GenerationStatus {
  const value = status.trim().toLowerCase();
  if (["completed", "succeeded", "success"].includes(value)) return "completed";
  if (["failed", "error", "canceled", "cancelled"].includes(value)) return "failed";
  if (["pending", "queued", "queue", "submitted"].includes(value)) return "pending";
  return "processing";
}
export function createGenerationJob(input: {
  requestId: string;
  sessionId: string;
  kind: GenerationKind;
  model: string;
  prompt: string;
  params: Record<string, unknown>;
  providerStatus?: string;
  references?: StudioReference[];
  finalFrame?: StudioReference;
}): GenerationJob {
  const timestamp = now();
  const providerStatus = input.providerStatus || "pending";
  return {
    ...input,
    references: input.references ?? [],
    id: createId("job"),
    status: normalizeGenerationStatus(providerStatus),
    providerStatus,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
export function createEmptyStore(): StudioStore {
  const session = createSession();
  return { version: 5, activeSessionId: session.id, sessions: [session], jobs: [] };
}

function normalizeReference(value: unknown): StudioReference | undefined {
  if (!value || typeof value !== "object") return undefined;
  const reference = value as Partial<StudioReference>;
  if (
    typeof reference.id !== "string" ||
    typeof reference.url !== "string" ||
    typeof reference.name !== "string" ||
    !["upload", "artifact"].includes(String(reference.source)) ||
    typeof reference.createdAt !== "string"
  ) return undefined;
  return reference as StudioReference;
}
function normalizeReferences(value: unknown, legacyReference?: unknown): StudioReference[] {
  if (Array.isArray(value)) return value.map(normalizeReference).filter((item): item is StudioReference => Boolean(item));
  const legacy = normalizeReference(legacyReference);
  return legacy ? [legacy] : [];
}
function normalizeArtifact(value: unknown): StudioArtifact | null {
  if (!value || typeof value !== "object") return null;
  const artifact = value as Partial<StudioArtifact> & { reference?: unknown };
  if (
    typeof artifact.id !== "string" ||
    !["image", "video"].includes(String(artifact.kind)) ||
    typeof artifact.url !== "string" ||
    typeof artifact.prompt !== "string" ||
    typeof artifact.model !== "string" ||
    typeof artifact.createdAt !== "string" ||
    !artifact.params ||
    typeof artifact.params !== "object"
  ) return null;
  return {
    ...artifact,
    references: normalizeReferences(artifact.references, artifact.reference),
    finalFrame: normalizeReference(artifact.finalFrame),
  } as StudioArtifact;
}
function normalizeSession(value: unknown): StudioSession | null {
  if (!value || typeof value !== "object") return null;
  const session = value as Partial<StudioSession> & { reference?: unknown };
  if (
    typeof session.id !== "string" ||
    typeof session.title !== "string" ||
    typeof session.createdAt !== "string" ||
    typeof session.updatedAt !== "string" ||
    !["chat", "image", "video"].includes(String(session.mode)) ||
    !Array.isArray(session.messages) ||
    !Array.isArray(session.artifacts)
  ) return null;
  const mode = session.mode as StudioMode;
  const currentModel = typeof session.selectedModel === "string" ? getAtlasModel(session.selectedModel) : undefined;
  const model = currentModel?.mode === mode ? currentModel : defaultModelForMode(mode);
  let params = defaultParamsForModel(model.id);
  if (session.params && typeof session.params === "object" && !Array.isArray(session.params)) {
    try { params = validateModelParams(model.id, { ...params, ...session.params }); } catch {}
  }
  const artifacts = session.artifacts.map(normalizeArtifact).filter((artifact): artifact is StudioArtifact => Boolean(artifact));
  return {
    ...session,
    mode,
    selectedModel: model.id,
    params,
    messages: session.messages as StudioMessage[],
    artifacts,
    references: normalizeReferences(session.references, session.reference),
    finalFrame: normalizeReference(session.finalFrame),
  } as StudioSession;
}
function normalizeJob(value: unknown): GenerationJob | null {
  if (!value || typeof value !== "object") return null;
  const job = value as Partial<GenerationJob> & { reference?: unknown };
  if (
    typeof job.id !== "string" ||
    typeof job.requestId !== "string" ||
    typeof job.sessionId !== "string" ||
    !["image", "video"].includes(String(job.kind)) ||
    typeof job.model !== "string" ||
    typeof job.prompt !== "string" ||
    !job.params ||
    typeof job.params !== "object" ||
    !["pending", "processing", "completed", "failed"].includes(String(job.status)) ||
    typeof job.providerStatus !== "string" ||
    typeof job.createdAt !== "string" ||
    typeof job.updatedAt !== "string"
  ) return null;
  return {
    ...job,
    references: normalizeReferences(job.references, job.reference),
    finalFrame: normalizeReference(job.finalFrame),
  } as GenerationJob;
}
export function normalizeStore(value: unknown): StudioStore {
  if (!value || typeof value !== "object") return createEmptyStore();
  const candidate = value as { activeSessionId?: unknown; sessions?: unknown[]; jobs?: unknown[] };
  const sessions = Array.isArray(candidate.sessions)
    ? candidate.sessions.map(normalizeSession).filter((session): session is StudioSession => Boolean(session))
    : [];
  if (!sessions.length) return createEmptyStore();
  const activeSessionId = sessions.some((session) => session.id === candidate.activeSessionId)
    ? String(candidate.activeSessionId)
    : sessions[0].id;
  const ids = new Set(sessions.map((session) => session.id));
  const jobs = Array.isArray(candidate.jobs)
    ? candidate.jobs.map(normalizeJob).filter((job): job is GenerationJob => Boolean(job)).filter((job) => ids.has(job.sessionId))
    : [];
  return { version: 5, activeSessionId, sessions, jobs };
}
export function loadStudioStore(storage: StorageLike | null = browserStorage()): StudioStore {
  if (!storage) return createEmptyStore();
  try {
    const raw = storage.getItem(STUDIO_STORAGE_KEY);
    return raw ? normalizeStore(JSON.parse(raw)) : createEmptyStore();
  } catch {
    return createEmptyStore();
  }
}
export function saveStudioStore(store: StudioStore, storage: StorageLike | null = browserStorage()) {
  if (!storage) return;
  try { storage.setItem(STUDIO_STORAGE_KEY, JSON.stringify(store)); } catch {}
}
export function updateSession(store: StudioStore, sessionId: string, updater: (session: StudioSession) => StudioSession): StudioStore {
  let changed = false;
  const sessions = store.sessions.map((session) => {
    if (session.id !== sessionId) return session;
    changed = true;
    return { ...updater(session), updatedAt: now() };
  });
  return changed ? { ...store, sessions } : store;
}
export function addSession(store: StudioStore, session = createSession()): StudioStore {
  return { ...store, activeSessionId: session.id, sessions: [session, ...store.sessions] };
}
export function activateSession(store: StudioStore, sessionId: string): StudioStore {
  return store.sessions.some((session) => session.id === sessionId) ? { ...store, activeSessionId: sessionId } : store;
}
export function renameSession(store: StudioStore, sessionId: string, title: string): StudioStore {
  const clean = title.trim();
  return clean ? updateSession(store, sessionId, (session) => ({ ...session, title: clean })) : store;
}
export function deleteSession(store: StudioStore, sessionId: string): StudioStore {
  const sessions = store.sessions.filter((session) => session.id !== sessionId);
  const jobs = store.jobs.filter((job) => job.sessionId !== sessionId);
  if (!sessions.length) return createEmptyStore();
  return {
    ...store,
    activeSessionId: store.activeSessionId === sessionId ? sessions[0].id : store.activeSessionId,
    sessions,
    jobs,
  };
}
export function addGenerationJob(store: StudioStore, job: GenerationJob): StudioStore {
  return store.jobs.some((existing) => existing.requestId === job.requestId)
    ? store
    : { ...store, jobs: [job, ...store.jobs] };
}
export function updateGenerationJob(
  store: StudioStore,
  jobId: string,
  patch: Partial<Omit<GenerationJob, "id" | "requestId" | "sessionId" | "createdAt">>,
): StudioStore {
  let changed = false;
  const jobs = store.jobs.map((job) => {
    if (job.id !== jobId) return job;
    changed = true;
    return { ...job, ...patch, updatedAt: now() };
  });
  return changed ? { ...store, jobs } : store;
}
export function recoverableJobs(store: StudioStore) {
  return store.jobs.filter((job) => job.status === "pending" || job.status === "processing");
}
export function titleFromPrompt(prompt: string) {
  const clean = prompt.replace(/\s+/g, " ").trim();
  return clean.length > 48 ? `${clean.slice(0, 47)}…` : clean || "Untitled session";
}
