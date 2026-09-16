import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import StudioSidebar from "@/components/studio/StudioSidebar";
import StudioWorkspace, { type ModelOption } from "@/components/studio/StudioWorkspace";
import SettingsModal from "@/components/studio/SettingsModal";
import {
  activateSession,
  addSession,
  createArtifact,
  createMessage,
  createSession,
  deleteSession,
  loadStudioStore,
  renameSession,
  saveStudioStore,
  titleFromPrompt,
  updateSession,
  type StudioMode,
  type StudioSession,
  type StudioStore,
} from "@/lib/studioStore";

const CHAT_MODELS: ModelOption[] = [
  { id: "deepseek-v3", label: "DeepSeek V3", note: "Balanced · fast" },
  { id: "qwen3-235b-a22b", label: "Qwen 3 235B", note: "Reasoning · deep" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", note: "Quick · compact" },
];
const IMAGE_MODELS: ModelOption[] = [
  { id: "seedream-3.0", label: "Seedream 3.0", note: "Atlas image default" },
  { id: "flux-1.1-pro", label: "FLUX 1.1 Pro", note: "Detailed · editorial" },
];
const VIDEO_MODELS: ModelOption[] = [
  { id: "kling-v2.0", label: "Kling v2.0", note: "Cinematic motion" },
  { id: "wan-2.1", label: "Wan 2.1", note: "Expressive movement" },
];

const getModels = (mode: StudioMode) => mode === "chat" ? CHAT_MODELS : mode === "image" ? IMAGE_MODELS : VIDEO_MODELS;

function outputUrl(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return typeof item.url === "string" ? item.url : typeof item.output === "string" ? item.output : null;
  }
  return null;
}

