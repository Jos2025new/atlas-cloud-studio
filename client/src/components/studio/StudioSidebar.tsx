import {
  ArrowUpRight,
  Image as ImageIcon,
  KeyRound,
  Layers3,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Trash2,
  Video,
  X,
} from "lucide-react";
import type { StudioMode, StudioSession } from "@/lib/studioStore";
import { connectionCopy, type AtlasConnection } from "@/lib/atlasConnection";

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
  collapsed: boolean;
  connection: AtlasConnection;
  mode: StudioMode;
  activeSessionId: string;
  sessions: StudioSession[];
  onClose: () => void;
  onToggleCollapsed: () => void;
  onNew: () => void;
  onMode: (mode: StudioMode) => void;
  onOpen: (id: string) => void;
  onRename: (session: StudioSession) => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
};

export default function StudioSidebar(props: Props) {
  const sessions = [...props.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const connection = connectionCopy[props.connection.status];
  const labelClass = props.collapsed ? "lg:hidden" : "";

  return <>
    <aside className={`${props.open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} sidebar-shell fixed inset-y-0 left-0 z-40 flex w-[min(88vw,320px)] flex-col border-r border-white/[.08] bg-[#0c0d0f] px-4 py-5 transition-[width,transform,padding] duration-200 lg:static ${props.collapsed ? "lg:w-20 lg:px-3" : "lg:w-[272px]"}`}>
      <div className={`flex items-center ${props.collapsed ? "lg:justify-center" : "justify-between"}`}>
        <div className="flex min-w-0 items-center gap-3 px-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[13px] bg-[#e7d9c7] text-[#12110f]"><Layers3 size={18} /></div>
          <div className={labelClass}><div className="text-sm font-bold">Atlas Cloud</div><div className="eyebrow mt-0.5">Studio / 01</div></div>
        </div>
        <button className="grid min-h-11 min-w-11 place-items-center rounded-lg text-white/50 hover:bg-white/[.06] lg:hidden" onClick={props.onClose} aria-label="Close navigation"><X size={18} /></button>
      </div>

      <button
        onClick={props.onToggleCollapsed}
        className="mt-5 hidden min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[.08] text-xs font-semibold text-white/50 hover:bg-white/[.05] hover:text-white lg:flex"
        aria-label={props.collapsed ? "Expand navigation" : "Collapse navigation"}
        title={props.collapsed ? "Expand navigation" : "Collapse navigation"}
      >
        {props.collapsed ? <PanelLeftOpen size={17} /> : <><PanelLeftClose size={17} /><span>Collapse panel</span></>}
      </button>

      <button onClick={props.onNew} className={`mt-5 flex min-h-11 items-center rounded-xl border border-white/[.1] bg-white/[.04] px-3.5 text-sm font-semibold hover:bg-white/[.07] ${props.collapsed ? "lg:justify-center lg:px-0" : "justify-between"}`} aria-label="New session" title="New session">
        <span className="flex items-center gap-2.5"><Plus size={17} className="text-[#c5b8ff]" /><span className={labelClass}>New session</span></span>
      </button>

      <div className="mt-7">
        <div className={`eyebrow px-2 ${labelClass}`}>Workspace</div>
        <nav className="mt-2 space-y-1">{items.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => props.onMode(id)} aria-label={label} title={label} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm ${props.collapsed ? "lg:justify-center lg:px-0" : ""} ${props.mode === id ? "bg-white/[.09] text-white" : "text-white/50 hover:bg-white/[.04] hover:text-white"}`}><Icon size={17} /><span className={labelClass}>{label}</span></button>)}</nav>
      </div>

      <div className={`mt-8 min-h-0 ${labelClass}`}>
        <div className="flex items-center justify-between px-2"><div className="eyebrow">Recent sessions</div><span className="eyebrow text-[9px]">{sessions.length}</span></div>
        <div className="scroll-thin mt-2 max-h-[34vh] space-y-1 overflow-y-auto pr-1">{sessions.map((session) => <div key={session.id} className={`group flex items-center rounded-xl ${session.id === props.activeSessionId ? "bg-white/[.07]" : "hover:bg-white/[.04]"}`}>
          <button onClick={() => props.onOpen(session.id)} className="min-h-11 min-w-0 flex-1 px-3 py-2.5 text-left text-xs text-white/55"><span className="block truncate">{session.title}</span><span className="eyebrow mt-1 block text-[9px]">{relativeTime(session.updatedAt)}</span></button>
          <button onClick={() => props.onRename(session)} className="grid min-h-11 min-w-11 place-items-center text-white/35 hover:text-white lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100" aria-label="Rename session"><MoreHorizontal size={14} /></button>
          <button onClick={() => props.onDelete(session.id)} className="mr-1 grid min-h-11 min-w-11 place-items-center text-white/35 hover:text-red-300 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100" aria-label="Delete session"><Trash2 size={14} /></button>
        </div>)}</div>
      </div>

      <div className={`mt-auto rounded-2xl border border-white/[.08] bg-[#121417] ${props.collapsed ? "lg:p-2" : "p-3.5"}`}>
        <div className={`flex items-center ${props.collapsed ? "lg:justify-center" : "justify-between"}`}><span className={`eyebrow ${labelClass}`}>Atlas connection</span><span className={`h-2 w-2 rounded-full ${connection.dot}`} /></div>
        <div className={labelClass}>
          <p className="mt-2 text-xs font-semibold text-white/70">{connection.label}</p>
          <p className="mt-1 text-[11px] leading-5 text-white/42">{props.connection.message || connection.detail}</p>
          {props.connection.balance !== undefined && <p className="mt-1 text-[11px] text-emerald-200">{props.connection.balance.toFixed(4)} {props.connection.currency || "USD"}</p>}
          <button onClick={props.onSettings} className="mt-2 flex min-h-11 items-center gap-2 text-xs font-semibold text-[#c5b8ff]"><KeyRound size={14} /> {props.connection.status === "missing" ? "Connect key" : "Manage key"}<ArrowUpRight size={12} /></button>
        </div>
        {props.collapsed && <button onClick={props.onSettings} className="hidden min-h-11 w-full items-center justify-center text-[#c5b8ff] lg:flex" aria-label="Manage Atlas connection" title="Manage Atlas connection"><KeyRound size={16} /></button>}
      </div>
    </aside>
    {props.open && <button className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={props.onClose} aria-label="Close navigation overlay" />}
  </>;
}
