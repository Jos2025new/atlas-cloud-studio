import { ArrowUpRight, ChevronDown, Clapperboard, Image as ImageIcon, LoaderCircle, PanelLeft, Send, Settings2, Sparkles, Trash2 } from "lucide-react";
import type { StudioArtifact, StudioMessage, StudioMode } from "@/lib/studioStore";

export type ModelOption = { id: string; label: string; note: string };

type Props = {
  mode: StudioMode;
  model: string;
  models: ModelOption[];
  messages: StudioMessage[];
  artifacts: StudioArtifact[];
  prompt: string;
  busy: boolean;
  pendingCount?: number;
  onPrompt: (value: string) => void;
  onSubmit: () => void;
  onModel: (value: string) => void;
  onClear: () => void;
  onSidebar: () => void;
  onSettings: () => void;
};

export default function StudioWorkspace(props: Props) {
  const visibleArtifacts = props.artifacts.filter((artifact) => artifact.kind === props.mode);
  return <main className="flex min-h-screen min-w-0 flex-1 flex-col">
    <header className="flex h-[72px] items-center justify-between border-b border-white/[.08] px-5 sm:px-8 lg:px-10"><div className="flex items-center gap-3"><button className="rounded-lg p-2 text-white/50 lg:hidden" onClick={props.onSidebar}><PanelLeft size={18} /></button><div className="eyebrow hidden sm:block">Workspace / {props.mode}</div><div className="flex items-center gap-2 sm:hidden"><Sparkles size={14} className="text-[#c5b8ff]" /><span className="text-sm font-semibold">Atlas Studio</span></div></div><div className="flex items-center gap-2">{Boolean(props.pendingCount) && <div className="hidden rounded-full border border-white/[.08] px-3 py-1.5 text-[11px] text-white/55 sm:block">{props.pendingCount} active</div>}<button onClick={props.onSettings} className="rounded-xl border border-white/[.1] p-2.5 text-white/55"><Settings2 size={17} /></button></div></header>

    <section className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col px-5 pb-9 pt-8 sm:px-8 lg:px-12">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="eyebrow text-[#c5b8ff]">Atlas Cloud / {props.mode === "chat" ? "OpenAI-compatible" : "Async media"}</div><h1 className="display-face mt-3 text-4xl font-semibold sm:text-5xl">Make room for<br /><span className="text-white/40">better thinking.</span></h1></div><div className="max-w-[270px] text-sm leading-6 text-white/42">Persistent sessions and recoverable media work, in one focused workspace.</div></div>

      <div className="mt-8 grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
        <div className="flex min-h-[520px] flex-col rounded-[26px] border border-white/[.08] bg-[#0e1012] p-4 sm:p-6">
          <div className="flex items-center justify-between border-b border-white/[.07] pb-4"><div><div className="text-sm font-bold">{props.mode === "chat" ? "Conversation" : props.mode === "image" ? "Image direction" : "Motion direction"}</div><div className="mt-1 text-xs text-white/38">{props.mode === "chat" ? "Clear context in, useful answers out." : "Describe the scene. Atlas handles the render."}</div></div><button onClick={props.onClear} className="rounded-lg p-2 text-white/30"><Trash2 size={15} /></button></div>

          <div className="scroll-thin flex-1 space-y-5 overflow-y-auto py-6">{props.mode === "chat" ? props.messages.map((message) => <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-[#e7d9c7] text-[#171512]" : "border border-white/[.08] bg-white/[.035] text-white/78"}`}>{message.content}</div></div>) : visibleArtifacts.length ? <div className="grid gap-4 sm:grid-cols-2">{visibleArtifacts.map((artifact) => <div key={artifact.id} className="overflow-hidden rounded-2xl border border-white/[.08] bg-white/[.03]"><div className="aspect-square bg-black">{artifact.kind === "image" ? <img src={artifact.url} alt={artifact.prompt} className="h-full w-full object-cover" /> : <video src={artifact.url} controls className="h-full w-full object-cover" />}</div><div className="p-3"><div className="eyebrow">{artifact.model}</div><div className="mt-1 line-clamp-2 text-xs leading-5 text-white/55">{artifact.prompt}</div></div></div>)}</div> : <div className="flex h-full min-h-[290px] flex-col items-center justify-center text-center"><div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/[.1] bg-white/[.035] text-[#c5b8ff]">{props.mode === "image" ? <ImageIcon size={23} /> : <Clapperboard size={23} />}</div><div className="mt-5 text-sm font-semibold">Your {props.mode} board is empty</div></div>}
          {props.busy && <div className="flex items-center gap-3 text-xs text-white/45"><LoaderCircle size={15} className="animate-spin text-[#c5b8ff]" /> {props.mode === "chat" ? "Thinking with Atlas…" : "Waiting for the render…"}</div>}</div>

          <div className="rounded-2xl border border-white/[.1] bg-[#15171a] p-2"><textarea value={props.prompt} onChange={(e) => props.onPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); props.onSubmit(); } }} placeholder={props.mode === "chat" ? "Ask Atlas anything…" : props.mode === "image" ? "Describe an image to create…" : "Describe a moving scene…"} rows={3} className="w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 text-white outline-none placeholder:text-white/25" /><div className="flex justify-end px-1 pt-2"><button disabled={!props.prompt.trim() || props.busy} onClick={props.onSubmit} className="flex items-center gap-2 rounded-xl bg-[#c5b8ff] px-3.5 py-2.5 text-xs font-bold text-[#17151f]">{props.busy ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />} {props.busy ? "Working" : props.mode === "chat" ? "Send" : "Generate"}</button></div></div>
        </div>

        <div className="space-y-5"><div className="rounded-[26px] border border-white/[.08] bg-[#0e1012] p-5"><div className="flex items-center justify-between"><div><div className="eyebrow">Configuration</div><div className="mt-2 text-sm font-bold">{props.mode === "chat" ? "Model" : "Engine"}</div></div><ChevronDown size={15} className="text-white/35" /></div><select value={props.model} onChange={(e) => props.onModel(e.target.value)} className="mt-5 w-full appearance-none rounded-xl border border-white/[.1] bg-[#15171a] px-3.5 py-3 text-xs text-white outline-none">{props.models.map((model) => <option key={model.id} value={model.id}>{model.label} · {model.note}</option>)}</select></div>
        <div className="rounded-[26px] border border-[#c5b8ff]/15 bg-[#c5b8ff]/[.05] p-5"><div className="text-xs font-bold">Local history</div><p className="mt-2 text-xs leading-5 text-white/45">Messages, results and configuration are restored after reload.</p><a href="https://atlascloud.ai/docs" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#c5b8ff]">Atlas docs <ArrowUpRight size={12} /></a></div></div>
      </div>
    </section>
  </main>;
}
