import { describe, expect, it } from "vitest";
import { getReferenceCapabilities, resolveReferenceRequest } from "./atlasReferenceModels";

describe("advanced Atlas reference routing", () => {
  it("keeps text-to-image when no references are selected", () => {
    expect(resolveReferenceRequest("bytedance/seedream-v5.0-pro/text-to-image", "image")).toEqual({
      modelId: "bytedance/seedream-v5.0-pro/text-to-image",
      referencePayload: {},
    });
  });

  it("preserves ordered Seedream references", () => {
    const references = ["https://example.test/1.png", "https://example.test/2.png", "https://example.test/3.png"];
    const resolved = resolveReferenceRequest("bytedance/seedream-v5.0-pro/text-to-image", "image", references);
    expect(resolved.modelId).toBe("bytedance/seedream-v5.0-pro/edit");
    expect(resolved.referencePayload).toEqual({ images: references });
    expect(getReferenceCapabilities("bytedance/seedream-v5.0-pro/text-to-image")).toMatchObject({ maxReferences: 10, ordered: true, roles: false });
  });

  it("uses image-to-video for one start image and supports last_image", () => {
    const resolved = resolveReferenceRequest(
      "bytedance/seedance-2.0-fast/text-to-video",
      "video",
      ["https://example.test/start.png"],
      "https://example.test/end.png",
    );
    expect(resolved.modelId).toBe("bytedance/seedance-2.0-fast/image-to-video");
    expect(resolved.referencePayload).toEqual({
      image: "https://example.test/start.png",
      last_image: "https://example.test/end.png",
    });
  });

  it("routes two or more Seedance images to ordered reference-to-video", () => {
    const references = ["https://example.test/a.png", "https://example.test/b.png"];
    const resolved = resolveReferenceRequest("bytedance/seedance-2.0-fast/text-to-video", "video", references);
    expect(resolved.modelId).toBe("bytedance/seedance-2.0-fast/reference-to-video");
    expect(resolved.referencePayload).toEqual({ reference_images: references });
  });

  it("blocks unsupported final-frame and over-limit combinations", () => {
    expect(() => resolveReferenceRequest(
      "bytedance/seedance-2.0-fast/text-to-video",
      "video",
      ["https://example.test/a.png", "https://example.test/b.png"],
      "https://example.test/end.png",
    )).toThrow(/cannot be combined/i);

    expect(() => resolveReferenceRequest(
      "bytedance/seedream-v5.0-pro/text-to-image",
      "image",
      Array.from({ length: 11 }, (_, index) => `https://example.test/${index}.png`),
    )).toThrow(/at most 10/i);
  });
});
