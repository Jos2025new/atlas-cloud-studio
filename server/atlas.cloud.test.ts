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

  it("builds a verified DeepSeek chat request from registry params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "deepseek-ai/deepseek-v3.2",
      choices: [{ message: { content: "A concise answer" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await appRouter.createCaller(createContext()).atlas.chat({
      apiKey: "apikey-test",
      model: "deepseek-ai/deepseek-v3.2",
      messages: [{ role: "user", content: "Hello" }],
      params: { temperature: 0.4, maxTokens: 2048 },
    });

    expect(result.content).toBe("A concise answer");
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.atlascloud.ai/v1/chat/completions");
    expect(JSON.parse(String(request.body))).toMatchObject({ model: "deepseek-ai/deepseek-v3.2", temperature: 0.4, max_tokens: 2048 });
  });

  it("uploads an image to Atlas as multipart media", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ url: "https://temporary.atlas/ref.png" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await appRouter.createCaller(createContext()).atlas.uploadMedia({
      apiKey: "apikey-test",
      fileName: "ref.png",
      mimeType: "image/png",
      base64: Buffer.from("fake-image-bytes").toString("base64"),
    });

    expect(result.url).toBe("https://temporary.atlas/ref.png");
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.atlascloud.ai/api/v1/model/uploadMedia");
    expect((request.headers as Record<string, string>).Authorization).toBe("Bearer apikey-test");
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).get("file")).toBeInstanceOf(Blob);
  });

  it("maps Seedream parameters to the documented Atlas fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "pred_123", status: "queued" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await appRouter.createCaller(createContext()).atlas.generateImage({
      apiKey: "apikey-test",
      model: "bytedance/seedream-v5.0-pro/text-to-image",
      prompt: "A quiet glass house in the forest",
      params: { size: "2048*1152", outputFormat: "png", thinking: "enabled", promptOptimizationMode: "fast" },
    });

    expect(result).toEqual({ id: "pred_123", status: "queued", model: "bytedance/seedream-v5.0-pro/text-to-image" });
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({ size: "2048*1152", output_format: "png", thinking: "enabled", prompt_optimization_mode: "fast" });
  });

  it("routes a Seedream reference through the edit model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "pred_edit", status: "queued" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await appRouter.createCaller(createContext()).atlas.generateImage({
      apiKey: "apikey-test",
      model: "bytedance/seedream-v5.0-pro/text-to-image",
      prompt: "Make the sky warmer",
      params: { size: "2048*1152", outputFormat: "png", thinking: "enabled", promptOptimizationMode: "standard" },
      referenceUrl: "https://temporary.atlas/ref.png",
    });

    expect(result.model).toBe("bytedance/seedream-v5.0-pro/edit");
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({ model: "bytedance/seedream-v5.0-pro/edit", images: ["https://temporary.atlas/ref.png"] });
  });

  it("routes a Seedance reference through image-to-video", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "pred_video", status: "processing" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await appRouter.createCaller(createContext()).atlas.generateVideo({
      apiKey: "apikey-test",
      model: "bytedance/seedance-2.0-fast/text-to-video",
      prompt: "A slow tracking shot",
      params: { duration: 8, resolution: "1080p-SR", ratio: "adaptive", generateAudio: true, bitrateMode: "high", seed: -1, watermark: false, returnLastFrame: true },
      referenceUrl: "https://temporary.atlas/ref.png",
    });
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(result.model).toBe("bytedance/seedance-2.0-fast/image-to-video");
    expect(body).toMatchObject({ model: "bytedance/seedance-2.0-fast/image-to-video", image: "https://temporary.atlas/ref.png", duration: 8, resolution: "1080p-SR", ratio: "adaptive", generate_audio: true, bitrate_mode: "high", return_last_frame: true });
    expect(body).not.toHaveProperty("aspect_ratio");
  });

  it("blocks incompatible fields", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(appRouter.createCaller(createContext()).atlas.generateVideo({
      apiKey: "apikey-test",
      model: "bytedance/seedance-2.0-fast/text-to-video",
      prompt: "Invalid request",
      params: { outputFormat: "png" },
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("surfaces provider authentication errors clearly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 })));
    await expect(appRouter.createCaller(createContext()).atlas.chat({
      apiKey: "bad-key",
      model: "deepseek-ai/deepseek-v3.2",
      messages: [{ role: "user", content: "Hello" }],
      params: { temperature: 0.7, maxTokens: 1024 },
    })).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid API key" });
  });
});
