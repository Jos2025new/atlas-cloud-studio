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

const seedreamParams = {
  size: "2048*1152",
  outputFormat: "png",
  thinking: "enabled",
  promptOptimizationMode: "standard",
};

const seedanceParams = {
  duration: 8,
  resolution: "1080p-SR",
  ratio: "adaptive",
  generateAudio: true,
  bitrateMode: "high",
  seed: -1,
  watermark: false,
  returnLastFrame: true,
};

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
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: "deepseek-ai/deepseek-v3.2",
      temperature: 0.4,
      max_tokens: 2048,
    });
  });

  it("uploads an image to Atlas as multipart media", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: "https://temporary.atlas/ref.png" }), { status: 200 }),
    );
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
  });

  it("routes ordered Seedream references through edit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "pred_edit", status: "queued" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const references = [
      "https://temporary.atlas/one.png",
      "https://temporary.atlas/two.png",
      "https://temporary.atlas/three.png",
    ];

    const result = await appRouter.createCaller(createContext()).atlas.generateImage({
      apiKey: "apikey-test",
      model: "bytedance/seedream-v5.0-pro/text-to-image",
      prompt: "Combine image 1 and image 2, using image 3 for material",
      params: seedreamParams,
      referenceUrls: references,
    });

    expect(result.model).toBe("bytedance/seedream-v5.0-pro/edit");
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: "bytedance/seedream-v5.0-pro/edit",
      images: references,
    });
  });

  it("routes one Seedance image and final frame through image-to-video", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "pred_video", status: "processing" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await appRouter.createCaller(createContext()).atlas.generateVideo({
      apiKey: "apikey-test",
      model: "bytedance/seedance-2.0-fast/text-to-video",
      prompt: "Move from start to end",
      params: seedanceParams,
      referenceUrls: ["https://temporary.atlas/start.png"],
      finalFrameUrl: "https://temporary.atlas/end.png",
    });

    expect(result.model).toBe("bytedance/seedance-2.0-fast/image-to-video");
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(body).toMatchObject({
      model: "bytedance/seedance-2.0-fast/image-to-video",
      image: "https://temporary.atlas/start.png",
      last_image: "https://temporary.atlas/end.png",
      duration: 8,
      ratio: "adaptive",
    });
  });

  it("routes multiple Seedance images through reference-to-video in order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "pred_multi", status: "queued" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const references = [
      "https://temporary.atlas/character.png",
      "https://temporary.atlas/style.png",
    ];

    const result = await appRouter.createCaller(createContext()).atlas.generateVideo({
      apiKey: "apikey-test",
      model: "bytedance/seedance-2.0-fast/text-to-video",
      prompt: "Use image 1 as the subject and image 2 as visual guidance",
      params: seedanceParams,
      referenceUrls: references,
    });

    expect(result.model).toBe("bytedance/seedance-2.0-fast/reference-to-video");
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({
      model: "bytedance/seedance-2.0-fast/reference-to-video",
      reference_images: references,
    });
  });

  it("blocks final frame with multi-reference Seedance", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(appRouter.createCaller(createContext()).atlas.generateVideo({
      apiKey: "apikey-test",
      model: "bytedance/seedance-2.0-fast/text-to-video",
      prompt: "Invalid combination",
      params: seedanceParams,
      referenceUrls: ["https://example.test/1.png", "https://example.test/2.png"],
      finalFrameUrl: "https://example.test/end.png",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("blocks incompatible model params", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(appRouter.createCaller(createContext()).atlas.generateVideo({
      apiKey: "apikey-test",
      model: "bytedance/seedance-2.0-fast/text-to-video",
      prompt: "Invalid request",
      params: { outputFormat: "png" },
      referenceUrls: [],
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("surfaces provider authentication errors clearly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Invalid API key" }), { status: 401 }),
    ));
    await expect(appRouter.createCaller(createContext()).atlas.chat({
      apiKey: "bad-key",
      model: "deepseek-ai/deepseek-v3.2",
      messages: [{ role: "user", content: "Hello" }],
      params: { temperature: 0.7, maxTokens: 1024 },
    })).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid API key" });
  });
});
