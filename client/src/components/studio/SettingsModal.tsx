import { ArrowUpRight, Check, KeyRound, X } from "lucide-react";

type Props = {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function SettingsModal({ open, value, onChange, onClose, onSave }: Props) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-5 backdrop-blur-sm"><div className="glass w-full max-w-[480px] rounded-[28px] p-6 sm:p-7">
    <div className="flex items-start justify-between"><div><div className="eyebrow text-[#c5b8ff]">Connection</div><h2 className="display-face mt-2 text-2xl font-semibold">Bring your Atlas key.</h2><p className="mt-2 max-w-[355px] text-sm leading-6 text-white/45">Stored only in this browser and sent through the app proxy to Atlas Cloud.</p></div><button onClick={onClose} className="rounded-lg p-2 text-white/40"><X size={17} /></button></div>
    <label className="mt-7 block"><span className="eyebrow">API key</span><div className="mt-2 flex items-center rounded-xl border border-white/[.12] bg-[#0e1012] px-3"><KeyRound size={15} className="text-white/30" /><input value={value} onChange={(e) => onChange(e.target.value)} type="password" placeholder="sk-atlas-…" className="w-full bg-transparent px-3 py-3 text-sm text-white outline-none" /></div></label>
    <div className="mt-5 flex items-center justify-between gap-3"><a href="https://atlascloud.ai/console/api-keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#c5b8ff]">Create an Atlas key <ArrowUpRight size={13} /></a><button onClick={onSave} className="flex items-center gap-2 rounded-xl bg-[#e7d9c7] px-4 py-2.5 text-xs font-bold text-[#171512]"><Check size={14} /> Save locally</button></div>
  </div></div>;
}
