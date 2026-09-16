import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clapperboard,
  Copy,
  Image as ImageIcon,
  KeyRound,
  Layers3,
  LayoutGrid,
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  Play,
  Plus,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Video,
  X,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

type Mode = "chat" | "image" | "video";
type ChatMessage = { role: "user" | "assistant"; content: string };
type Artifact = { kind: "image" | "video"; url: string; prompt: string; model: string };

const MODES: Array<{ id: Mode; label: string; icon: typeof MessageSquare; description: string }> = [
  { id: "chat", label: "Chat", icon: MessageSquare, description: "OpenAI-compatible conversations" },
  { id: "image", label: "Image", icon: ImageIcon, description: "Create stills from a prompt" },
  { id: "video", label: "Video", icon: Video, description: "Render a moving scene" },
];

const CHAT_MODELS = [
  { id: "deepseek-v3", label: "DeepSeek V3", note: "Balanced · fast" },
  { id: "qwen3-235b-a22b", label: "Qwen 3 235B", note: "Reasoning · deep" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", note: "Quick · compact" },
];
const IMAGE_MODELS = [
  { id: "seedream-3.0", label: "Seedream 3.0", note: "Atlas image default" },
  { id: "flux-1.1-pro", label: "FLUX 1.1 Pro", note: "Detailed · editorial" },
];
const VIDEO_MODELS = [
  { id: "kling-v2.0", label: "Kling v2.0", note: "Cinematic motion" },
  { id: "wan-2.1", label: "Wan 2.1", note: "Expressive movement" },
];

const starterPrompts = [
  "Write a clear launch plan for a small creative studio.",
  "Turn this idea into a crisp product brief with three milestones.",
  "Explain a complex topic in a calm, visual way.",
];

function getModels(mode: Mode) {
  return mode === "chat" ? CHAT_MODELS : mode === "image" ? IMAGE_MODELS : VIDEO_MODELS;
}

function outputUrl(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return typeof item.url === "string" ? item.url : typeof item.output === "string" ? item.output : null;
  }
  return null;
}