export default function Home() {
  const [studio, setStudio] = useState<StudioStore>(() => loadStudioStore());
  const [apiKey, setApiKey] = useState(() => typeof window !== "undefined" ? localStorage.getItem("atlas_api_key") || "" : "");
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [settings, setSettings] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  const active = useMemo(() => studio.sessions.find((s) => s.id === studio.activeSessionId) ?? studio.sessions[0], [studio]);
  const models = useMemo(() => getModels(active.mode), [active.mode]);
  const chatMutation = trpc.atlas.chat.useMutation();
  const imageMutation = trpc.atlas.generateImage.useMutation();
  const videoMutation = trpc.atlas.generateVideo.useMutation();
  const utils = trpc.useUtils();

  const commitStore = useCallback((updater: (current: StudioStore) => StudioStore) => {
    setStudio((current) => {
      const next = updater(current);
      saveStudioStore(next);
      return next;
    });
  }, []);

  const updateActive = useCallback((updater: (session: StudioSession) => StudioSession) => {
    commitStore((current) => updateSession(current, current.activeSessionId, updater));
  }, [commitStore]);

  const ensureKey = () => {
    if (apiKey) return true;
    setKeyDraft("");
    setSettings(true);
    toast("Add an Atlas Cloud API key to run a request");
    return false;
  };

  const saveKey = () => {
    const value = keyDraft.trim();
    if (value) localStorage.setItem("atlas_api_key", value); else localStorage.removeItem("atlas_api_key");
    setApiKey(value);
    setSettings(false);
    toast.success(value ? "Atlas key saved locally" : "Atlas key removed");
  };

  const pollPrediction = async (id: string, kind: "image" | "video", originalPrompt: string, model: string, params: Record<string, unknown>) => {
    const delays = [1200, 2200, 3500, 5000, 7000];
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const result = await utils.atlas.prediction.fetch({ apiKey, id });
      const status = result.status.toLowerCase();
      if (["completed", "succeeded", "success"].includes(status)) {
        const url = outputUrl(result.outputs?.[0]);
        if (!url) throw new Error("Atlas completed without an output URL.");
        const artifact = createArtifact({ kind, url, prompt: originalPrompt, model, params });
        updateActive((session) => ({ ...session, artifacts: [artifact, ...session.artifacts] }));
        return;
      }
      if (["failed", "error", "canceled", "cancelled"].includes(status)) throw new Error(result.error || "Atlas generation failed.");
      await new Promise((resolve) => window.setTimeout(resolve, delays[Math.min(attempt, delays.length - 1)]));
    }
    throw new Error("Generation is still processing in Atlas Cloud.");
  };

  const submit = async () => {
    const value = prompt.trim();
    if (!value || busy || !ensureKey()) return;
    setBusy(true);
    setPrompt("");
    const shouldTitle = active.title === "Untitled session";
    try {
      if (active.mode === "chat") {
        const config = { model: active.selectedModel, temperature: 0.7, maxTokens: 800 };
        const nextMessages = [...active.messages, createMessage("user", value, config)];
        updateActive((session) => ({ ...session, title: shouldTitle ? titleFromPrompt(value) : session.title, messages: nextMessages }));
        const response = await chatMutation.mutateAsync({ apiKey, model: active.selectedModel, messages: nextMessages.map(({ role, content }) => ({ role, content })), temperature: config.temperature, maxTokens: config.maxTokens });
        updateActive((session) => ({ ...session, messages: [...session.messages, createMessage("assistant", response.content)] }));
      } else if (active.mode === "image") {
        const params = { aspectRatio: "1:1" };
        updateActive((session) => ({ ...session, title: shouldTitle ? titleFromPrompt(value) : session.title }));
        const response = await imageMutation.mutateAsync({ apiKey, model: active.selectedModel, prompt: value, aspectRatio: params.aspectRatio });
        await pollPrediction(response.id, "image", value, active.selectedModel, params);
      } else {
        const params = { duration: 5, aspectRatio: "16:9" };
        updateActive((session) => ({ ...session, title: shouldTitle ? titleFromPrompt(value) : session.title }));
        const response = await videoMutation.mutateAsync({ apiKey, model: active.selectedModel, prompt: value, duration: params.duration, aspectRatio: params.aspectRatio });
        await pollPrediction(response.id, "video", value, active.selectedModel, params);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const onMode = (mode: StudioMode) => updateActive((session) => ({ ...session, mode, selectedModel: getModels(mode)[0]?.id ?? session.selectedModel }));
  const onRename = (session: StudioSession) => { const title = window.prompt("Rename session", session.title); if (title?.trim()) commitStore((s) => renameSession(s, session.id, title)); };
  const onDelete = (id: string) => { if (window.confirm("Delete this session from local history?")) commitStore((s) => deleteSession(s, id)); };

  return <div className="app-shell flex min-h-screen text-[#f4f1eb]">
    <StudioSidebar open={sidebar} apiKey={apiKey} mode={active.mode} activeSessionId={studio.activeSessionId} sessions={studio.sessions} onClose={() => setSidebar(false)} onNew={() => { commitStore((s) => addSession(s, createSession())); setPrompt(""); }} onMode={onMode} onOpen={(id) => { commitStore((s) => activateSession(s, id)); setPrompt(""); setSidebar(false); }} onRename={onRename} onDelete={onDelete} onSettings={() => { setKeyDraft(apiKey); setSettings(true); }} />
    <StudioWorkspace mode={active.mode} model={active.selectedModel} models={models} messages={active.messages} artifacts={active.artifacts} prompt={prompt} busy={busy} onPrompt={setPrompt} onSubmit={submit} onModel={(model) => updateActive((session) => ({ ...session, selectedModel: model }))} onClear={() => updateActive((session) => ({ ...session, messages: [], artifacts: [] }))} onSidebar={() => setSidebar(true)} onSettings={() => { setKeyDraft(apiKey); setSettings(true); }} />
    <SettingsModal open={settings} value={keyDraft} onChange={setKeyDraft} onClose={() => setSettings(false)} onSave={saveKey} />
  </div>;
}
