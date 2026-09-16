import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import StudioSidebar from "@/components/studio/StudioSidebar";
import StudioWorkspace from "@/components/studio/StudioWorkspace";
import SettingsModal from "@/components/studio/SettingsModal";
import {
  activateSession, addGenerationJob, addSession, createArtifact, createGenerationJob, createMessage, createReference, createSession,
  deleteSession, loadStudioStore, normalizeGenerationStatus, recoverableJobs, renameSession, saveStudioStore,
  titleFromPrompt, updateGenerationJob, updateSession,
  type GenerationJob, type StudioArtifact, type StudioMode, type StudioSession, type StudioStore,
} from "@/lib/studioStore";
import {
  defaultModelForMode,
  defaultParamsForModel,
  getAtlasModel,
  modelsForMode,
  validateModelParams,
  type AtlasParameterValue,
} from "@shared/atlasModels";
import { supportsSingleReference } from "@shared/atlasReferenceModels";

function outputUrl(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return typeof item.url === "string" ? item.url : typeof item.output === "string" ? item.output : null;
  }
  return null;
}

async function fileToBase64(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the selected image."));
    reader.onerror = () => reject(reader.error || new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Could not encode the selected image.");
  return dataUrl.slice(comma + 1);
}

export default function Home() {
  const [studio, setStudio] = useState<StudioStore>(() => loadStudioStore());
  const [apiKey, setApiKey] = useState(() => typeof window !== "undefined" ? localStorage.getItem("atlas_api_key") || "" : "");
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [settings, setSettings] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const polling = useRef(new Set<string>());

  const active = useMemo(() => studio.sessions.find((session) => session.id === studio.activeSessionId) ?? studio.sessions[0], [studio]);
  const models = useMemo(() => modelsForMode(active.mode), [active.mode]);
  const activeJobs = useMemo(() => recoverableJobs(studio), [studio]);
  const chatMutation = trpc.atlas.chat.useMutation();
  const imageMutation = trpc.atlas.generateImage.useMutation();
  const videoMutation = trpc.atlas.generateVideo.useMutation();
  const uploadMutation = trpc.atlas.uploadMedia.useMutation();
  const utils = trpc.useUtils();

  const commitStore = useCallback((updater: (current: StudioStore) => StudioStore) => {
    setStudio((current) => { const next = updater(current); saveStudioStore(next); return next; });
  }, []);
  const updateActive = useCallback((updater: (session: StudioSession) => StudioSession) => commitStore((current) => updateSession(current, current.activeSessionId, updater)), [commitStore]);

  const pollJob = useCallback(async (job: GenerationJob) => {
    if (!apiKey || polling.current.has(job.requestId)) return;
    polling.current.add(job.requestId);
    const delays = [1200, 2200, 3500, 5000, 7000];
    try {
      for (let attempt = 0; attempt < 36; attempt += 1) {
        const result = await utils.atlas.prediction.fetch({ apiKey, id: job.requestId });
        const status = normalizeGenerationStatus(result.status);
        if (status === "completed") {
          const url = outputUrl(result.outputs?.[0]);
          if (!url) throw new Error("Atlas completed without an output URL.");
          commitStore((current) => {
            const currentJob = current.jobs.find((item) => item.id === job.id);
            if (!currentJob || currentJob.status === "completed") return current;
            const artifact = createArtifact({ kind: job.kind, url, prompt: job.prompt, model: job.model, params: job.params, generationJobId: job.id, reference: job.reference });
            let next = updateSession(current, job.sessionId, (session) => session.artifacts.some((item) => item.generationJobId === job.id) ? session : { ...session, artifacts: [artifact, ...session.artifacts] });
            next = updateGenerationJob(next, job.id, { status: "completed", providerStatus: result.status, resultUrl: url, artifactId: artifact.id, error: undefined });
            return next;
          });
          return;
        }
        if (status === "failed") {
          commitStore((current) => updateGenerationJob(current, job.id, { status: "failed", providerStatus: result.status, error: result.error || "Atlas generation failed." }));
          return;
        }
        commitStore((current) => updateGenerationJob(current, job.id, { status, providerStatus: result.status }));
        await new Promise((resolve) => window.setTimeout(resolve, delays[Math.min(attempt, delays.length - 1)]));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Polling failed");
    } finally {
      polling.current.delete(job.requestId);
    }
  }, [apiKey, commitStore, utils.atlas.prediction]);

  useEffect(() => { if (!apiKey) return; recoverableJobs(studio).forEach((job) => { void pollJob(job); }); }, [apiKey, studio, pollJob]);

  const ensureKey = () => { if (apiKey) return true; setKeyDraft(""); setSettings(true); toast("Add an Atlas Cloud API key to run a request"); return false; };
  const saveKey = () => { const value = keyDraft.trim(); if (value) localStorage.setItem("atlas_api_key", value); else localStorage.removeItem("atlas_api_key"); setApiKey(value); setSettings(false); toast.success(value ? "Atlas key saved locally" : "Atlas key removed"); };

  const uploadReference = async (file: File) => {
    if (!ensureKey()) return;
    if (!file.type.startsWith("image/")) { toast.error("Select an image file."); return; }
    if (file.size > 30 * 1024 * 1024) { toast.error("Atlas image uploads must be 30 MB or smaller."); return; }
    if (!supportsSingleReference(active.selectedModel)) { toast.error("The selected model does not support a single-image reference."); return; }

    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const uploaded = await uploadMutation.mutateAsync({ apiKey, fileName: file.name, mimeType: file.type || "image/png", base64 });
      const reference = createReference({ url: uploaded.url, name: file.name, source: "upload" });
      updateActive((session) => ({ ...session, reference }));
      toast.success("Reference uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const useArtifactAsReference = (artifact: StudioArtifact) => {
    if (artifact.kind !== "image") return;
    const reference = createReference({ url: artifact.url, name: artifact.prompt || "Generated image", source: "artifact", artifactId: artifact.id });
    updateActive((session) => ({ ...session, reference }));
    toast.success("Image set as reference");
  };

  const submit = async () => {
    const value = prompt.trim(); if (!value || busy || !ensureKey()) return;
    setBusy(true); setPrompt(""); const shouldTitle = active.title === "Untitled session";
    try {
      const params = validateModelParams(active.selectedModel, active.params);
      if (active.mode === "chat") {
        const config = { model: active.selectedModel, params };
        const nextMessages = [...active.messages, createMessage("user", value, config)];
        updateActive((session) => ({ ...session, title: shouldTitle ? titleFromPrompt(value) : session.title, messages: nextMessages }));
        const response = await chatMutation.mutateAsync({ apiKey, model: active.selectedModel, messages: nextMessages.map(({ role, content }) => ({ role, content })), params });
        updateActive((session) => ({ ...session, messages: [...session.messages, createMessage("assistant", response.content)] }));
      } else {
        const kind = active.mode;
        const reference = active.reference && supportsSingleReference(active.selectedModel) ? active.reference : undefined;
        updateActive((session) => ({ ...session, title: shouldTitle ? titleFromPrompt(value) : session.title }));
        const response = kind === "image"
          ? await imageMutation.mutateAsync({ apiKey, model: active.selectedModel, prompt: value, params, referenceUrl: reference?.url })
          : await videoMutation.mutateAsync({ apiKey, model: active.selectedModel, prompt: value, params, referenceUrl: reference?.url });
        const job = createGenerationJob({ requestId: response.id, sessionId: active.id, kind, model: response.model, prompt: value, params, providerStatus: response.status, reference });
        commitStore((current) => addGenerationJob(current, job));
        void pollJob(job);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  const onMode = (mode: StudioMode) => updateActive((session) => { const model = defaultModelForMode(mode); return { ...session, mode, selectedModel: model.id, params: defaultParamsForModel(model.id) }; });
  const onModel = (modelId: string) => updateActive((session) => { const model = getAtlasModel(modelId); if (!model || model.mode !== session.mode) return session; return { ...session, selectedModel: model.id, params: defaultParamsForModel(model.id) }; });
  const onParam = (key: string, value: AtlasParameterValue) => updateActive((session) => ({ ...session, params: { ...session.params, [key]: value } }));
  const onRename = (session: StudioSession) => { const title = window.prompt("Rename session", session.title); if (title?.trim()) commitStore((store) => renameSession(store, session.id, title)); };
  const onDelete = (id: string) => { if (window.confirm("Delete this session from local history?")) commitStore((store) => deleteSession(store, id)); };

  return <div className="app-shell flex min-h-screen text-[#f4f1eb]">
    <StudioSidebar open={sidebar} apiKey={apiKey} mode={active.mode} activeSessionId={studio.activeSessionId} sessions={studio.sessions} onClose={() => setSidebar(false)} onNew={() => { commitStore((store) => addSession(store, createSession())); setPrompt(""); }} onMode={onMode} onOpen={(id) => { commitStore((store) => activateSession(store, id)); setPrompt(""); setSidebar(false); }} onRename={onRename} onDelete={onDelete} onSettings={() => { setKeyDraft(apiKey); setSettings(true); }} />
    <StudioWorkspace mode={active.mode} model={active.selectedModel} models={models} params={active.params} messages={active.messages} artifacts={active.artifacts} reference={active.reference} referenceSupported={supportsSingleReference(active.selectedModel)} prompt={prompt} busy={busy} uploading={uploading} pendingCount={activeJobs.length} onPrompt={setPrompt} onSubmit={submit} onModel={onModel} onParam={onParam} onUploadReference={uploadReference} onClearReference={() => updateActive((session) => ({ ...session, reference: undefined }))} onUseArtifactReference={useArtifactAsReference} onClear={() => updateActive((session) => ({ ...session, messages: [], artifacts: [], reference: undefined }))} onSidebar={() => setSidebar(true)} onSettings={() => { setKeyDraft(apiKey); setSettings(true); }} />
    <SettingsModal open={settings} value={keyDraft} onChange={setKeyDraft} onClose={() => setSettings(false)} onSave={saveKey} />
  </div>;
}
