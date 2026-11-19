import { Fragment } from "react";

import { paragraphsOf, parseInline } from "@/lib/notes/inline";

export function Inline({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <>
      {parseInline(text).map((r, i) => {
        let node: React.ReactNode = r.text;
        if (r.italic) node = <em>{node}</em>;
        if (r.bold) node = <strong>{node}</strong>;
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}

export function Paras({ text, className }: { text: string | null; className?: string }) {
  return (
    <>
      {paragraphsOf(text).map((p, i) => (
        <p key={i} className={className}>
          <Inline text={p} />
        </p>
      ))}
    </>
  );
}
