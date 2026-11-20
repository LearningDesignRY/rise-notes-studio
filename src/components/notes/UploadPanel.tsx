import { FileUp, ImageIcon, LayoutList, FileText } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function UploadPanel({ onFile }: { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f && (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))) onFile(f);
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-red">
        New set of notes
      </p>
      <h1 className="mt-3 font-display text-4xl font-semibold leading-tight md:text-5xl">
        Drop in a Rise PDF.
        <br />
        Get branded static notes back.
      </h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Each lesson is read, its interactions are rebuilt for paper, and you can check every block
        before downloading the Word document.
      </p>

      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer.files);
        }}
        className={cn(
          "mt-10 flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card px-6 py-14 text-center transition-colors",
          over ? "border-brand-red bg-accent" : "border-input hover:border-brand-yellow",
        )}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-red text-primary-foreground">
          <FileUp className="h-6 w-6" />
        </span>
        <span className="text-lg font-semibold">Choose the Rise PDF export</span>
        <span className="text-sm text-muted-foreground">
          or drag it here · stays in your browser until converted
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        aria-label="Rise PDF file"
        onChange={(e) => pick(e.target.files)}
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: LayoutList,
            title: "Lessons & blocks",
            text: "Topics become chapters; repeated interaction pages are merged.",
          },
          {
            icon: ImageIcon,
            title: "Pictures",
            text: "Photos are pulled out. Missing graphics get an IMAGE NEEDED box.",
          },
          {
            icon: FileText,
            title: "Word output",
            text: "Cover, contents, brand callouts, figures and footer, ready to edit.",
          },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-lg border bg-card p-4">
            <Icon className="h-5 w-5 text-brand-red" />
            <p className="mt-2 font-semibold">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReadingPanel({ page, total }: { page: number; total: number }) {
  const pct = total ? Math.round((page / total) * 100) : 0;
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-24 text-center">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-brand-red transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-6 font-display text-2xl font-semibold">Reading the PDF…</p>
      <p className="mt-2 text-muted-foreground">
        {total ? `Page ${page} of ${total}` : "Opening file"} · pulling out text and pictures
      </p>
    </div>
  );
}
