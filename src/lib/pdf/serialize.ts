import { lineText, type ImageEl, type PageContent, type PageElement, type TextLine, type TextRun } from "./model";

const NAV_LINE = /^(CONTINUE|SUBMIT|START|STARTCOURSE|TAKEAGAIN|RETRY|NEXT|PREVIOUS|NEXT:.*|PREV:.*|LESSON\d+OF\d+)$/i;
const TOPIC_LINE = /^Topic\s+(\d+)\s+of\s+(\d+)$/i;
const MAX_PART_CHARS = 45000;

export interface LessonChunk {
  title: string;
  fromPage: number;
  toPage: number;
  /** One or more text parts (long lessons are split at page breaks). */
  parts: string[];
}

export interface SplitResult {
  moduleTitle: string;
  moduleNumber: string;
  courseName: string;
  lessons: LessonChunk[];
}

function isNavigation(line: TextLine): boolean {
  const t = lineText(line);
  return t.length === 0 || NAV_LINE.test(t.replace(/\s+/g, ""));
}

function sameStyle(a: TextLine, b: TextLine) {
  return Math.abs(a.size - b.size) < 0.6;
}

function dominant(runs: TextRun[], key: "bold" | "italic") {
  const chars = runs.reduce((n, r) => n + r.text.trim().length, 0);
  if (chars === 0) return false;
  const on = runs.filter((r) => r[key]).reduce((n, r) => n + r.text.trim().length, 0);
  return on / chars > 0.9;
}

