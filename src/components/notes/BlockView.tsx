import { ImageOff } from "lucide-react";

import { ICON_FOR } from "@/lib/notes/icons";
import { useImageUrl } from "@/lib/notes/image-urls.client";
import { CALLOUT_LABELS, type Block, type ImageMeta } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

import { Inline, Paras } from "./Inline";

const iconUrls = import.meta.glob("../../assets/brand/icons/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function iconUrl(name: string) {
  return Object.entries(iconUrls).find(([p]) => p.endsWith(`/${name}.png`))?.[1];
}

function Icon({ name }: { name: string }) {
  const src = iconUrl(name);
  return src ? <img src={src} alt="" className="mr-2 inline-block h-7 w-7 shrink-0 align-middle" /> : null;
}

function Caption({ n, text }: { n?: number | undefined; text: string | null }) {
  if (!text) return null;
  return (
    <p className="mt-2 text-center text-[13px] leading-snug">
      {n ? <strong>Figure {n}: </strong> : null}
      <em>
        <Inline text={text} />
      </em>
    </p>
  );
}

function Picture({ id, meta, markers, className }: { id: string | null; meta?: ImageMeta | undefined; markers?: boolean; className?: string }) {
  const url = useImageUrl(id);
  if (!id || !url)
    return (
      <div className={cn("flex h-40 items-center justify-center rounded bg-muted text-muted-foreground", className)}>
        <ImageOff className="h-6 w-6" />
      </div>
    );
  return (
    <div className={cn("relative mx-auto w-fit", className)}>
      <img src={url} alt="" className="max-h-[420px] w-auto max-w-full" />
      {markers &&
        meta?.markers.map((m, i) => (
          <span
            key={i}
            className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-paper bg-brand-red text-xs font-bold text-primary-foreground"
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
          >
            {i + 1}
          </span>
        ))}
    </div>
  );
}

