import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import type { GenerationJob, GenerationStatus } from "@/lib/studioStore";

const statusCopy: Record<GenerationStatus, { label: string; tone: string }> = {
  submitting: { label: "Sending to Atlas", tone: "text-[#c5b8ff]" },
  submission_uncertain: { label: "Submission uncertain", tone: "text-amber-300" },
  pending: { label: "Accepted · queued", tone: "text-[#c5b8ff]" },
  processing: { label: "Processing", tone: "text-[#c5b8ff]" },
  completed: { label: "Completed", tone: "text-emerald-300" },
  failed: { label: "Failed", tone: "text-red-300" },
  timed_out: { label: "Status timed out", tone: "text-amber-300" },
};

function StatusIcon({ status }: { status: GenerationStatus }) {
  if (status === "completed") return <CheckCircle2 size={14} />;
  if (status === "failed" || status === "submission_uncertain") return <AlertTriangle size={14} />;
  if (status === "timed_out") return <Clock3 size={14} />;
  return <LoaderCircle size={14} className="animate-spin" />;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 }).format(value);
}

export default function GenerationActivity({ jobs, onCheck }: { jobs: GenerationJob[]; onCheck: (job: GenerationJob) => void }) {
  if (!jobs.length) return null;
  return <section aria-labelledby="generation-activity-title" className="rounded-[26px] border border-white/[.06] bg-[#0b0d0f] p-5">
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="eyebrow">Generation activity</div>
        <h2 id="generation-activity-title" className="mt-2 text-sm font-bold">Generation queue</h2>
      </div>
      <span className="rounded-full border border-white/[.08] px-2.5 py-1 text-[10px] text-white/45">{jobs.length}</span>
    </div>
    <div className="mt-4 space-y-3">
      {jobs.slice(0, 8).map((job) => {
        const status = statusCopy[job.status];
        const canCheck = Boolean(job.requestId) && ["pending", "processing", "timed_out"].includes(job.status);
        const active = ["submitting", "pending", "processing"].includes(job.status);
        const needsAttention = ["submission_uncertain", "failed", "timed_out"].includes(job.status);
        return <article key={job.id} className={`rounded-xl border p-3 ${active ? "border-[#c5b8ff]/30 bg-[#c5b8ff]/[.045]" : needsAttention ? "border-amber-300/20 bg-amber-300/[.025]" : "border-white/[.07] bg-white/[.018]"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${status.tone}`}><StatusIcon status={job.status} /> {status.label}</div>
              <div className="mt-2 line-clamp-2 text-xs leading-5 text-white/65">{job.prompt}</div>
            </div>
            {job.quote && <div className="shrink-0 text-right"><div className="text-xs font-bold">{money(job.quote.price)}</div>{job.quote.estimated && <div className="mt-1 text-[9px] text-white/35">estimate</div>}</div>}
          </div>
          {job.requestId && <div className="mt-2 truncate font-mono text-[9px] text-white/30" title={job.requestId}>ID {job.requestId}</div>}
          {job.error && <p className="mt-2 text-[10px] leading-4 text-amber-200/75">{job.error}</p>}
          <div className="mt-3 flex items-center gap-3">
            {canCheck && <button onClick={() => onCheck(job)} className="inline-flex min-h-11 items-center gap-1.5 text-[10px] font-semibold text-[#c5b8ff]"><RefreshCw size={11} /> Check now</button>}
            {job.resultUrl && <a href={job.resultUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-[10px] font-semibold text-white/50">Open result <ExternalLink size={11} /></a>}
          </div>
        </article>;
      })}
    </div>
  </section>;
}
