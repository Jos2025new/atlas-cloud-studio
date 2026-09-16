import { describe, expect, it } from "vitest";
import {
  STUDIO_STORAGE_KEY, activateSession, addGenerationJob, addSession, createGenerationJob, createSession, deleteSession,
  loadStudioStore, normalizeGenerationStatus, recoverableJobs, renameSession, saveStudioStore,
  updateGenerationJob, updateSession,
} from "./studioStore";

class MemoryStorage { private data = new Map<string, string>(); getItem(key: string) { return this.data.get(key) ?? null; } setItem(key: string, value: string) { this.data.set(key, value); } }

describe("studioStore sessions", () => {
  it("persists the selected model and exact model params", () => {
    const storage = new MemoryStorage(); let store = loadStudioStore(storage); const id = store.activeSessionId;
    store = updateSession(store, id, (session) => ({ ...session, title: "Persistent", params: { ...session.params, temperature: 0.3, maxTokens: 2048 }, messages: [...session.messages, { id: "m1", role: "user", content: "Keep this", createdAt: new Date().toISOString() }] }));
    saveStudioStore(store, storage); const restored = loadStudioStore(storage);
    expect(restored.activeSessionId).toBe(id); expect(restored.sessions[0].messages.at(-1)?.content).toBe("Keep this"); expect(restored.sessions[0].selectedModel).toBe("deepseek-ai/deepseek-v3.2"); expect(restored.sessions[0].params).toMatchObject({ temperature: 0.3, maxTokens: 2048 });
  });

  it("migrates legacy model ids to the current verified default", () => {
    const storage = new MemoryStorage();
    storage.setItem(STUDIO_STORAGE_KEY, JSON.stringify({ version: 2, activeSessionId: "s1", sessions: [{ id: "s1", title: "Legacy", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), mode: "image", selectedModel: "seedream-3.0", messages: [], artifacts: [] }], jobs: [] }));
    const restored = loadStudioStore(storage);
    expect(restored.version).toBe(3); expect(restored.sessions[0].selectedModel).toBe("bytedance/seedream-v5.0-pro/text-to-image"); expect(restored.sessions[0].params.size).toBe("2048*1152");
  });

  it("creates, activates, renames and deletes sessions", () => {
    let store = loadStudioStore(new MemoryStorage()); const first = store.activeSessionId; const second = createSession({ title: "Second" });
    store = addSession(store, second); store = renameSession(store, second.id, "Renamed"); store = activateSession(store, first); store = deleteSession(store, first);
    expect(store.activeSessionId).toBe(second.id); expect(store.sessions[0].title).toBe("Renamed");
  });
});

describe("generation recovery", () => {
  it("persists provider request id and exact params before completion", () => {
    const storage = new MemoryStorage(); let store = loadStudioStore(storage);
    const params = { size: "2048*1152", outputFormat: "png", thinking: "enabled", promptOptimizationMode: "standard" };
    const job = createGenerationJob({ requestId: "pred_123", sessionId: store.activeSessionId, kind: "image", model: "bytedance/seedream-v5.0-pro/text-to-image", prompt: "A glass house", params, providerStatus: "queued" });
    store = addGenerationJob(store, job); saveStudioStore(store, storage); const restored = loadStudioStore(storage);
    expect(restored.jobs[0].requestId).toBe("pred_123"); expect(restored.jobs[0].params).toEqual(params); expect(recoverableJobs(restored)).toHaveLength(1);
  });
  it("deduplicates remote jobs", () => {
    let store = loadStudioStore(new MemoryStorage()); const job = createGenerationJob({ requestId: "same", sessionId: store.activeSessionId, kind: "video", model: "bytedance/seedance-2.0-fast/text-to-video", prompt: "Move", params: {} });
    store = addGenerationJob(store, job); store = addGenerationJob(store, { ...job, id: "duplicate" }); expect(store.jobs).toHaveLength(1);
  });
  it("removes terminal jobs from recovery", () => {
    let store = loadStudioStore(new MemoryStorage()); const job = createGenerationJob({ requestId: "done", sessionId: store.activeSessionId, kind: "image", model: "bytedance/seedream-v5.0-pro/text-to-image", prompt: "Done", params: {} });
    store = addGenerationJob(store, job); store = updateGenerationJob(store, job.id, { status: "completed", providerStatus: "succeeded", resultUrl: "https://example.test/a.png" });
    expect(recoverableJobs(store)).toHaveLength(0); expect(store.jobs[0].resultUrl).toContain("a.png");
  });
  it("normalizes Atlas provider statuses", () => {
    expect(normalizeGenerationStatus("queued")).toBe("pending"); expect(normalizeGenerationStatus("running")).toBe("processing"); expect(normalizeGenerationStatus("succeeded")).toBe("completed"); expect(normalizeGenerationStatus("cancelled")).toBe("failed");
  });
});