function NumberedList({ items, titled }: { items: Block["items"]; titled: boolean }) {
  return (
    <ol className="space-y-2">
      {(items ?? []).map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-5 shrink-0 text-right font-bold text-brand-yellow">{i + 1}.</span>
          <div className="min-w-0 flex-1">
            {titled && it.title ? (
              <>
                <p className="font-bold">
                  <Inline text={it.title} />
                </p>
                <Paras text={it.text} className="text-justify" />
              </>
            ) : (
              <Paras text={it.title ? `**${it.title}** ${it.text}` : it.text} className="text-justify" />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Placeholder({ label, lines }: { label: string; lines: (string | null)[] }) {
  return (
    <div className="rounded-md border-2 border-brand-yellow bg-placeholder px-4 py-3 text-[13px]">
      <p className="font-bold text-brand-red">{label}</p>
      {lines.filter(Boolean).map((l, i) => (
        <p key={i}>
          <Inline text={l} />
        </p>
      ))}
    </div>
  );
}

export function BlockView({
  block: b,
  figure,
  images,
}: {
  block: Block;
  figure?: number | undefined;
  images: Record<string, ImageMeta>;
}) {
  switch (b.type) {
    case "heading":
      if (b.level === 1) return <h1><Inline text={b.text} /></h1>;
      if (b.level === 3) return <h3 className="pt-2"><Inline text={b.text} /></h3>;
      return <h2 className="pt-3"><Inline text={b.text} /></h2>;
    case "paragraph":
      return <div className="space-y-3 text-justify"><Paras text={b.text} /></div>;
    case "statement":
      return <div className="space-y-2 font-bold"><Paras text={b.text} /></div>;
    case "scenario":
      return <div className="space-y-3 text-justify italic"><Paras text={b.text} /></div>;
    case "quote":
      return (
        <blockquote className="border-l-4 border-brand-yellow pl-4 italic">
          <Paras text={b.text} />
          {b.title && <p className="mt-1 text-sm not-italic">– {b.title}</p>}
        </blockquote>
      );
    case "bullets":
      return (
        <ul className="space-y-1 pl-1">
          {(b.items ?? []).map((it, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-[0.55em] h-2 w-2 shrink-0 rounded-full bg-brand-yellow" />
              <span><Inline text={it.title ? `**${it.title}** ${it.text}` : it.text} /></span>
            </li>
          ))}
        </ul>
      );
    case "checklist":
      return (
        <ul className="space-y-2 pl-1">
          {(b.items ?? []).map((it, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-[0.35em] h-4 w-4 shrink-0 rounded-sm border-2 border-brand-red" />
              <span><Inline text={it.text} /></span>
            </li>
          ))}
        </ul>
      );
    case "numbered":
      return <NumberedList items={b.items} titled={false} />;
    case "steps":
      return <NumberedList items={b.items} titled />;
    case "callout": {
      const v = b.variant ?? "information";
      if (v === "interaction" || !b.title)
        return (
          <div className="flex items-start">
            <Icon name={ICON_FOR[v]} />
            <div className={cn("space-y-2", v === "interaction" && "font-bold")}><Paras text={b.text} /></div>
          </div>
        );
      return (
        <div>
          <p className="flex items-center font-bold">
            <Icon name={ICON_FOR[v]} />
            <Inline text={b.title ?? CALLOUT_LABELS[v]} />
          </p>
          <div className="mt-2 space-y-3 text-justify"><Paras text={b.text} /></div>
        </div>
      );
    }
    case "video":
      return (
        <div className="space-y-2">
          <p className="flex items-center font-bold">
            <Icon name={ICON_FOR.video} />
            <Inline text={b.text ?? b.title ?? "Video"} />
          </p>
          <Placeholder label="VIDEO SUMMARY NEEDED" lines={[`Add a short written summary of the video${b.title ? ` “${b.title}”` : ""}.`, b.sourcePage ? `From Rise PDF page ${b.sourcePage}.` : null]} />
        </div>
      );
    case "knowledge_check":
      return (
        <div>
          {b.title && <p className="mb-1 text-sm text-muted-foreground"><Inline text={b.title} /></p>}
          <p className="flex items-center font-bold"><Icon name={ICON_FOR.question} />Check your understanding</p>
          <p className="mt-1 font-bold"><Inline text={b.text} /></p>
          <ol className="mt-1 pl-6">
            {(b.items ?? []).map((it, i) => (
              <li key={i}>{String.fromCharCode(97 + i)}) <Inline text={it.text} /></li>
            ))}
          </ol>
          {b.answer && <p className="mt-1"><strong>Answer: </strong><Inline text={b.answer} /></p>}
        </div>
      );
    case "table": {
      const t = b.table;
      if (!t) return null;
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {t.headers.map((h, i) => (
                  <th key={i} className="border border-border bg-brand-red px-3 py-2 text-left font-bold text-primary-foreground"><Inline text={h} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, ri) => (
                <tr key={ri} className={ri % 2 ? "bg-muted" : undefined}>
                  {t.headers.map((_, ci) => (
                    <td key={ci} className="border border-border px-3 py-2 align-top"><Paras text={r[ci] ?? ""} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "image":
      return (
        <figure>
          <Picture id={b.imageId} meta={b.imageId ? images[b.imageId] : undefined} />
          <Caption n={figure} text={b.caption} />
        </figure>
      );
    case "hotspot":
      return (
        <div className="space-y-4">
          <figure>
            <Picture id={b.imageId} meta={b.imageId ? images[b.imageId] : undefined} markers />
            <Caption n={figure} text={b.caption} />
          </figure>
          <NumberedList items={b.items} titled />
        </div>
      );
    case "image_text":
      return (
        <div className={cn("flex items-center gap-6", b.imageSide === "right" && "flex-row-reverse")}>
          <figure className="w-[45%] shrink-0">
            <Picture id={b.imageId} meta={b.imageId ? images[b.imageId] : undefined} />
            <Caption n={figure} text={b.caption} />
          </figure>
          <div className="min-w-0 flex-1 space-y-3"><Paras text={b.text} /></div>
        </div>
      );
    case "image_needed":
      return (
        <div>
          <Placeholder label="IMAGE NEEDED" lines={[b.text ?? "Add a picture here.", b.sourcePage ? `From Rise PDF page ${b.sourcePage}.` : null]} />
          <Caption n={figure} text={b.caption} />
        </div>
      );
    default:
      return null;
  }
}
