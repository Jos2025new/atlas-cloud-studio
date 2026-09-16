import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("atlas proxy", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends OpenAI-compatible chat requests with a bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "deepseek-v3",
      choices: [{ message: { content: "A concise answer" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await appRouter.createCaller(createContext()).atlas.chat({
      apiKey: "sk-test",
      model: "deepseek-v3",
      messages: [{ role: "user", content: "Hello" }],
    });

    expect(result.content).toBe("A concise answer");
    expect(result.usage?.total_tokens).toBe(16);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.atlascloud.ai/v1/chat/completions");
    expect((request.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(String(request.body))).toMatchObject({ model: "deepseek-v3", max_tokens: 800 });
  });

  it("returns a prediction id for image generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "pred_123", status: "queued" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await appRouter.createCaller(createContext()).atlas.generateImage({
      apiKey: "sk-test",
      model: "seedream-3.0",
      prompt: "A quiet glass house in the forest",
      aspectRatio: "1:1",
    });

    expect(result).toEqual({ id: "pred_123", status: "queued" });
    expect(fetchMock).toHaveBeenCalledWith("https://api.atlascloud.ai/api/v1/model/generateImage", expect.objectContaining({ method: "POST" }));
  });

  it("surfaces provider authentication errors clearly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 })));

    await expect(appRouter.createCaller(createContext()).atlas.chat({
      apiKey: "bad-key",
      model: "deepseek-v3",
      messages: [{ role: "user", content: "Hello" }],
    })).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid API key" });
  });
});
