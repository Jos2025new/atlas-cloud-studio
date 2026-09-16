import { useRef } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Download,
  Image as ImageIcon,
  LoaderCircle,
  PanelLeft,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { GenerationJob, StudioArtifact, StudioMessage, StudioMode, StudioReference } from "@/lib/studioStore";
import type { AtlasModelDefinition, AtlasParameterDefinition, AtlasParameterValue } from "@shared/atlasModels";
import GenerationActivity from "./GenerationActivity";
import { connectionCopy, type AtlasConnection } from "@/lib/atlasConnection";

type Props = {
  mode: StudioMode;
  model: string;
  models: AtlasModelDefinition[];
  params: Record<string, unknown>;
  messages: StudioMessage[];
  artifacts: StudioArtifact[];
  references: StudioReference[];
  referenceLimit: number;
  referencesOrdered: boolean;
  referenceRolesSupported: boolean;
  finalFrame?: StudioReference;
  finalFrameSupported: boolean;
  prompt: string;
  busy: boolean;
  uploading: boolean;
  uploadError?: string;
  jobs: GenerationJob[];
  connection: AtlasConnection;
  pendingCount?: number;
  onPrompt: (value: string) => void;
  onSubmit: () => void;
  onModel: (value: string) => void;
  onParam: (key: string, value: AtlasParameterValue) => void;
  onUploadReferences: (files: File[]) => void;
  onRemoveReference: (referenceId: string) => void;
  onMoveReference: (referenceId: string, direction: -1 | 1) => void;
  onClearReferences: () => void;
  onUploadFinalFrame: (file: File) => void;
  onClearFinalFrame: () => void;
  onUseArtifactReference: (artifact: StudioArtifact) => void;
  onUseArtifactFinalFrame: (artifact: StudioArtifact) => void;
  onClear: () => void;
  onSidebar: () => void;
  onSettings: () => void;
  onCheckJob: (job: GenerationJob) => void;
};

