export interface InlineRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

/** Parse the tiny markdown subset used in notes text: **bold** and *italic*. */
export function parseInline(src: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let bold = false;
  let italic = false;
  let buf = "";
  const push = () => {
    if (buf) runs.push({ text: buf, bold, italic });
    buf = "";
  };
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "*" && src[i + 1] === "*") {
      push();
      bold = !bold;
      i++;
    } else if (src[i] === "*" && /\S/.test(src[i + 1] ?? "") !== /\S/.test(src[i - 1] ?? "")) {
      push();
      italic = !italic;
    } else if (src[i] === "*" && italic) {
      push();
      italic = false;
    } else buf += src[i];
  }
  push();
  return runs;
}

export function stripInline(src: string): string {
  return src.replace(/\*+/g, "");
}

export function paragraphsOf(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
