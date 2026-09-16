import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { GenerationQuote } from "@/lib/studioStore";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 }).format(value);
}

export default function QuoteConfirmation({
  quote,
  prompt,
  model,
  open,
  onCancel,
  onConfirm,
}: {
  quote?: GenerationQuote;
  prompt: string;
  model: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
    <AlertDialogContent className="glass border-white/[.12] bg-[#121417] text-[#f4f1eb] sm:rounded-[24px]">
      <AlertDialogHeader>
        <div className="eyebrow text-[#c5b8ff]">Price confirmation</div>
        <AlertDialogTitle className="display-face text-2xl">Review before Atlas starts</AlertDialogTitle>
        <AlertDialogDescription className="text-white/48">This quote is calculated by Atlas for the exact model and settings below. No generation has been submitted yet.</AlertDialogDescription>
      </AlertDialogHeader>
      <div className="rounded-xl border border-white/[.09] bg-black/20 p-4">
        <div className="flex items-end justify-between gap-4"><span className="text-xs text-white/45">Quoted price</span><strong className="text-2xl">{quote ? money(quote.price) : "—"}</strong></div>
        {quote?.originPrice !== undefined && quote.originPrice !== quote.price && <div className="mt-1 text-right text-[10px] text-white/35 line-through">{money(quote.originPrice)}</div>}
        <div className="mt-4 border-t border-white/[.07] pt-3"><div className="truncate text-[10px] text-white/35">{model}</div><p className="mt-2 line-clamp-3 text-xs leading-5 text-white/65">{prompt}</p></div>
        {quote?.estimated && <p className="mt-3 text-[10px] leading-4 text-amber-200/70">Atlas marks this as an estimate; token-based usage can make the final amount differ.</p>}
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel className="border-white/[.1] bg-transparent text-white hover:bg-white/[.05] hover:text-white">Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm} className="bg-[#c5b8ff] text-[#17151f] hover:bg-[#b4a5fa]">Confirm and generate · {quote ? money(quote.price) : "—"}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
