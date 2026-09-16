import { ArrowUpRight, Image as ImageIcon, KeyRound, Layers3, MessageSquare, MoreHorizontal, Plus, Trash2, Video, X, Zap } from "lucide-react";
import type { StudioMode, StudioSession } from "@/lib/studioStore";

const items: Array<{ id: StudioMode; label: string; icon: typeof MessageSquare }> = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "video", label: "Video", icon: Video },
];

function relativeTime(timestamp: string) {
  const elapsed = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "Now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Props = {
  open: boolean;
  apiKey: string;
  mode: StudioMode;
  activeSessionId: string;
  sessions: StudioSession[];
  onClose: () => void;
  onNew: () => void;
  onMode: (mode: StudioMode) => void;
  onOpen: (id: string) => void;
  onRename: (session: StudioSession) => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
};

export default function StudioSidebar(props: Props) {
  const sessions = [...props.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return <>
    <aside className={`${props.open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-white/[.08] bg-[#0c0d0f] px-4 py-5 transition-transform lg:static`}>
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-[13px] bg-[#e7d9c7] text-[#12110f]"><Layers3 size={18} /></div><div><div className="text-sm font-bold">Atlas Cloud</div><div className="eyebrow mt-0.5">Studio / 01</div></div></div>
        <button className="rounded-lg p-2 text-white/40 lg:hidden" onClick={props.onClose}><X size={17} /></button>
      </div>

      <button onClick={props.onNew} className="mt-9 flex items-center justify-between rounded-xl border border-white/[.1] bg-white/[.04] px-3.5 py-3 text-sm font-semibold"><span className="flex items-center gap-2.5"><Plus size={16} className="text-[#c5b8ff]" /> New session</span></button>

      <div className="mt-8"><div className="eyebrow px-2">Workspace</div><nav className="mt-2 space-y-1">{items.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => props.onMode(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${props.mode === id ? "bg-white/[.08] text-white" : "text-white/50 hover:bg-white/[.04]"}`}><Icon size={16} /> {label}</button>)}</nav></div>

      <div className="mt-9 min-h-0"><div className="flex items-center justify-between px-2"><div className="eyebrow">Recent sessions</div><span className="eyebrow text-[9px]">{sessions.length}</span></div>
        <div className="scroll-thin mt-2 max-h-[34vh] space-y-1 overflow-y-auto pr-1">{sessions.map((session) => <div key={session.id} className={`group flex items-center rounded-xl ${session.id === props.activeSessionId ? "bg-white/[.07]" : "hover:bg-white/[.04]"}`}>
          <button onClick={() => props.onOpen(session.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left text-xs text-white/55"><span className="block truncate">{session.title}</span><span className="eyebrow mt-1 block text-[9px]">{relativeTime(session.updatedAt)}</span></button>
          <button onClick={() => props.onRename(session)} className="p-2 text-white/25 opacity-0 group-hover:opacity-100" aria-label="Rename"><MoreHorizontal size={14} /></button>
          <button onClick={() => props.onDelete(session.id)} className="mr-1 p-2 text-white/25 opacity-0 hover:text-red-300 group-hover:opacity-100" aria-label="Delete"><Trash2 size={13} /></button>
        </div>)}</div>
      </div>

      <div className="mt-auto rounded-2xl border border-white/[.08] bg-[#121417] p-3.5"><div className="flex items-start justify-between"><span className="eyebrow">Atlas connection</span><span className={`mt-0.5 h-2 w-2 rounded-full ${props.apiKey ? "bg-[#b9e8c1]" : "bg-[#e7d9c7]"}`} /></div><p className="mt-2 text-xs leading-5 text-white/48">{props.apiKey ? "Key available locally." : "Add your key to run a request."}</p><button onClick={props.onSettings} className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#c5b8ff]"><KeyRound size={14} /> {props.apiKey ? "Manage key" : "Connect key"}<ArrowUpRight size={12} /></button></div>
      <div className="mt-4 flex items-center justify-between px-2 text-white/30"><span className="eyebrow text-[9px]">Built for Atlas Cloud</span><Zap size={13} /></div>
    </aside>
    {props.open && <button className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={props.onClose} aria-label="Close navigation" />}
  </>;
}
