import { assertModelMode, type AtlasModelMode } from "./atlasModels";

export type AtlasSingleReferenceDefinition = {
  baseModelId: string;
  referenceModelId: string;
  mode: Extract<AtlasModelMode, "image" | "video">;
  inputKey: "images" | "image";
  inputShape: "array" | "single";
};

export const ATLAS_SINGLE_REFERENCE_MODELS: AtlasSingleReferenceDefinition[] = [
  {
    baseModelId: "bytedance/seedream-v5.0-pro/text-to-image",
    referenceModelId: "bytedance/seedream-v5.0-pro/edit",
    mode: "image",
    inputKey: "images",
    inputShape: "array",
  },
  {
    baseModelId: "bytedance/seedance-2.0-fast/text-to-video",
    referenceModelId: "bytedance/seedance-2.0-fast/image-to-video",
    mode: "video",
    inputKey: "image",
    inputShape: "single",
  },
];

export function getSingleReferenceDefinition(modelId: string) {
  return ATLAS_SINGLE_REFERENCE_MODELS.find((definition) => definition.baseModelId === modelId);
}

export function supportsSingleReference(modelId: string) {
  return Boolean(getSingleReferenceDefinition(modelId));
}

export function resolveSingleReferenceRequest(modelId: string, mode: Extract<AtlasModelMode, "image" | "video">, referenceUrl?: string) {
  assertModelMode(modelId, mode);
  if (!referenceUrl) return { modelId, referencePayload: {} as Record<string, string | string[]> };

  const definition = getSingleReferenceDefinition(modelId);
  if (!definition || definition.mode !== mode) throw new Error(`Single-image references are not supported by ${modelId}.`);
  const referencePayload = definition.inputShape === "array"
    ? { [definition.inputKey]: [referenceUrl] }
    : { [definition.inputKey]: referenceUrl };
  return { modelId: definition.referenceModelId, referencePayload };
}