async function downloadArtifact(url: string, filename: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed with ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function ParameterControl({
  definition,
  value,
  onChange,
}: {
  definition: AtlasParameterDefinition;
  value: unknown;
  onChange: (value: AtlasParameterValue) => void;
}) {
  const current = value ?? definition.defaultValue;
  if (definition.type === "boolean") {
    return <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[.08] bg-white/[.025] px-3 py-2.5 text-xs text-white/60">
      <span>{definition.label}</span>
      <input
        type="checkbox"
        checked={Boolean(current)}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[#c5b8ff]"
      />
    </label>;
  }
  if (definition.type === "number") {
    return <label className="block">
      <span className="eyebrow">{definition.label}</span>
      <input
        type="number"
        value={typeof current === "number" ? current : Number(definition.defaultValue)}
        min={definition.min}
        max={definition.max}
        step={definition.integer ? 1 : "any"}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full rounded-xl border border-white/[.1] bg-[#15171a] px-3 py-2.5 text-xs text-white outline-none"
      />
    </label>;
  }
  return <label className="block">
    <span className="eyebrow">{definition.label}</span>
    <select
      value={String(current)}
      onChange={(event) => {
        const option = definition.options?.find((candidate) => String(candidate.value) === event.target.value);
        if (option) onChange(option.value);
      }}
      className="mt-2 w-full appearance-none rounded-xl border border-white/[.1] bg-[#15171a] px-3 py-2.5 text-xs text-white outline-none"
    >
      {definition.options?.map((option) =>
        <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
      )}
    </select>
  </label>;
}

export default function StudioWorkspace(props: Props) {
  const referencesInput = useRef<HTMLInputElement>(null);
  const finalFrameInput = useRef<HTMLInputElement>(null);
  const visibleArtifacts = props.artifacts.filter((artifact) => artifact.kind === props.mode);
  const modelDefinition = props.models.find((model) => model.id === props.model) ?? props.models[0];
  const mediaMode = props.mode === "image" || props.mode === "video";
  const canAddReference = mediaMode && props.referenceLimit > 0 && props.references.length < props.referenceLimit;
  const finalFrameReady = props.mode === "video" && props.finalFrameSupported && props.references.length === 1;
  const invalidFinalFrame = props.mode === "video" && Boolean(props.finalFrame) && props.references.length !== 1;
  const referencesOverLimit = mediaMode && props.referenceLimit > 0 && props.references.length > props.referenceLimit;
  const connection = connectionCopy[props.connection.status];

  return <main className="flex min-h-screen min-w-0 flex-1 flex-col">
    <header className="flex h-[72px] items-center justify-between border-b border-white/[.08] px-5 sm:px-8 lg:px-10">
      <div className="flex items-center gap-3">
        <button className="rounded-lg p-2 text-white/50 lg:hidden" onClick={props.onSidebar}><PanelLeft size={18} /></button>
        <div className="eyebrow hidden sm:block">Workspace / {props.mode}</div>
        <div className="flex items-center gap-2 sm:hidden">
          <Sparkles size={14} className="text-[#c5b8ff]" />
          <span className="text-sm font-semibold">Atlas Studio</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={props.onSettings} className="flex items-center gap-2 rounded-full border border-white/[.08] px-3 py-1.5 text-[11px] text-white/55" aria-label={`Atlas connection: ${connection.label}`}>
          <span className={`h-2 w-2 rounded-full ${connection.dot}`} /><span className="hidden sm:inline">{connection.label}</span>
        </button>
        {Boolean(props.pendingCount) &&
          <div className="hidden rounded-full border border-white/[.08] px-3 py-1.5 text-[11px] text-white/55 sm:block">
            {props.pendingCount} active
          </div>}
        <button onClick={props.onSettings} className="rounded-xl border border-white/[.1] p-2.5 text-white/55">
          <Settings2 size={17} />
        </button>
      </div>
    </header>

    <section className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col px-5 pb-9 pt-8 sm:px-8 lg:px-12">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <div className="eyebrow text-[#c5b8ff]">Atlas Cloud / {props.mode === "chat" ? "OpenAI-compatible" : "Async media"}</div>
          <h1 className="display-face mt-3 text-4xl font-semibold sm:text-5xl">Make room for<br /><span className="text-white/40">better thinking.</span></h1>
        </div>
        <div className="max-w-[270px] text-sm leading-6 text-white/42">
          Persistent sessions, recoverable generations, and ordered reusable references.
        </div>
      </div>

      <div className="mt-8 grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
        <div className="flex min-h-[520px] flex-col rounded-[26px] border border-white/[.08] bg-[#0e1012] p-4 sm:p-6">
          <div className="flex items-center justify-between border-b border-white/[.07] pb-4">
            <div>
              <div className="text-sm font-bold">{props.mode === "chat" ? "Conversation" : props.mode === "image" ? "Image direction" : "Motion direction"}</div>
              <div className="mt-1 text-xs text-white/38">
                {props.mode === "chat"
                  ? "Clear context in, useful answers out."
                  : props.references.length
                    ? `${props.references.length} ordered reference${props.references.length === 1 ? "" : "s"} selected.`
                    : "Describe the scene. Atlas handles the render."}
              </div>
            </div>
            <button onClick={props.onClear} className="rounded-lg p-2 text-white/30"><Trash2 size={15} /></button>
          </div>

          <div className="scroll-thin flex-1 space-y-5 overflow-y-auto py-6">
            {props.mode === "chat"
              ? props.messages.map((message) =>
                <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-[#e7d9c7] text-[#171512]" : "border border-white/[.08] bg-white/[.035] text-white/78"}`}>
                    {message.content}
                  </div>
                </div>
              )
              : visibleArtifacts.length
                ? <div className="grid gap-4 sm:grid-cols-2">
                  {visibleArtifacts.map((artifact) =>
                    <div key={artifact.id} className="overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.03]">
                      <div className="aspect-square bg-black">
                        {artifact.kind === "image"
                          ? <img src={artifact.url} alt={artifact.prompt} className="h-full w-full object-cover" />
                          : <video src={artifact.url} controls className="h-full w-full object-cover" />}
                      </div>
                      <div className="p-3">
                        <div className="eyebrow">{artifact.model}</div>
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">{artifact.prompt}</div>
                        {artifact.references.length > 0 &&
                          <div className="mt-2 text-[10px] text-white/30">
                            Used {artifact.references.length} reference{artifact.references.length === 1 ? "" : "s"}
                            {artifact.finalFrame ? " + final frame" : ""}
                          </div>}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => { void downloadArtifact(artifact.url, `atlas-${artifact.kind}-${artifact.id}.${artifact.kind === "image" ? "png" : "mp4"}`); }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[.09] px-2.5 py-1.5 text-[10px] font-semibold text-white/55 hover:bg-white/[.05] hover:text-white"
                          >
                            <Download size={12} /> Download
                          </button>
                          {artifact.kind === "image" && <>
                            <button
                              onClick={() => props.onUseArtifactReference(artifact)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#c5b8ff]/25 bg-[#c5b8ff]/[.06] px-2.5 py-1.5 text-[10px] font-semibold text-[#c5b8ff] hover:bg-[#c5b8ff]/[.1]"
                            >
                              <ImageIcon size={12} /> Add reference
                            </button>
                            <button
                              onClick={() => props.onUseArtifactFinalFrame(artifact)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[.09] px-2.5 py-1.5 text-[10px] font-semibold text-white/55 hover:bg-white/[.05] hover:text-white"
                            >
                              <Clapperboard size={12} /> Set final frame
                            </button>
                          </>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                : <div className="flex h-full min-h-[290px] flex-col items-center justify-center text-center">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/[.1] bg-white/[.035] text-[#c5b8ff]">
                    {props.mode === "image" ? <ImageIcon size={23} /> : <Clapperboard size={23} />}
                  </div>
                  <div className="mt-5 text-sm font-semibold">Your {props.mode} board is empty</div>
                </div>}
            {props.busy &&
              <div className="flex items-center gap-3 text-xs text-white/45">
                <LoaderCircle size={15} className="animate-spin text-[#c5b8ff]" />
                {props.mode === "chat" ? "Thinking with Atlas…" : "Submitting generation…"}
              </div>}
          </div>

          <div className="rounded-2xl border border-white/[.1] bg-[#15171a] p-2">
            {mediaMode && props.references.length > 0 &&
              <div className="mb-2 rounded-xl border border-[#c5b8ff]/20 bg-[#c5b8ff]/[.05] p-2">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="eyebrow text-[#c5b8ff]">Ordered references</div>
                    <div className="mt-1 text-[10px] text-white/35">
                      {props.referencesOrdered ? "Prompt can refer to image 1, image 2, etc." : "References are unordered."}
                    </div>
                  </div>
                  <button onClick={props.onClearReferences} className="text-[10px] font-semibold text-white/35 hover:text-white">Clear</button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {props.references.map((reference, index) =>
                    <div key={reference.id} className="w-[92px] shrink-0 rounded-lg border border-white/[.08] bg-black/20 p-1.5">
                      <div className="relative">
                        <img src={reference.url} alt={reference.name} className="h-16 w-full rounded-md object-cover" />
                        <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">Image {index + 1}</span>
                      </div>
                      <div className="mt-1 truncate text-[9px] text-white/45" title={reference.name}>{reference.name}</div>
                      <div className="mt-1 flex items-center justify-between">
                        <button disabled={index === 0} onClick={() => props.onMoveReference(reference.id, -1)} className="rounded p-1 text-white/35 disabled:opacity-20"><ChevronLeft size={11} /></button>
                        <button onClick={() => props.onRemoveReference(reference.id)} className="rounded p-1 text-white/35 hover:text-white"><X size={11} /></button>
                        <button disabled={index === props.references.length - 1} onClick={() => props.onMoveReference(reference.id, 1)} className="rounded p-1 text-white/35 disabled:opacity-20"><ChevronRight size={11} /></button>
                      </div>
                    </div>
                  )}
                </div>
              </div>}

            {mediaMode && props.finalFrame &&
              <div className="mb-2 flex items-center gap-3 rounded-xl border border-white/[.09] bg-white/[.025] p-2">
                <img src={props.finalFrame.url} alt={props.finalFrame.name} className="h-12 w-12 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="eyebrow">Final frame</div>
                  <div className="mt-1 truncate text-xs text-white/65">{props.finalFrame.name}</div>
                </div>
                <button onClick={props.onClearFinalFrame} className="rounded-lg p-2 text-white/35 hover:bg-white/[.06] hover:text-white" aria-label="Remove final frame">
                  <X size={14} />
                </button>
              </div>}

            <textarea
              value={props.prompt}
              onChange={(event) => props.onPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  props.onSubmit();
                }
              }}
              placeholder={
                props.mode === "chat"
                  ? "Ask Atlas anything…"
                  : props.references.length
                    ? props.references.length > 1
                      ? "Describe the result; you can refer to image 1, image 2, etc…"
                      : "Describe what to change or how the image should move…"
                    : props.mode === "image"
                      ? "Describe an image to create…"
                      : "Describe a moving scene…"
              }
              rows={3}
              className="w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 text-white outline-none placeholder:text-white/25"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                {mediaMode && props.referenceLimit > 0 && <>
                  <input
                    ref={referencesInput}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []) as File[];
                      if (files.length) props.onUploadReferences(files);
                      event.currentTarget.value = "";
                    }}
                  />
                  <button
                    disabled={props.uploading || !canAddReference}
                    onClick={() => referencesInput.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[.09] px-2.5 py-2 text-[10px] font-semibold text-white/50 hover:bg-white/[.05] hover:text-white disabled:opacity-40"
                  >
                    {props.uploading ? <LoaderCircle size={12} className="animate-spin" /> : <Upload size={12} />}
                    Add references {props.references.length}/{props.referenceLimit}
                  </button>
                </>}

                {props.mode === "video" && props.finalFrameSupported && <>
                  <input
                    ref={finalFrameInput}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) props.onUploadFinalFrame(file);
                      event.currentTarget.value = "";
                    }}
                  />
                  <button
                    disabled={props.uploading || !finalFrameReady}
                    onClick={() => finalFrameInput.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[.09] px-2.5 py-2 text-[10px] font-semibold text-white/50 hover:bg-white/[.05] hover:text-white disabled:opacity-40"
                    title={finalFrameReady ? "Set the ending frame" : "Final frame requires exactly one starting image"}
                  >
                    <Clapperboard size={12} /> {props.finalFrame ? "Replace final frame" : "Add final frame"}
                  </button>
                </>}
              </div>

              <button
                disabled={!props.prompt.trim() || props.busy || props.uploading || invalidFinalFrame || referencesOverLimit}
                onClick={props.onSubmit}
                className="flex items-center gap-2 rounded-xl bg-[#c5b8ff] px-3.5 py-2.5 text-xs font-bold text-[#17151f] disabled:opacity-40"
              >
                {props.busy ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />}
                {props.busy ? "Working" : props.mode === "chat" ? "Send" : "Generate"}
              </button>
            </div>

            {invalidFinalFrame &&
              <div className="mt-2 px-1 text-[10px] text-[#e7d9c7]/70">
                Final frame requires exactly one starting image. Remove it or keep one start image.
              </div>}
            {referencesOverLimit &&
              <div className="mt-2 px-1 text-[10px] text-[#e7d9c7]/70">
                This mode supports at most {props.referenceLimit} references. Remove the extra image before generating.
              </div>}
            {props.uploadError &&
              <div role="alert" className="mt-2 rounded-lg border border-red-400/20 bg-red-400/[.06] px-3 py-2 text-[10px] leading-4 text-red-200/80">
                Attachment failed: {props.uploadError}
              </div>}
          </div>
        </div>

        <div className="space-y-5">
          {mediaMode && <GenerationActivity jobs={props.jobs} onCheck={props.onCheckJob} />}
          <div className="rounded-[26px] border border-white/[.08] bg-[#0e1012] p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="eyebrow">Configuration</div>
                <div className="mt-2 text-sm font-bold">{props.mode === "chat" ? "Model" : "Engine"}</div>
              </div>
              <ChevronDown size={15} className="text-white/35" />
            </div>
            <select
              value={props.model}
              onChange={(event) => props.onModel(event.target.value)}
              className="mt-5 w-full appearance-none rounded-xl border border-white/[.1] bg-[#15171a] px-3.5 py-3 text-xs text-white outline-none"
            >
              {props.models.map((model) =>
                <option key={model.id} value={model.id}>{model.label} · {model.note}</option>
              )}
            </select>
            {modelDefinition &&
              <div className="mt-5 space-y-3 border-t border-white/[.07] pt-4">
                {modelDefinition.parameters.map((parameter) =>
                  <ParameterControl
                    key={parameter.key}
                    definition={parameter}
                    value={props.params[parameter.key]}
                    onChange={(value) => props.onParam(parameter.key, value)}
                  />
                )}
              </div>}
          </div>

          {mediaMode && props.referenceLimit > 0 &&
            <div className="rounded-[26px] border border-[#c5b8ff]/15 bg-[#c5b8ff]/[.05] p-5">
              <div className="text-xs font-bold">Advanced references</div>
              <p className="mt-2 text-xs leading-5 text-white/45">
                Up to {props.referenceLimit} ordered images. Atlas exposes order, not per-image role/type fields
                {props.referenceRolesSupported ? "." : "; reference images are addressed by position."}
              </p>
              {props.mode === "video" &&
                <p className="mt-2 text-[10px] leading-4 text-white/35">
                  One image uses image-to-video and may include a final frame. Two or more images use reference-to-video.
                </p>}
            </div>}

          <div className="rounded-[26px] border border-white/[.08] bg-[#0e1012] p-5">
            <div className="text-xs font-bold">Validated Atlas contract</div>
            <p className="mt-2 text-xs leading-5 text-white/45">
              Only combinations documented by Atlas are submitted; incompatible final-frame and multi-reference requests are blocked.
            </p>
            <a href="https://atlascloud.ai/docs" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#c5b8ff]">
              Atlas docs <ArrowUpRight size={12} />
            </a>
          </div>
        </div>
      </div>
    </section>
  </main>;
}
