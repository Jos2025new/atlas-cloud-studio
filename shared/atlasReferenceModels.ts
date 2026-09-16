import { assertModelMode, type AtlasModelMode } from "./atlasModels";

export type AtlasReferenceCapabilities = {
  maxReferences: number;
  ordered: boolean;
  roles: boolean;
  finalFrame: boolean;
};

export type AtlasReferenceResolution = {
  modelId: string;
  referencePayload: Record<string, string | string[]>;
};

const IMAGE_BASE = "bytedance/seedream-v5.0-pro/text-to-image";
const IMAGE_EDIT = "bytedance/seedream-v5.0-pro/edit";
const VIDEO_BASE = "bytedance/seedance-2.0-fast/text-to-video";
const VIDEO_I2V = "bytedance/seedance-2.0-fast/image-to-video";
const VIDEO_REFERENCE = "bytedance/seedance-2.0-fast/reference-to-video";

export const ATLAS_REFERENCE_CAPABILITIES: Record<string, AtlasReferenceCapabilities> = {
  [IMAGE_BASE]: { maxReferences: 10, ordered: true, roles: false, finalFrame: false },
  [VIDEO_BASE]: { maxReferences: 9, ordered: true, roles: false, finalFrame: true },
};

export function getReferenceCapabilities(modelId: string): AtlasReferenceCapabilities {
  return ATLAS_REFERENCE_CAPABILITIES[modelId] ?? {
    maxReferences: 0,
    ordered: false,
    roles: false,
    finalFrame: false,
  };
}

export function supportsReferences(modelId: string) {
  return getReferenceCapabilities(modelId).maxReferences > 0;
}

export function referenceRouteLabel(mode: Extract<AtlasModelMode, "image" | "video">, referenceCount: number) {
  if (mode === "image") return referenceCount > 0 ? "Image edit" : "Text to image";
  if (referenceCount === 0) return "Text to video";
  return referenceCount === 1 ? "Image to video" : "Reference to video";
}

export function resolveReferenceRequest(
  modelId: string,
  mode: Extract<AtlasModelMode, "image" | "video">,
  referenceUrls: string[] = [],
  finalFrameUrl?: string,
): AtlasReferenceResolution {
  assertModelMode(modelId, mode);
  const capabilities = getReferenceCapabilities(modelId);

  if (referenceUrls.length > capabilities.maxReferences) {
    throw new Error(`${modelId} supports at most ${capabilities.maxReferences} image references.`);
  }

  if (mode === "image") {
    if (finalFrameUrl) throw new Error("Final frame is only supported for video generation.");
    if (!referenceUrls.length) return { modelId, referencePayload: {} };
    if (modelId !== IMAGE_BASE) throw new Error(`Image references are not supported by ${modelId}.`);
    return { modelId: IMAGE_EDIT, referencePayload: { images: referenceUrls } };
  }

  if (!referenceUrls.length) {
    if (finalFrameUrl) throw new Error("A final frame requires exactly one starting image.");
    return { modelId, referencePayload: {} };
  }

  if (referenceUrls.length === 1) {
    if (modelId !== VIDEO_BASE) throw new Error(`Image references are not supported by ${modelId}.`);
    return {
      modelId: VIDEO_I2V,
      referencePayload: {
        image: referenceUrls[0],
        ...(finalFrameUrl ? { last_image: finalFrameUrl } : {}),
      },
    };
  }

  if (finalFrameUrl) {
    throw new Error("Final frame cannot be combined with Seedance multi-reference mode; use exactly one starting image.");
  }
  if (modelId !== VIDEO_BASE) throw new Error(`Image references are not supported by ${modelId}.`);
  return {
    modelId: VIDEO_REFERENCE,
    referencePayload: { reference_images: referenceUrls },
  };
}
