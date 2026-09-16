import { Clock3, Image as ImageIcon, LoaderCircle, Video } from "lucide-react";
import type { GenerationJob } from "@/lib/studioStore";

function statusText(job: GenerationJob) {
  if (job.status === "submitting") return "Sending request to Atlas";
  if (job.status === "pending") return "Accepted, waiting in the Atlas queue";
  if (job.status === "timed_out") return "Automatic status checks paused";
  return `Atlas is rendering your ${job.kind}`;
}

export default function GenerationPlaceholder({ job }: { job: GenerationJob }) {
  const timedOut = job.status === "timed_out";
  const Icon = job.kind === "image" ? ImageIcon : Video;
  return <article
    role="status"
    aria-live="polite"
    aria-label={statusText(job)}
    className={`overflow-hidden rounded-2xl border bg-[#101317] ${timedOut ? "border-amber-300/30" : "border-[#c5b8ff]/35"}`}
  >
    <div className="relative grid aspect-square place-items-center overflow-hidden bg-[#0b0d10]">
      <div className="processing-grid absolute inset-0 opacity-70" aria-hidden="true" />
      <div className="relative z-10 max-w-[240px] px-6 text-center">
        <div className={`mx-auto grid h-12 w-12 place-items-center rounded-xl border ${timedOut ? "border-amber-300/35 text-amber-200" : "border-[#c5b8ff]/35 text-[#c5b8ff]"}`}>
          {timedOut ? <Clock3 size={20} /> : <Icon size={20} />}
        </div>
        <div className="mt-4 text-sm font-semibold text-white/90">{statusText(job)}</div>
        <p className="mt-2 text-xs leading-5 text-white/58">
          {timedOut ? "Use Check now in Generation activity to resume." : "The finished result will replace this waiting card automatically."}
        </p>
        {!timedOut && <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-semibold text-[#c5b8ff]"><LoaderCircle size={13} className="animate-spin" /> Processing</div>}
      </div>
    </div>
    <div className="border-t border-white/[.07] p-3">
      <div className="line-clamp-2 text-xs leading-5 text-white/65">{job.prompt}</div>
      {job.requestId && <div className="mt-2 truncate font-mono text-[9px] text-white/38" title={job.requestId}>ID {job.requestId}</div>}
    </div>
  </article>;
}
