export type StudioMode = "chat" | "image" | "video";
export type GenerationKind = "image" | "video";
export type GenerationStatus = "pending" | "processing" | "completed" | "failed";

export type ChatRequestConfig = { model: string; temperature: number; maxTokens: number };
export type StudioMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: string; config?: ChatRequestConfig };
export type StudioArtifact = { id: string; kind: GenerationKind; url: string; prompt: string; model: string; createdAt: string; params: Record<string, unknown>; generationJobId?: string };
export type StudioSession = { id: string; title: string; createdAt: string; updatedAt: string; mode: StudioMode; selectedModel: string; messages: StudioMessage[]; artifacts: StudioArtifact[] };
export type GenerationJob = { id: string; requestId: string; sessionId: string; kind: GenerationKind; model: string; prompt: string; params: Record<string, unknown>; status: GenerationStatus; providerStatus: string; createdAt: string; updatedAt: string; resultUrl?: string; error?: string; artifactId?: string };
export type StudioStore = { version: 2; activeSessionId: string; sessions: StudioSession[]; jobs: GenerationJob[] };

type StorageLike = Pick<Storage, "getItem" | "setItem">;
export const STUDIO_STORAGE_KEY = "atlas_cloud_studio_state_v1";
const DEFAULT_WELCOME = "Welcome to Atlas Cloud Studio. Ask anything, or switch to Image and Video to make something visual.";
const now = () => new Date().toISOString();

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
function browserStorage(): StorageLike | null { try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; } }

export function createMessage(role: StudioMessage["role"], content: string, config?: ChatRequestConfig): StudioMessage { return { id: createId("msg"), role, content, createdAt: now(), ...(config ? { config } : {}) }; }
export function createArtifact(input: Omit<StudioArtifact, "id" | "createdAt">): StudioArtifact { return { ...input, id: createId("artifact"), createdAt: now() }; }
export function createSession(options: Partial<Pick<StudioSession, "title" | "mode" | "selectedModel">> = {}): StudioSession {
  const timestamp = now();
  return { id: createId("session"), title: options.title?.trim() || "Untitled session", createdAt: timestamp, updatedAt: timestamp, mode: options.mode ?? "chat", selectedModel: options.selectedModel ?? "deepseek-v3", messages: [createMessage("assistant", DEFAULT_WELCOME)], artifacts: [] };
}
export function normalizeGenerationStatus(status: string): GenerationStatus {
  const value = status.trim().toLowerCase();
  if (["completed", "succeeded", "success"].includes(value)) return "completed";
  if (["failed", "error", "canceled", "cancelled"].includes(value)) return "failed";
  if (["pending", "queued", "queue", "submitted"].includes(value)) return "pending";
  return "processing";
}
export function createGenerationJob(input: { requestId: string; sessionId: string; kind: GenerationKind; model: string; prompt: string; params: Record<string, unknown>; providerStatus?: string }): GenerationJob {
  const timestamp = now(); const providerStatus = input.providerStatus || "pending";
  return { ...input, id: createId("job"), status: normalizeGenerationStatus(providerStatus), providerStatus, createdAt: timestamp, updatedAt: timestamp };
}
export function createEmptyStore(): StudioStore { const session = createSession(); return { version: 2, activeSessionId: session.id, sessions: [session], jobs: [] }; }

