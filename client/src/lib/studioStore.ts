export type StudioMode = "chat" | "image" | "video";
export type GenerationKind = "image" | "video";

export type ChatRequestConfig = {
  model: string;
  temperature: number;
  maxTokens: number;
};

export type StudioMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  config?: ChatRequestConfig;
};

export type StudioArtifact = {
  id: string;
  kind: GenerationKind;
  url: string;
  prompt: string;
  model: string;
  createdAt: string;
  params: Record<string, unknown>;
};

export type StudioSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  mode: StudioMode;
  selectedModel: string;
  messages: StudioMessage[];
  artifacts: StudioArtifact[];
};

export type StudioStore = {
  version: 1;
  activeSessionId: string;
  sessions: StudioSession[];
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;
export const STUDIO_STORAGE_KEY = "atlas_cloud_studio_state_v1";
const DEFAULT_WELCOME = "Welcome to Atlas Cloud Studio. Ask anything, or switch to Image and Video to make something visual.";

const now = () => new Date().toISOString();

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function createMessage(role: StudioMessage["role"], content: string, config?: ChatRequestConfig): StudioMessage {
  return { id: createId("msg"), role, content, createdAt: now(), ...(config ? { config } : {}) };
}

export function createArtifact(input: Omit<StudioArtifact, "id" | "createdAt">): StudioArtifact {
  return { ...input, id: createId("artifact"), createdAt: now() };
}

export function createSession(options: Partial<Pick<StudioSession, "title" | "mode" | "selectedModel">> = {}): StudioSession {
  const timestamp = now();
  return {
    id: createId("session"),
    title: options.title?.trim() || "Untitled session",
    createdAt: timestamp,
    updatedAt: timestamp,
    mode: options.mode ?? "chat",
    selectedModel: options.selectedModel ?? "deepseek-v3",
    messages: [createMessage("assistant", DEFAULT_WELCOME)],
    artifacts: [],
  };
}

export function createEmptyStore(): StudioStore {
  const session = createSession();
  return { version: 1, activeSessionId: session.id, sessions: [session] };
}

function isSession(value: unknown): value is StudioSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<StudioSession>;
  return typeof session.id === "string"
    && typeof session.title === "string"
    && typeof session.createdAt === "string"
    && typeof session.updatedAt === "string"
    && ["chat", "image", "video"].includes(String(session.mode))
    && typeof session.selectedModel === "string"
    && Array.isArray(session.messages)
    && Array.isArray(session.artifacts);
}

export function normalizeStore(value: unknown): StudioStore {
  if (!value || typeof value !== "object") return createEmptyStore();
  const candidate = value as Partial<StudioStore>;
  const sessions = Array.isArray(candidate.sessions) ? candidate.sessions.filter(isSession) : [];
  if (!sessions.length) return createEmptyStore();
  const activeSessionId = sessions.some((session) => session.id === candidate.activeSessionId)
    ? String(candidate.activeSessionId)
    : sessions[0].id;
  return { version: 1, activeSessionId, sessions };
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
  try {
    storage.setItem(STUDIO_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage failure must not break the workspace.
  }
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
  if (!sessions.length) return createEmptyStore();
  const activeSessionId = store.activeSessionId === sessionId ? sessions[0].id : store.activeSessionId;
  return { ...store, activeSessionId, sessions };
}

export function titleFromPrompt(prompt: string) {
  const clean = prompt.replace(/\s+/g, " ").trim();
  return clean.length > 48 ? `${clean.slice(0, 47)}…` : clean || "Untitled session";
}
