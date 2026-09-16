import { describe, expect, it } from "vitest";
import {
  activateSession,
  addSession,
  createSession,
  deleteSession,
  loadStudioStore,
  renameSession,
  saveStudioStore,
  updateSession,
} from "./studioStore";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

describe("studioStore sessions", () => {
  it("persists and restores messages, results and configuration", () => {
    const storage = new MemoryStorage();
    let store = loadStudioStore(storage);
    const id = store.activeSessionId;
    store = updateSession(store, id, (session) => ({
      ...session,
      title: "Persistent session",
      selectedModel: "qwen3-235b-a22b",
      messages: [...session.messages, { id: "m1", role: "user", content: "Keep this", createdAt: new Date().toISOString() }],
      artifacts: [{ id: "a1", kind: "image", url: "https://example.test/a.png", prompt: "A", model: "seedream-3.0", createdAt: new Date().toISOString(), params: { aspectRatio: "1:1" } }],
    }));
    saveStudioStore(store, storage);

    const restored = loadStudioStore(storage);
    expect(restored.activeSessionId).toBe(id);
    expect(restored.sessions[0].messages.at(-1)?.content).toBe("Keep this");
    expect(restored.sessions[0].artifacts[0].params).toEqual({ aspectRatio: "1:1" });
    expect(restored.sessions[0].selectedModel).toBe("qwen3-235b-a22b");
  });

  it("creates, opens, renames and deletes sessions", () => {
    let store = loadStudioStore(new MemoryStorage());
    const first = store.activeSessionId;
    const second = createSession({ title: "Second" });
    store = addSession(store, second);
    store = renameSession(store, second.id, "Renamed");
    expect(store.sessions.find((s) => s.id === second.id)?.title).toBe("Renamed");
    store = activateSession(store, first);
    expect(store.activeSessionId).toBe(first);
    store = deleteSession(store, first);
    expect(store.activeSessionId).toBe(second.id);
  });
});
