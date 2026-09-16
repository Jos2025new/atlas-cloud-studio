import { describe, expect, it } from "vitest";
import {
  activateSession, addGenerationJob, addSession, createGenerationJob, createSession, deleteSession,
  loadStudioStore, normalizeGenerationStatus, recoverableJobs, renameSession, saveStudioStore,
  updateGenerationJob, updateSession,
} from "./studioStore";

class MemoryStorage { private data = new Map<string, string>(); getItem(key: string) { return this.data.get(key) ?? null; } setItem(key: string, value: string) { this.data.set(key, value); } }

describe("studioStore sessions", () => {
  it("persists and restores the active conversation", () => {
    const storage = new MemoryStorage(); let store = loadStudioStore(storage); const id = store.activeSessionId;
    store = updateSession(store, id, (s) => ({ ...s, title: "Persistent", selectedModel: "qwen3-235b-a22b", messages: [...s.messages, { id: "m1", role: "user", content: "Keep this", createdAt: new Date().toISOString() }] }));
    saveStudioStore(store, storage); const restored = loadStudioStore(storage);
    expect(restored.activeSessionId).toBe(id); expect(restored.sessions[0].messages.at(-1)?.content).toBe("Keep this"); expect(restored.sessions[0].selectedModel).toBe("qwen3-235b-a22b");
  });
  it("creates, activates, renames and deletes sessions", () => {
    let store = loadStudioStore(new MemoryStorage()); const first = store.activeSessionId; const second = createSession({ title: "Second" });
    store = addSession(store, second); store = renameSession(store, second.id, "Renamed"); store = activateSession(store, first); store = deleteSession(store, first);
    expect(store.activeSessionId).toBe(second.id); expect(store.sessions[0].title).toBe("Renamed");
  });
});

describe("generation recovery", () => {
  it("persists provider request id before completion", () => {
    const storage = new MemoryStorage(); let store = loadStudioStore(storage);
    const job = createGenerationJob({ requestId: "pred_123", sessionId: store.activeSessionId, kind: "image", model: "seedream-3.0", prompt: "A glass house", params: { aspectRatio: "1:1" }, providerStatus: "queued" });
    store = addGenerationJob(store, job); saveStudioStore(store, storage); const restored = loadStudioStore(storage);
    expect(restored.jobs[0].requestId).toBe("pred_123"); expect(recoverableJobs(restored)).toHaveLength(1);
  });
  it("deduplicates remote jobs", () => {
    let store = loadStudioStore(new MemoryStorage()); const job = createGenerationJob({ requestId: "same", sessionId: store.activeSessionId, kind: "video", model: "wan-2.1", prompt: "Move", params: {} });
    store = addGenerationJob(store, job); store = addGenerationJob(store, { ...job, id: "duplicate" }); expect(store.jobs).toHaveLength(1);
  });
  it("removes terminal jobs from recovery", () => {
    let store = loadStudioStore(new MemoryStorage()); const job = createGenerationJob({ requestId: "done", sessionId: store.activeSessionId, kind: "image", model: "seedream-3.0", prompt: "Done", params: {} });
    store = addGenerationJob(store, job); store = updateGenerationJob(store, job.id, { status: "completed", providerStatus: "succeeded", resultUrl: "https://example.test/a.png" });
    expect(recoverableJobs(store)).toHaveLength(0); expect(store.jobs[0].resultUrl).toContain("a.png");
  });
  it("normalizes Atlas provider statuses", () => {
    expect(normalizeGenerationStatus("queued")).toBe("pending"); expect(normalizeGenerationStatus("running")).toBe("processing"); expect(normalizeGenerationStatus("succeeded")).toBe("completed"); expect(normalizeGenerationStatus("cancelled")).toBe("failed");
  });
});
