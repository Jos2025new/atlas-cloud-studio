import { describe, expect, it } from "vitest";
import {
  STUDIO_STORAGE_KEY,
  activateSession,
  addGenerationJob,
  addSession,
  createGenerationJob,
  createReference,
  createSession,
  deleteSession,
  loadStudioStore,
  normalizeGenerationStatus,
  recoverableJobs,
  renameSession,
  saveStudioStore,
  updateGenerationJob,
  updateSession,
} from "./studioStore";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

describe("studioStore sessions", () => {
  it("persists ordered references and a final frame", () => {
    const storage = new MemoryStorage();
    let store = loadStudioStore(storage);
    const id = store.activeSessionId;
    const first = createReference({ url: "https://example.test/1.png", name: "1.png", source: "upload" });
    const second = createReference({ url: "https://example.test/2.png", name: "2.png", source: "upload" });
    const finalFrame = createReference({ url: "https://example.test/end.png", name: "end.png", source: "upload" });

    store = updateSession(store, id, (session) => ({ ...session, references: [first, second], finalFrame }));
    saveStudioStore(store, storage);
    const restored = loadStudioStore(storage);

    expect(restored.version).toBe(5);
    expect(restored.sessions[0].references.map((reference) => reference.url)).toEqual([first.url, second.url]);
    expect(restored.sessions[0].finalFrame?.url).toBe(finalFrame.url);
  });

  it("migrates the v4 singular reference into the ordered array", () => {
    const storage = new MemoryStorage();
    const reference = createReference({ url: "https://example.test/legacy.png", name: "legacy.png", source: "upload" });
    storage.setItem(STUDIO_STORAGE_KEY, JSON.stringify({
      version: 4,
      activeSessionId: "s1",
      sessions: [{
        id: "s1",
        title: "Legacy",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mode: "image",
        selectedModel: "bytedance/seedream-v5.0-pro/text-to-image",
        params: { size: "2048*1152", outputFormat: "png", thinking: "enabled", promptOptimizationMode: "standard" },
        messages: [],
        artifacts: [],
        reference,
      }],
      jobs: [],
    }));
    const restored = loadStudioStore(storage);
    expect(restored.version).toBe(5);
    expect(restored.sessions[0].references).toHaveLength(1);
    expect(restored.sessions[0].references[0].url).toBe(reference.url);
  });

  it("creates, activates, renames and deletes sessions", () => {
    let store = loadStudioStore(new MemoryStorage());
    const first = store.activeSessionId;
    const second = createSession({ title: "Second" });
    store = addSession(store, second);
    store = renameSession(store, second.id, "Renamed");
    store = activateSession(store, first);
    store = deleteSession(store, first);
    expect(store.activeSessionId).toBe(second.id);
    expect(store.sessions[0].title).toBe("Renamed");
  });
});

describe("generation recovery", () => {
  it("persists provider request id, ordered references and final frame before completion", () => {
    const storage = new MemoryStorage();
    let store = loadStudioStore(storage);
    const first = createReference({ url: "https://example.test/start.png", name: "start.png", source: "upload" });
    const finalFrame = createReference({ url: "https://example.test/end.png", name: "end.png", source: "upload" });
    const job = createGenerationJob({
      requestId: "pred_123",
      sessionId: store.activeSessionId,
      kind: "video",
      model: "bytedance/seedance-2.0-fast/image-to-video",
      prompt: "Move from start to end",
      params: {},
      references: [first],
      finalFrame,
      providerStatus: "queued",
    });
    store = addGenerationJob(store, job);
    saveStudioStore(store, storage);
    const restored = loadStudioStore(storage);
    expect(restored.jobs[0].requestId).toBe("pred_123");
    expect(restored.jobs[0].references[0].url).toBe(first.url);
    expect(restored.jobs[0].finalFrame?.url).toBe(finalFrame.url);
    expect(recoverableJobs(restored)).toHaveLength(1);
  });

  it("deduplicates remote jobs", () => {
    let store = loadStudioStore(new MemoryStorage());
    const job = createGenerationJob({
      requestId: "same",
      sessionId: store.activeSessionId,
      kind: "video",
      model: "bytedance/seedance-2.0-fast/reference-to-video",
      prompt: "Move",
      params: {},
    });
    store = addGenerationJob(store, job);
    store = addGenerationJob(store, { ...job, id: "duplicate" });
    expect(store.jobs).toHaveLength(1);
  });

  it("removes terminal jobs from recovery", () => {
    let store = loadStudioStore(new MemoryStorage());
    const job = createGenerationJob({
      requestId: "done",
      sessionId: store.activeSessionId,
      kind: "image",
      model: "bytedance/seedream-v5.0-pro/text-to-image",
      prompt: "Done",
      params: {},
    });
    store = addGenerationJob(store, job);
    store = updateGenerationJob(store, job.id, {
      status: "completed",
      providerStatus: "succeeded",
      resultUrl: "https://example.test/a.png",
    });
    expect(recoverableJobs(store)).toHaveLength(0);
    expect(store.jobs[0].resultUrl).toContain("a.png");
  });

  it("normalizes Atlas provider statuses", () => {
    expect(normalizeGenerationStatus("queued")).toBe("pending");
    expect(normalizeGenerationStatus("running")).toBe("processing");
    expect(normalizeGenerationStatus("succeeded")).toBe("completed");
    expect(normalizeGenerationStatus("cancelled")).toBe("failed");
  });
});