function isSession(value: unknown): value is StudioSession {
  if (!value || typeof value !== "object") return false; const s = value as Partial<StudioSession>;
  return typeof s.id === "string" && typeof s.title === "string" && typeof s.createdAt === "string" && typeof s.updatedAt === "string" && ["chat", "image", "video"].includes(String(s.mode)) && typeof s.selectedModel === "string" && Array.isArray(s.messages) && Array.isArray(s.artifacts);
}
function isJob(value: unknown): value is GenerationJob {
  if (!value || typeof value !== "object") return false; const j = value as Partial<GenerationJob>;
  return typeof j.id === "string" && typeof j.requestId === "string" && typeof j.sessionId === "string" && ["image", "video"].includes(String(j.kind)) && typeof j.model === "string" && typeof j.prompt === "string" && !!j.params && typeof j.params === "object" && ["pending", "processing", "completed", "failed"].includes(String(j.status)) && typeof j.providerStatus === "string" && typeof j.createdAt === "string" && typeof j.updatedAt === "string";
}
export function normalizeStore(value: unknown): StudioStore {
  if (!value || typeof value !== "object") return createEmptyStore();
  const candidate = value as Partial<StudioStore> & { jobs?: unknown[] };
  const sessions = Array.isArray(candidate.sessions) ? candidate.sessions.filter(isSession) : [];
  if (!sessions.length) return createEmptyStore();
  const activeSessionId = sessions.some((s) => s.id === candidate.activeSessionId) ? String(candidate.activeSessionId) : sessions[0].id;
  const ids = new Set(sessions.map((s) => s.id));
  const jobs = Array.isArray(candidate.jobs) ? candidate.jobs.filter(isJob).filter((job) => ids.has(job.sessionId)) : [];
  return { version: 2, activeSessionId, sessions, jobs };
}
export function loadStudioStore(storage: StorageLike | null = browserStorage()): StudioStore { if (!storage) return createEmptyStore(); try { const raw = storage.getItem(STUDIO_STORAGE_KEY); return raw ? normalizeStore(JSON.parse(raw)) : createEmptyStore(); } catch { return createEmptyStore(); } }
export function saveStudioStore(store: StudioStore, storage: StorageLike | null = browserStorage()) { if (!storage) return; try { storage.setItem(STUDIO_STORAGE_KEY, JSON.stringify(store)); } catch {} }
export function updateSession(store: StudioStore, sessionId: string, updater: (session: StudioSession) => StudioSession): StudioStore { let changed = false; const sessions = store.sessions.map((s) => { if (s.id !== sessionId) return s; changed = true; return { ...updater(s), updatedAt: now() }; }); return changed ? { ...store, sessions } : store; }
export function addSession(store: StudioStore, session = createSession()): StudioStore { return { ...store, activeSessionId: session.id, sessions: [session, ...store.sessions] }; }
export function activateSession(store: StudioStore, sessionId: string): StudioStore { return store.sessions.some((s) => s.id === sessionId) ? { ...store, activeSessionId: sessionId } : store; }
export function renameSession(store: StudioStore, sessionId: string, title: string): StudioStore { const clean = title.trim(); return clean ? updateSession(store, sessionId, (s) => ({ ...s, title: clean })) : store; }
export function deleteSession(store: StudioStore, sessionId: string): StudioStore { const sessions = store.sessions.filter((s) => s.id !== sessionId); const jobs = store.jobs.filter((j) => j.sessionId !== sessionId); if (!sessions.length) return createEmptyStore(); return { ...store, activeSessionId: store.activeSessionId === sessionId ? sessions[0].id : store.activeSessionId, sessions, jobs }; }
export function addGenerationJob(store: StudioStore, job: GenerationJob): StudioStore { return store.jobs.some((existing) => existing.requestId === job.requestId) ? store : { ...store, jobs: [job, ...store.jobs] }; }
export function updateGenerationJob(store: StudioStore, jobId: string, patch: Partial<Omit<GenerationJob, "id" | "requestId" | "sessionId" | "createdAt">>): StudioStore { let changed = false; const jobs = store.jobs.map((job) => { if (job.id !== jobId) return job; changed = true; return { ...job, ...patch, updatedAt: now() }; }); return changed ? { ...store, jobs } : store; }
export function recoverableJobs(store: StudioStore) { return store.jobs.filter((job) => job.status === "pending" || job.status === "processing"); }
export function titleFromPrompt(prompt: string) { const clean = prompt.replace(/\s+/g, " ").trim(); return clean.length > 48 ? `${clean.slice(0, 47)}…` : clean || "Untitled session"; }