function relativeTime(index: number) {
  return index === 0 ? "Now" : index === 1 ? "Yesterday" : index === 2 ? "Mon" : "Sun";
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("chat");
  const [apiKey, setApiKey] = useState(() => typeof window !== "undefined" ? localStorage.getItem("atlas_api_key") || "" : "");
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState("deepseek-v3");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Welcome to Atlas Cloud Studio. Ask anything, or switch to Image and Video to make something visual." },
  ]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [busy, setBusy] = useState(false);

  const models = useMemo(() => getModels(mode), [mode]);
  const chatMutation = trpc.atlas.chat.useMutation();
  const imageMutation = trpc.atlas.generateImage.useMutation();
  const videoMutation = trpc.atlas.generateVideo.useMutation();
  const utils = trpc.useUtils();

  const saveKey = () => {
    const trimmed = keyDraft.trim();
    if (!trimmed) {
      localStorage.removeItem("atlas_api_key");
      setApiKey("");
      toast.success("Atlas key removed from this browser");
    } else {
      localStorage.setItem("atlas_api_key", trimmed);
      setApiKey(trimmed);
      toast.success("Atlas key saved locally");
    }
    setShowSettings(false);
  };

  const ensureKey = () => {
    if (apiKey) return true;
    setKeyDraft("");
    setShowSettings(true);
    toast("Add an Atlas Cloud API key to run a request", { description: "It stays in this browser and is only sent to Atlas Cloud." });
    return false;
  };

  const resetSession = () => {
    setMessages([{ role: "assistant", content: "New session ready. What are you thinking about?" }]);
    setArtifacts([]);
    setPrompt("");
    toast.success("New session started");
  };

  const pollPrediction = async (id: string, kind: "image" | "video", originalPrompt: string, model: string) => {
    const delays = [1200, 2200, 3500, 5000, 7000];
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const result = await utils.atlas.prediction.fetch({ apiKey, id });
      const status = result.status.toLowerCase();
      if (["completed", "succeeded", "success"].includes(status)) {
        const url = outputUrl(result.outputs?.[0]);
        if (!url) throw new Error("Atlas Cloud completed the task without returning an output URL.");
        setArtifacts((current) => [{ kind, url, prompt: originalPrompt, model }, ...current]);
        return;
      }
      if (["failed", "error", "canceled", "cancelled"].includes(status)) {
        throw new Error(result.error || "Atlas Cloud could not complete this generation.");
      }
      await new Promise((resolve) => window.setTimeout(resolve, delays[Math.min(attempt, delays.length - 1)]));
    }
    throw new Error("The generation is taking longer than expected. Check Atlas Cloud for the prediction status.");
  };

  const submit = async (forcedPrompt?: string) => {
    const value = (forcedPrompt ?? prompt).trim();
    if (!value || busy || !ensureKey()) return;
    setBusy(true);
    setPrompt("");
    try {
      if (mode === "chat") {
        const nextMessages = [...messages, { role: "user", content: value } as ChatMessage];
        setMessages(nextMessages);
        const response = await chatMutation.mutateAsync({
          apiKey,
          model: selectedModel,
          messages: nextMessages,
          temperature: 0.7,
          maxTokens: 800,
        });
        setMessages((current) => [...current, { role: "assistant", content: response.content }]);
      } else if (mode === "image") {
        const response = await imageMutation.mutateAsync({ apiKey, model: selectedModel, prompt: value, aspectRatio: "1:1" });
        await pollPrediction(response.id, "image", value, selectedModel);
        toast.success("Image ready");
      } else {
        const response = await videoMutation.mutateAsync({ apiKey, model: selectedModel, prompt: value, duration: 5, aspectRatio: "16:9" });
        await pollPrediction(response.id, "video", value, selectedModel);
        toast.success("Video ready");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast.error(message, { description: "Check your key, model, or Atlas Cloud usage limits." });
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    const nextModel = getModels(nextMode)[0]?.id;
    if (nextModel) setSelectedModel(nextModel);
    setShowSidebar(false);
  };

  return (
    <div className="app-shell flex min-h-screen text-[#f4f1eb]">
      <aside className={`${showSidebar ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-white/[.08] bg-[#0c0d0f] px-4 py-5 transition-transform lg:static`}>
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-[13px] bg-[#e7d9c7] text-[#12110f] shadow-[0_8px_25px_rgba(231,217,199,.12)]"><Layers3 size={18} strokeWidth={2.2} /></div>
            <div><div className="text-sm font-bold tracking-[-.04em]">Atlas Cloud</div><div className="eyebrow mt-0.5">Studio / 01</div></div>
          </div>
          <button className="rounded-lg p-2 text-white/40 hover:bg-white/[.06] hover:text-white lg:hidden" onClick={() => setShowSidebar(false)} aria-label="Close navigation"><X size={17} /></button>
        </div>

        <button onClick={resetSession} className="mt-9 flex items-center justify-between rounded-xl border border-white/[.1] bg-white/[.04] px-3.5 py-3 text-left text-sm font-semibold hover:border-white/20 hover:bg-white/[.07]">
          <span className="flex items-center gap-2.5"><Plus size={16} className="text-[#c5b8ff]" /> New session</span><span className="eyebrow text-[9px]">⌘ K</span>
        </button>

        <div className="mt-8"><div className="eyebrow px-2">Workspace</div><nav className="mt-2 space-y-1">
          <button onClick={() => switchMode("chat")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${mode === "chat" ? "bg-white/[.08] text-white" : "text-white/48 hover:bg-white/[.04] hover:text-white"}`}><MessageSquare size={16} /> Chat <span className="ml-auto eyebrow text-[9px]">01</span></button>
          <button onClick={() => switchMode("image")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${mode === "image" ? "bg-white/[.08] text-white" : "text-white/48 hover:bg-white/[.04] hover:text-white"}`}><ImageIcon size={16} /> Image <span className="ml-auto eyebrow text-[9px]">02</span></button>
          <button onClick={() => switchMode("video")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${mode === "video" ? "bg-white/[.08] text-white" : "text-white/48 hover:bg-white/[.04] hover:text-white"}`}><Video size={16} /> Video <span className="ml-auto eyebrow text-[9px]">03</span></button>
        </nav></div>

        <div className="mt-9"><div className="flex items-center justify-between px-2"><div className="eyebrow">Recent sessions</div><button className="text-white/30 hover:text-white" onClick={() => toast("Session history is local to this browser")} aria-label="More session options"><MoreHorizontal size={16} /></button></div>
          <div className="mt-2 space-y-1">
            {["Product launch brief", "A quiet morning in Kyoto", "Research notes · Atlas", "Untitled session"].map((item, index) => <button key={item} onClick={() => toast("Session history is ready for the next pass")} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs text-white/45 hover:bg-white/[.04] hover:text-white"><span className="max-w-[170px] truncate">{item}</span><span className="eyebrow text-[9px]">{relativeTime(index)}</span></button>)}
          </div>
        </div>

        <div className="mt-auto rounded-2xl border border-white/[.08] bg-[#121417] p-3.5">
          <div className="flex items-start justify-between"><span className="eyebrow">Atlas connection</span><span className={`mt-0.5 h-2 w-2 rounded-full ${apiKey ? "bg-[#b9e8c1]" : "bg-[#e7d9c7]"}`} /></div>
          <p className="mt-2 text-xs leading-5 text-white/48">{apiKey ? "Key available locally. Requests proxy through this app." : "Add your key when you are ready to run a request."}</p>
          <button onClick={() => { setKeyDraft(apiKey); setShowSettings(true); }} className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#c5b8ff] hover:text-white"><KeyRound size={14} /> {apiKey ? "Manage key" : "Connect key"}<ArrowUpRight size={12} /></button>
        </div>
        <div className="mt-4 flex items-center justify-between px-2 text-white/30"><span className="eyebrow text-[9px]">Built for Atlas Cloud</span><Zap size={13} /></div>
      </aside>

      {showSidebar && <button className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setShowSidebar(false)} aria-label="Close navigation overlay" />}

      <main className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex h-[72px] items-center justify-between border-b border-white/[.08] px-5 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-white/50 hover:bg-white/[.06] hover:text-white lg:hidden" onClick={() => setShowSidebar(true)} aria-label="Open navigation"><PanelLeft size={18} /></button><div className="eyebrow hidden sm:block">Workspace / {mode}</div><div className="flex items-center gap-2 sm:hidden"><Sparkles size={14} className="text-[#c5b8ff]" /><span className="text-sm font-semibold">Atlas Studio</span></div></div>
          <div className="flex items-center gap-2"><div className="hidden items-center gap-2 rounded-full border border-white/[.08] px-3 py-1.5 text-[11px] text-white/48 sm:flex"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#b9e8c1]" /> Atlas API <span className="text-white/75">ready</span></div><button onClick={() => { setKeyDraft(apiKey); setShowSettings(true); }} className="rounded-xl border border-white/[.1] p-2.5 text-white/55 hover:bg-white/[.06] hover:text-white" aria-label="Settings"><Settings2 size={17} /></button><button onClick={resetSession} className="hidden rounded-xl bg-[#e7d9c7] px-3.5 py-2.5 text-xs font-bold text-[#12110f] hover:bg-white sm:block">New session</button></div>
        </header>

        <section className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col px-5 pb-9 pt-8 sm:px-8 lg:px-12">
          <div className="rise-in flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="eyebrow text-[#c5b8ff]">Atlas Cloud / {mode === "chat" ? "OpenAI-compatible" : "Async media"}</div><h1 className="display-face mt-3 text-4xl font-semibold sm:text-5xl">Make room for<br /><span className="text-white/40">better thinking.</span></h1></div><div className="max-w-[270px] text-sm leading-6 text-white/42">A quiet workspace for fast model calls, visual experiments, and ideas that deserve a second pass.</div></div>

          <div className="mt-9 flex items-center gap-1 rounded-2xl border border-white/[.08] bg-white/[.025] p-1.5 sm:w-fit">{MODES.map(({ id, label, icon: Icon, description }) => <button key={id} onClick={() => switchMode(id)} title={description} className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold ${mode === id ? "bg-[#e7d9c7] text-[#12110f] shadow-[0_4px_18px_rgba(231,217,199,.12)]" : "text-white/45 hover:bg-white/[.05] hover:text-white"}`}><Icon size={15} />{label}</button>)}</div>

          <div className="mt-8 grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
            <div className="flex min-h-[520px] flex-col rounded-[26px] border border-white/[.08] bg-[#0e1012] p-4 shadow-[0_18px_60px_rgba(0,0,0,.2)] sm:p-6">
              <div className="flex items-center justify-between border-b border-white/[.07] pb-4"><div><div className="text-sm font-bold">{mode === "chat" ? "Conversation" : mode === "image" ? "Image direction" : "Motion direction"}</div><div className="mt-1 text-xs text-white/38">{mode === "chat" ? "Clear context in, useful answers out." : "Describe the scene. Atlas Cloud handles the render."}</div></div><button onClick={() => { setMessages([]); setArtifacts([]); }} className="rounded-lg p-2 text-white/30 hover:bg-white/[.06] hover:text-white" aria-label="Clear workspace"><Trash2 size={15} /></button></div>
              <div className="scroll-thin flex-1 space-y-5 overflow-y-auto py-6">
                {mode === "chat" ? messages.map((message, index) => <div key={`${message.role}-${index}`} className={`rise-in flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-[#e7d9c7] text-[#171512]" : "border border-white/[.08] bg-white/[.035] text-white/78"}`}>{message.content}</div></div>) : artifacts.length === 0 ? <div className="flex h-full min-h-[290px] flex-col items-center justify-center text-center"><div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/[.1] bg-white/[.035] text-[#c5b8ff]">{mode === "image" ? <ImageIcon size={23} /> : <Clapperboard size={23} />}</div><div className="mt-5 text-sm font-semibold">Your {mode} board is empty</div><p className="mt-2 max-w-[290px] text-xs leading-5 text-white/38">Describe a scene below and the finished result will appear here.</p></div> : <div className="grid gap-4 sm:grid-cols-2">{artifacts.map((artifact) => <div key={`${artifact.url}-${artifact.prompt}`} className="overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.03]"><div className="aspect-square bg-black">{artifact.kind === "image" ? <img src={artifact.url} alt={artifact.prompt} className="h-full w-full object-cover" /> : <video src={artifact.url} controls className="h-full w-full object-cover" />}</div><div className="p-3"><div className="eyebrow">{artifact.model}</div><div className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">{artifact.prompt}</div></div></div>)}</div>}
                {busy && <div className="flex items-center gap-3 text-xs text-white/45"><LoaderCircle size={15} className="animate-spin text-[#c5b8ff]" /> {mode === "chat" ? "Thinking with Atlas…" : "Waiting for the render…"}</div>}
              </div>
              {mode === "chat" && messages.length < 3 && <div className="mb-4 grid gap-2 sm:grid-cols-3">{starterPrompts.map((item) => <button key={item} onClick={() => submit(item)} className="rounded-xl border border-white/[.08] bg-white/[.025] px-3 py-2 text-left text-[11px] leading-4 text-white/45 hover:border-[#c5b8ff]/35 hover:bg-[#c5b8ff]/[.06] hover:text-white">{item}</button>)}</div>}
              <div className="rounded-2xl border border-white/[.1] bg-[#15171a] p-2 focus-within:border-[#c5b8ff]/45 focus-within:shadow-[0_0_0_4px_rgba(197,184,255,.06)]"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={mode === "chat" ? "Ask Atlas anything…" : mode === "image" ? "Describe an image to create…" : "Describe a moving scene…"} rows={3} className="w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 text-white outline-none placeholder:text-white/25" /><div className="flex items-center justify-between px-1 pt-2"><div className="flex items-center gap-2 text-[10px] text-white/30"><span className="rounded-md border border-white/[.09] px-1.5 py-1">{mode === "chat" ? "⌘ ↵" : "Atlas async"}</span><span className="hidden sm:inline">{mode === "chat" ? "Shift + Enter for a new line" : "Results can take a moment"}</span></div><button disabled={!prompt.trim() || busy} onClick={() => submit()} className="flex items-center gap-2 rounded-xl bg-[#c5b8ff] px-3.5 py-2.5 text-xs font-bold text-[#17151f] hover:bg-[#d7ceff]">{busy ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />} {busy ? "Working" : mode === "chat" ? "Send" : "Generate"}</button></div></div>
            </div>

            <div className="space-y-5"><div className="rounded-[26px] border border-white/[.08] bg-[#0e1012] p-5"><div className="flex items-center justify-between"><div><div className="eyebrow">Configuration</div><div className="mt-2 text-sm font-bold">{mode === "chat" ? "Model" : "Engine"}</div></div><ChevronDown size={15} className="text-white/35" /></div><select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} className="mt-5 w-full appearance-none rounded-xl border border-white/[.1] bg-[#15171a] px-3.5 py-3 text-xs text-white outline-none hover:border-white/20">{models.map((model) => <option key={model.id} value={model.id}>{model.label} · {model.note}</option>)}</select><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl border border-white/[.08] bg-white/[.025] p-3"><div className="eyebrow">Provider</div><div className="mt-2 text-xs text-white/70">Atlas Cloud</div></div><div className="rounded-xl border border-white/[.08] bg-white/[.025] p-3"><div className="eyebrow">Billing</div><div className="mt-2 text-xs text-white/70">Pay as you go</div></div></div></div>
              <div className="rounded-[26px] border border-white/[.08] bg-[#0e1012] p-5"><div className="eyebrow">Quick start</div><div className="mt-2 text-sm font-bold">One API, many models.</div><p className="mt-2 text-xs leading-5 text-white/42">Atlas Cloud exposes OpenAI-compatible chat plus first-party image and video endpoints. Choose a lane and keep moving.</p><div className="mt-5 space-y-2.5">{MODES.map(({ id, label, icon: Icon, description }, index) => <button key={id} onClick={() => switchMode(id)} className="flex w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left hover:border-white/[.08] hover:bg-white/[.03]"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[.06] text-[#c5b8ff]"><Icon size={15} /></span><span className="flex-1"><span className="block text-xs font-semibold text-white/75">{label}</span><span className="mt-0.5 block text-[10px] text-white/35">{description}</span></span><span className="eyebrow text-[9px]">0{index + 1}</span></button>)}</div></div>
              <div className="rounded-[26px] border border-[#c5b8ff]/15 bg-[#c5b8ff]/[.05] p-5"><div className="flex items-start gap-3"><Sparkles size={17} className="mt-0.5 shrink-0 text-[#c5b8ff]" /><div><div className="text-xs font-bold">Keep it efficient</div><p className="mt-1.5 text-xs leading-5 text-white/45">Use smaller models for quick tasks and cap chat output to keep token spend predictable.</p><a href="https://atlascloud.ai/docs/en/models/price" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#c5b8ff] hover:text-white">View pricing notes <ArrowUpRight size={12} /></a></div></div></div>
            </div>
          </div>
        </section>
      </main>

      {showSettings && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-5 backdrop-blur-sm"><div className="glass w-full max-w-[480px] rounded-[28px] p-6 sm:p-7"><div className="flex items-start justify-between"><div><div className="eyebrow text-[#c5b8ff]">Connection</div><h2 className="display-face mt-2 text-2xl font-semibold">Bring your Atlas key.</h2><p className="mt-2 max-w-[355px] text-sm leading-6 text-white/45">It is stored in this browser only. The app sends it through the secure server proxy to Atlas Cloud.</p></div><button onClick={() => setShowSettings(false)} className="rounded-lg p-2 text-white/40 hover:bg-white/[.06] hover:text-white" aria-label="Close settings"><X size={17} /></button></div><label className="mt-7 block"><span className="eyebrow">API key</span><div className="mt-2 flex items-center rounded-xl border border-white/[.12] bg-[#0e1012] px-3"><KeyRound size={15} className="text-white/30" /><input value={keyDraft} onChange={(event) => setKeyDraft(event.target.value)} type="password" placeholder="sk-atlas-…" className="w-full bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-white/25" /></div></label><div className="mt-5 flex items-center justify-between gap-3"><a href="https://atlascloud.ai/console/api-keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#c5b8ff] hover:text-white">Create an Atlas key <ArrowUpRight size={13} /></a><button onClick={saveKey} className="flex items-center gap-2 rounded-xl bg-[#e7d9c7] px-4 py-2.5 text-xs font-bold text-[#171512] hover:bg-white"><Check size={14} /> Save locally</button></div><div className="mt-6 flex items-start gap-2 border-t border-white/[.08] pt-4 text-[10px] leading-4 text-white/32"><KeyRound size={13} className="mt-0.5 shrink-0" /> Never commit your key or share it in a screenshot. Rotate keys regularly from the Atlas console.</div></div></div>}
    </div>
  );
}
