import { describe, expect, it } from "vitest";
import { buildAtlasRequestParams, defaultModelForMode, defaultParamsForModel, validateModelParams } from "./atlasModels";

describe("Atlas model registry", () => {
  it("provides one verified default model for each current studio mode", () => {
    expect(defaultModelForMode("chat").id).toBe("deepseek-ai/deepseek-v3.2");
    expect(defaultModelForMode("image").id).toBe("bytedance/seedream-v5.0-pro/text-to-image");
    expect(defaultModelForMode("video").id).toBe("bytedance/seedance-2.0-fast/text-to-video");
  });

  it("maps Seedream UI params to the Atlas payload", () => {
    const payload = buildAtlasRequestParams("bytedance/seedream-v5.0-pro/text-to-image", {
      ...defaultParamsForModel("bytedance/seedream-v5.0-pro/text-to-image"),
      outputFormat: "jpeg",
      promptOptimizationMode: "fast",
    });
    expect(payload).toMatchObject({ size: "2048*1152", output_format: "jpeg", thinking: "enabled", prompt_optimization_mode: "fast" });
  });

  it("maps Seedance controls without using the old aspect_ratio field", () => {
    const payload = buildAtlasRequestParams("bytedance/seedance-2.0-fast/text-to-video", {
      ...defaultParamsForModel("bytedance/seedance-2.0-fast/text-to-video"),
      ratio: "9:16",
      generateAudio: false,
    });
    expect(payload).toMatchObject({ duration: 5, resolution: "720p", ratio: "9:16", generate_audio: false, bitrate_mode: "standard" });
    expect(payload).not.toHaveProperty("aspect_ratio");
  });

  it("rejects unsupported and out-of-range parameters", () => {
    expect(() => validateModelParams("bytedance/seedream-v5.0-pro/text-to-image", { duration: 5 })).toThrow(/not supported/i);
    expect(() => validateModelParams("deepseek-ai/deepseek-v3.2", { temperature: 3 })).toThrow(/at most 2/i);
  });
});