function renderRuns(runs: TextRun[], allBold: boolean, allItalic: boolean): string {
  let out = "";
  for (const r of runs) {
    let t = r.text;
    if (!t) continue;
    const lead = t.match(/^\s*/)?.[0] ?? "";
    const trail = t.match(/\s*$/)?.[0] ?? "";
    const core = t.trim();
    if (!core) {
      out += t;
      continue;
    }
    let wrapped = core;
    if (r.italic && !allItalic) wrapped = `*${wrapped}*`;
    if (r.bold && !allBold) wrapped = `**${wrapped}**`;
    t = lead + wrapped + trail;
    out += t;
  }
  return out
    .replace(/\*\*\s*\*\*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Merge consecutive lines of the same style into paragraphs and render them as tagged text. */
export function serializeElements(elements: PageElement[]): string[] {
  const out: string[] = [];
  let para: TextLine[] = [];

  const flush = () => {
    if (para.length === 0) return;
    const runs: TextRun[] = [];
    para.forEach((l, i) => {
      if (i > 0) runs.push({ text: " ", bold: false, italic: false });
      runs.push(...l.runs);
    });
    const b = dominant(runs, "bold");
    const it = dominant(runs, "italic");
    const first = para[0];
    const tag = `[s=${first.size.toFixed(1)}${b ? " b" : ""}${it ? " i" : ""}] x=${Math.round(first.x)}`;
    const text = renderRuns(runs, b, it);
    if (text) out.push(`${tag} ${text}`);
    para = [];
  };

  for (const el of elements) {
    if (el.kind === "image") {
      flush();
      out.push(describeImage(el));
      continue;
    }
    if (isNavigation(el)) continue;
    const prev = para[para.length - 1];
    if (prev) {
      const gap = el.y - (prev.y + prev.size);
      const aligned = Math.abs(el.x - para[0].x) < 6 || (el.x > para[0].x - 6 && el.x < para[0].x + 40 && para.length > 0 && Math.abs(el.x - prev.x) < 6);
      const startsNumbered = /^\[#\d+\]/.test(lineText(el));
      if (sameStyle(prev, el) && aligned && gap < prev.size * 1.25 && gap > -prev.size * 0.5 && !startsNumbered) {
        para.push(el);
        continue;
      }
    }
    flush();
    para.push(el);
  }
  flush();
  return out;
}

export function describeImage(el: ImageEl): string {
  const size = `${Math.round(el.w)}x${Math.round(el.h)}pt at x=${Math.round(el.x)}`;
  const extra = el.markerCount > 0 ? ` markers=${el.markerCount}` : "";
  const bg = el.background ? " background-with-text-on-top" : "";
  return `[IMAGE ${el.imageId} ${size}${extra}${bg}${el.repeat ? " again" : ""}]`;
}

function plain(s: string) {
  return s.replace(/\*+/g, "").replace(/\s+/g, " ").trim();
}

/** Split the extracted pages into Rise lessons ("Topic X of Y" markers) and serialise each one. */
export function splitLessons(pages: PageContent[]): SplitResult {
  type Marker = { pageIdx: number; elIdx: number };
  const markers: Marker[] = [];
  pages.forEach((p, pageIdx) =>
    p.elements.forEach((el, elIdx) => {
      if (el.kind === "text" && TOPIC_LINE.test(lineText(el))) markers.push({ pageIdx, elIdx });
    }),
  );

  // Module title: biggest text on the first page.
  let moduleTitleRaw = "";
  let biggest = 0;
  for (const el of pages[0]?.elements ?? []) {
    if (el.kind === "text" && el.size > biggest && lineText(el).length > 3) {
      biggest = el.size;
      moduleTitleRaw = plain(lineText(el));
    }
  }
  const m = moduleTitleRaw.match(/Module\s+(\d+)\s*[:\-–.]\s*(.+)/i);
  const moduleNumber = m ? m[1] : "";
  const moduleTitle = m ? m[2].trim() : moduleTitleRaw;

  let courseName = "";
  outer: for (const p of pages.slice(0, 6)) {
    const text = plain(
      p.elements
        .filter((e): e is TextLine => e.kind === "text")
        .map(lineText)
        .join(" "),
    );
    const cm = text.match(/Red\s*&\s*Yellow['’]s\s+(.+?)\s+(short\s+)?course/i);
    if (cm) {
      courseName = cm[1].trim();
      break outer;
    }
  }

  const sections: { title: string; elements: { page: number; el: PageElement }[] }[] = [];
  if (markers.length === 0) {
    // No Rise topic markers: chunk every 12 pages.
    for (let i = 0; i < pages.length; i += 12) {
      const slice = pages.slice(i, i + 12);
      sections.push({
        title: `Pages ${slice[0].page}–${slice[slice.length - 1].page}`,
        elements: slice.flatMap((p) => p.elements.map((el) => ({ page: p.page, el }))),
      });
    }
  } else {
    markers.forEach((mk, i) => {
      const next = markers[i + 1];
      const els: { page: number; el: PageElement }[] = [];
      for (let pi = mk.pageIdx; pi < (next ? next.pageIdx + 1 : pages.length); pi++) {
        const p = pages[pi];
        p.elements.forEach((el, ei) => {
          if (pi === mk.pageIdx && ei <= mk.elIdx) return;
          if (next && pi === next.pageIdx && ei >= next.elIdx) return;
          els.push({ page: p.page, el });
        });
      }
      const titleEl = els.find((e) => e.el.kind === "text" && e.el.size >= 15);
      const title = titleEl && titleEl.el.kind === "text" ? plain(lineText(titleEl.el)) : `Lesson ${i + 1}`;
      sections.push({ title, elements: els });
    });
  }

  const lessons: LessonChunk[] = [];
  for (const s of sections) {
    if (/download this module/i.test(s.title)) continue;
    if (s.elements.length === 0) continue;
    const byPage = new Map<number, PageElement[]>();
    for (const { page, el } of s.elements) {
      if (!byPage.has(page)) byPage.set(page, []);
      byPage.get(page)!.push(el);
    }
    const pageTexts: string[] = [];
    for (const [page, els] of byPage) {
      const lines = serializeElements(els);
      if (lines.length) pageTexts.push(`=== PAGE ${page} ===\n${lines.join("\n")}`);
    }
    const parts: string[] = [];
    let current = "";
    for (const pt of pageTexts) {
      if (current && current.length + pt.length > MAX_PART_CHARS) {
        parts.push(current);
        current = "";
      }
      current += (current ? "\n" : "") + pt;
    }
    if (current) parts.push(current);
    const pagesInLesson = [...byPage.keys()];
    lessons.push({
      title: s.title,
      fromPage: Math.min(...pagesInLesson),
      toPage: Math.max(...pagesInLesson),
      parts,
    });
  }

  return { moduleTitle, moduleNumber, courseName, lessons };
}
