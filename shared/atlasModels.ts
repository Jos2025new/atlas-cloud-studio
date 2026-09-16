export type AtlasModelMode = "chat" | "image" | "video";
export type AtlasParameterValue = string | number | boolean;

export type AtlasParameterOption = {
  value: string | number;
  label: string;
};

export type AtlasParameterDefinition = {
  key: string;
  apiKey: string;
  label: string;
  type: "select" | "number" | "boolean";
  defaultValue: AtlasParameterValue;
  options?: AtlasParameterOption[];
  min?: number;
  max?: number;
  integer?: boolean;
};

export type AtlasModelCapabilities = {
  chat: boolean;
  textToImage: boolean;
  textToVideo: boolean;
  references: boolean;
  finalFrame: boolean;
  resolutions: string[];
  durations: number[];
};

export type AtlasModelDefinition = {
  id: string;
  label: string;
  note: string;
  mode: AtlasModelMode;
  capabilities: AtlasModelCapabilities;
  parameters: AtlasParameterDefinition[];
};

const EMPTY_CAPABILITIES: AtlasModelCapabilities = {
  chat: false,
  textToImage: false,
  textToVideo: false,
  references: false,
  finalFrame: false,
  resolutions: [],
  durations: [],
};

const seedanceDurations = [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const seedanceResolutions = ["480p", "720p", "720p-SR", "1080p-SR", "1440p-SR"];

export const ATLAS_MODELS: AtlasModelDefinition[] = [
  {
    id: "deepseek-ai/deepseek-v3.2",
    label: "DeepSeek V3.2",
    note: "Chat · OpenAI-compatible",
    mode: "chat",
    capabilities: { ...EMPTY_CAPABILITIES, chat: true },
    parameters: [
      { key: "temperature", apiKey: "temperature", label: "Temperature", type: "number", defaultValue: 0.7, min: 0, max: 2 },
      { key: "maxTokens", apiKey: "max_tokens", label: "Max output tokens", type: "number", defaultValue: 1024, min: 64, max: 32767, integer: true },
    ],
  },
  {
    id: "bytedance/seedream-v5.0-pro/text-to-image",
    label: "Seedream 5.0 Pro",
    note: "Text to image · production",
    mode: "image",
    capabilities: { ...EMPTY_CAPABILITIES, textToImage: true },
    parameters: [
      {
        key: "size",
        apiKey: "size",
        label: "Size",
        type: "select",
        defaultValue: "2048*1152",
        options: ["1024*1024", "1536*1536", "1776*1328", "1328*1776", "2048*1152", "1152*2048", "2048*2048", "2304*1728", "1728*2304", "2720*1530", "1530*2720", "2496*1664", "1664*2496"].map((value) => ({ value, label: value })),
      },
      { key: "outputFormat", apiKey: "output_format", label: "Format", type: "select", defaultValue: "png", options: [{ value: "png", label: "PNG" }, { value: "jpeg", label: "JPEG" }] },
      { key: "thinking", apiKey: "thinking", label: "Prompt thinking", type: "select", defaultValue: "enabled", options: [{ value: "enabled", label: "Enabled" }, { value: "disabled", label: "Disabled" }] },
      { key: "promptOptimizationMode", apiKey: "prompt_optimization_mode", label: "Prompt optimization", type: "select", defaultValue: "standard", options: [{ value: "standard", label: "Standard" }, { value: "fast", label: "Fast" }] },
    ],
  },
  {
    id: "bytedance/seedance-2.0-fast/text-to-video",
    label: "Seedance 2.0 Fast",
    note: "Text to video · native audio",
    mode: "video",
    capabilities: {
      ...EMPTY_CAPABILITIES,
      textToVideo: true,
      resolutions: seedanceResolutions,
      durations: seedanceDurations,
    },
    parameters: [
      { key: "duration", apiKey: "duration", label: "Duration", type: "select", defaultValue: 5, options: seedanceDurations.map((value) => ({ value, label: value === -1 ? "Auto" : `${value}s` })) },
      { key: "resolution", apiKey: "resolution", label: "Resolution", type: "select", defaultValue: "720p", options: seedanceResolutions.map((value) => ({ value, label: value })) },
      { key: "ratio", apiKey: "ratio", label: "Aspect ratio", type: "select", defaultValue: "16:9", options: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"].map((value) => ({ value, label: value })) },
      { key: "generateAudio", apiKey: "generate_audio", label: "Generate audio", type: "boolean", defaultValue: true },
      { key: "bitrateMode", apiKey: "bitrate_mode", label: "Bitrate", type: "select", defaultValue: "standard", options: [{ value: "standard", label: "Standard" }, { value: "high", label: "High" }] },
      { key: "seed", apiKey: "seed", label: "Seed", type: "number", defaultValue: -1, min: -1, max: 4294967295, integer: true },
      { key: "watermark", apiKey: "watermark", label: "Watermark", type: "boolean", defaultValue: false },
      { key: "returnLastFrame", apiKey: "return_last_frame", label: "Return last frame", type: "boolean", defaultValue: false },
    ],
  },
];

export function getAtlasModel(modelId: string) {
  return ATLAS_MODELS.find((model) => model.id === modelId);
}

export function requireAtlasModel(modelId: string) {
  const model = getAtlasModel(modelId);
  if (!model) throw new Error(`Unsupported Atlas model: ${modelId}`);
  return model;
}

export function modelsForMode(mode: AtlasModelMode) {
  return ATLAS_MODELS.filter((model) => model.mode === mode);
}

export function defaultModelForMode(mode: AtlasModelMode) {
  const model = modelsForMode(mode)[0];
  if (!model) throw new Error(`No Atlas model configured for ${mode}`);
  return model;
}

export function defaultParamsForModel(modelId: string): Record<string, AtlasParameterValue> {
  const model = requireAtlasModel(modelId);
  return Object.fromEntries(model.parameters.map((parameter) => [parameter.key, parameter.defaultValue]));
}

function validateParameter(parameter: AtlasParameterDefinition, value: unknown): AtlasParameterValue {
  if (parameter.type === "boolean") {
    if (typeof value !== "boolean") throw new Error(`${parameter.label} must be true or false.`);
    return value;
  }

  if (parameter.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${parameter.label} must be a number.`);
    if (parameter.integer && !Number.isInteger(value)) throw new Error(`${parameter.label} must be an integer.`);
    if (parameter.min !== undefined && value < parameter.min) throw new Error(`${parameter.label} must be at least ${parameter.min}.`);
    if (parameter.max !== undefined && value > parameter.max) throw new Error(`${parameter.label} must be at most ${parameter.max}.`);
    return value;
  }

  const option = parameter.options?.find((candidate) => candidate.value === value);
  if (!option) throw new Error(`${parameter.label} is not supported by this model.`);
  return option.value;
}

export function validateModelParams(modelId: string, params: Record<string, unknown> = {}): Record<string, AtlasParameterValue> {
  const model = requireAtlasModel(modelId);
  const definitions = new Map(model.parameters.map((parameter) => [parameter.key, parameter]));
  for (const key of Object.keys(params)) {
    if (!definitions.has(key)) throw new Error(`Parameter "${key}" is not supported by ${model.label}.`);
  }

  const validated: Record<string, AtlasParameterValue> = {};
  for (const parameter of model.parameters) {
    const value = params[parameter.key] ?? parameter.defaultValue;
    validated[parameter.key] = validateParameter(parameter, value);
  }
  return validated;
}

export function buildAtlasRequestParams(modelId: string, params: Record<string, unknown> = {}): Record<string, AtlasParameterValue> {
  const model = requireAtlasModel(modelId);
  const validated = validateModelParams(modelId, params);
  return Object.fromEntries(model.parameters.map((parameter) => [parameter.apiKey, validated[parameter.key]]));
}

export function assertModelMode(modelId: string, mode: AtlasModelMode) {
  const model = requireAtlasModel(modelId);
  if (model.mode !== mode) throw new Error(`${model.label} cannot be used for ${mode}.`);
  return model;
}
