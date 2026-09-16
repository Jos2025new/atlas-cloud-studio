import { describe, expect, it } from "vitest";
import { resolveSingleReferenceRequest, supportsSingleReference } from "./atlasReferenceModels";

describe("single-reference Atlas routing", () => {
  it("keeps text-to-image when no reference is selected", () => {
    const resolved = resolveSingleReferenceRequest("bytedance/seedream-v5.0-pro/text-to-image", "image");
    expect(resolved).toEqual({ modelId: "bytedance/seedream-v5.0-pro/text-to-image", referencePayload: {} });
  });

  it("routes Seedream to edit with a single images entry", () => {
    const resolved = resolveSingleReferenceRequest("bytedance/seedream-v5.0-pro/text-to-image", "image", "https://example.test/input.png");
    expect(resolved.modelId).toBe("bytedance/seedream-v5.0-pro/edit");
    expect(resolved.referencePayload).toEqual({ images: ["https://example.test/input.png"] });
  });

  it("routes Seedance to image-to-video with image", () => {
    const resolved = resolveSingleReferenceRequest("bytedance/seedance-2.0-fast/text-to-video", "video", "https://example.test/input.png");
    expect(resolved.modelId).toBe("bytedance/seedance-2.0-fast/image-to-video");
    expect(resolved.referencePayload).toEqual({ image: "https://example.test/input.png" });
    expect(supportsSingleReference("bytedance/seedance-2.0-fast/text-to-video")).toBe(true);
  });
});
