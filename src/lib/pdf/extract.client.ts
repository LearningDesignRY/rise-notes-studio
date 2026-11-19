/**
 * Browser-only Rise PDF reader built on pdf.js.
 * Pulls positioned text lines (with size/bold/italic) and decoded pictures out of every page.
 * Import this module dynamically (it touches document / canvas).
 */
import type { ImageEl, PageContent, PageElement, TextLine, TextRun } from "./model";
import { lineText } from "./model";
import type { ImageMeta, Marker } from "@/lib/notes/types";

type PdfJs = typeof import("pdfjs-dist");
type PDFDocumentProxy = import("pdfjs-dist").PDFDocumentProxy;
type PDFPageProxy = import("pdfjs-dist").PDFPageProxy;

let pdfjsPromise: Promise<PdfJs> | null = null;

export function loadPdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= (async () => {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return pdfjsPromise;
}

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({ data: new Uint8Array(data.slice(0)), fontExtraProperties: true }).promise;
}

export interface ExtractedImage {
  meta: ImageMeta;
  blob: Blob;
}

export interface ExtractResult {
  pageCount: number;
  pages: PageContent[];
  images: ExtractedImage[];
}

type Matrix = [number, number, number, number, number, number];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

interface RawImageDraw {
  objId: string | null;
  inline: unknown;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RawRun extends TextRun {
  x: number;
  xEnd: number;
  baseline: number;
  size: number;
}

const PRIVATE_USE = /[\uE000-\uF8FF]/g;
const MAX_SIDE = 2000;

export function collectImageDraws(pdfjs: PdfJs, page: PDFPageProxy, ops: { fnArray: number[]; argsArray: unknown[][] }) {
  const vp = page.getViewport({ scale: 1 });
  const O = pdfjs.OPS;
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  const draws: RawImageDraw[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const a = ops.argsArray[i] as unknown[];
    if (fn === O.save) stack.push([...ctm] as Matrix);
    else if (fn === O.restore) ctm = stack.pop() ?? ctm;
    else if (fn === O.transform) ctm = mul(ctm, a as unknown as Matrix);
    else if (fn === O.paintFormXObjectBegin) {
      stack.push([...ctm] as Matrix);
      const fm = a?.[0] as Matrix | null;
      if (fm && fm.length === 6) ctm = mul(ctm, fm);
    } else if (fn === O.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject) {
      const m = mul(vp.transform as Matrix, ctm);
      const xs = [m[4], m[4] + m[0], m[4] + m[2], m[4] + m[0] + m[2]];
      const ys = [m[5], m[5] + m[1], m[5] + m[3], m[5] + m[1] + m[3]];
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      draws.push({
        objId: fn === O.paintImageXObject ? String(a[0]) : null,
        inline: fn === O.paintInlineImageXObject ? a[0] : null,
        x,
        y,
        w: Math.max(...xs) - x,
        h: Math.max(...ys) - y,
      });
    }
  }
  return draws;
}

function fontFlags(page: PDFPageProxy, fontName: string): { bold: boolean; italic: boolean } {
  let name = "";
  let type3 = false;
  try {
    const f = page.commonObjs.get(fontName) as { name?: string; isType3Font?: boolean } | null;
    name = f?.name ?? "";
    type3 = !!f?.isType3Font;
  } catch {
    /* font not resolved */
  }
  const italic = /italic|oblique/i.test(name);
  const bold = /bold|black|heavy|semibold|demi/i.test(name) || (type3 && !/symbol/i.test(name));
  return { bold, italic };
}

export async function collectText(pdfjs: PdfJs, page: PDFPageProxy, pageNum: number): Promise<TextLine[]> {
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const runs: RawRun[] = [];
  for (const item of tc.items) {
    if (!("str" in item)) continue;
    const str = item.str.replace(PRIVATE_USE, "");
    if (!str) continue;
    const tx = pdfjs.Util.transform(vp.transform, item.transform) as Matrix;
    const size = Math.hypot(tx[2], tx[3]);
    if (size < 3) continue;
    const { bold, italic } = fontFlags(page, item.fontName);
    runs.push({
      text: str,
      bold,
      italic,
      x: tx[4],
      xEnd: tx[4] + item.width * vp.scale,
      baseline: tx[5],
      size,
    });
  }
  // Cluster runs into rows by baseline, then split rows into segments by horizontal gaps.
  runs.sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const rows: RawRun[][] = [];
  for (const r of runs) {
    const row = rows[rows.length - 1];
    if (row?.[0] && Math.abs(row[0].baseline - r.baseline) < Math.max(1.5, r.size * 0.25)) row.push(r);
    else rows.push([r]);
  }
  const lines: TextLine[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let seg: RawRun[] = [];
    const flush = () => {
      if (!seg.length) return;
      const size = Math.max(...seg.map((s) => s.size));
      const out: TextRun[] = [];
      seg.forEach((s, i) => {
        const prev = seg[i - 1];
        let text = s.text;
        if (prev && s.x - prev.xEnd > s.size * 0.15 && !/\s$/.test(prev.text) && !/^\s/.test(text)) text = " " + text;
        out.push({ text, bold: s.bold, italic: s.italic });
      });
      const first = seg[0]!;
      const line: TextLine = { kind: "text", page: pageNum, x: first.x, y: first.baseline - size, size, runs: out };
      if (lineText(line)) lines.push(line);
      seg = [];
    };
    for (const r of row) {
      const prev = seg[seg.length - 1];
      if (prev && r.x - prev.xEnd > Math.max(20, r.size * 2.2)) flush();
      seg.push(r);
    }
    flush();
  }
  // Attach Rise number bubbles ("1", "2"...) to the text beside them.
  const result: TextLine[] = [];
  const consumed = new Set<TextLine>();
  for (const l of lines) {
    const t = lineText(l);
    if (/^\d{1,2}$/.test(t)) {
      const target = lines.find(
        (o) => o !== l && !/^\d{1,2}$/.test(lineText(o)) && o.x > l.x + 15 && o.x < l.x + 120 && Math.abs(o.y - l.y) < 12,
      );
      if (target) {
        target.runs = [{ text: `[#${t}] `, bold: false, italic: false }, ...target.runs];
        consumed.add(l);
      }
    }
  }
  for (const l of lines) if (!consumed.has(l)) result.push(l);
  return result;
}

async function getObj(page: PDFPageProxy, id: string): Promise<unknown> {
  const store = id.startsWith("g_") ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 5000);
    try {
      (store as unknown as { get: (id: string, cb: (o: unknown) => void) => void }).get(id, (o) => {
        clearTimeout(timer);
        resolve(o);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

function objToCanvas(o: unknown): HTMLCanvasElement | null {
  const img = o as { width?: number; height?: number; bitmap?: CanvasImageSource; data?: Uint8Array | Uint8ClampedArray; kind?: number } | null;
  if (!img?.width || !img?.height) return null;
  const { width: w, height: h } = img;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
    return c;
  }
  const src = img.data;
  if (!src) return null;
  const id = ctx.createImageData(w, h);
  const d = id.data;
  if (img.kind === 3) {
    d.set(src.subarray(0, d.length));
  } else if (img.kind === 2) {
    for (let i = 0, j = 0; j < d.length && i + 2 < src.length; i += 3, j += 4) {
      d[j] = src[i]!;
      d[j + 1] = src[i + 1]!;
      d[j + 2] = src[i + 2]!;
      d[j + 3] = 255;
    }
  } else if (img.kind === 1) {
    const rowBytes = (w + 7) >> 3;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const bit = (src[y * rowBytes + (x >> 3)]! >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        const j = (y * w + x) * 4;
        d[j] = d[j + 1] = d[j + 2] = v;
        d[j + 3] = 255;
      }
  } else return null;
  ctx.putImageData(id, 0, 0);
  return c;
}

async function renderPageCanvas(page: PDFPageProxy, scale: number): Promise<HTMLCanvasElement> {
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport: vp } as never).promise;
  return canvas;
}

function cropCanvas(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  c.getContext("2d")!.drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

function fitCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SIDE / Math.max(src.width, src.height));
  if (scale >= 1) return src;
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * scale);
  c.height = Math.round(src.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function signature(c: HTMLCanvasElement): string {
  const s = document.createElement("canvas");
  s.width = 12;
  s.height = 12;
  const ctx = s.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(c, 0, 0, 12, 12);
  const d = ctx.getImageData(0, 0, 12, 12).data;
  let out = `${Math.round((c.width / c.height) * 20)}:`;
  for (let i = 0; i < d.length; i += 4) out += ((d[i]! * 0.3 + d[i + 1]! * 0.59 + d[i + 2]! * 0.11) >> 4).toString(16);
  return out;
}

function hasAlpha(c: HTMLCanvasElement): boolean {
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const step = Math.max(1, Math.floor((c.width * c.height) / 40000));
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4 * step) if (d[i]! < 250) return true;
  return false;
}

export function canvasToBlob(c: HTMLCanvasElement, mime: "image/png" | "image/jpeg"): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), mime, 0.9),
  );
}

interface MarkerObs {
  page: number;
  points: Marker[];
}

function orderMarkers(obs: MarkerObs[]): Marker[] {
  if (!obs.length) return [];
  const full = obs.reduce((a, b) => (b.points.length > a.points.length ? b : a));
  const positions = full.points.slice();
  const ordered: Marker[] = [];
  const near = (a: Marker, b: Marker) => Math.hypot(a.x - b.x, a.y - b.y) < 0.04;
  for (const o of obs) {
    const only = o.points[0];
    if (o.points.length !== 1 || !only) continue;
    const idx = positions.findIndex((p) => near(p, only));
    if (idx >= 0) ordered.push(...positions.splice(idx, 1));
  }
  positions.sort((a, b) => a.y - b.y || a.x - b.x);
  return [...ordered, ...positions];
}

export async function extractPdf(
  data: ArrayBuffer,
  onProgress?: (page: number, total: number) => void,
): Promise<ExtractResult> {
  const pdfjs = await loadPdfjs();
  const doc = await openPdf(data);
  const pages: PageContent[] = [];
  const bySig = new Map<string, string>();
  const images = new Map<string, ExtractedImage>();
  const markerObs = new Map<string, MarkerObs[]>();
  let counter = 0;

  for (let pn = 1; pn <= doc.numPages; pn++) {
    onProgress?.(pn, doc.numPages);
    const page = await doc.getPage(pn);
    const ops = await page.getOperatorList();
    const draws = collectImageDraws(pdfjs, page, ops as never);
    const lines = await collectText(pdfjs, page, pn);

    const big = draws.filter((d) => Math.max(d.w, d.h) >= 70 && Math.min(d.w, d.h) >= 8);
    const small = draws.filter((d) => Math.max(d.w, d.h) < 70 && d.w >= 6 && d.h >= 6);
    const elements: PageElement[] = [...lines];
    let pageCanvas: HTMLCanvasElement | null = null;
    const RENDER_SCALE = 2.5;

    for (const d of big) {
      let canvas = d.objId ? objToCanvas(await getObj(page, d.objId)) : objToCanvas(d.inline);
      if (!canvas) {
        pageCanvas ??= await renderPageCanvas(page, RENDER_SCALE);
        canvas = cropCanvas(pageCanvas, d.x * RENDER_SCALE, d.y * RENDER_SCALE, d.w * RENDER_SCALE, d.h * RENDER_SCALE);
      }
      canvas = fitCanvas(canvas);
      const sig = signature(canvas);
      let id = bySig.get(sig);
      const repeat = !!id;
      if (!id) {
        id = `img_${++counter}`;
        bySig.set(sig, id);
        const alpha = hasAlpha(canvas);
        const mime = alpha ? "image/png" : "image/jpeg";
        const blob = await canvasToBlob(canvas, mime);
        images.set(id, {
          blob,
          meta: { id, width: canvas.width, height: canvas.height, mime, pages: [pn], markers: [], origin: "pdf" },
        });
      } else {
        const meta = images.get(id)!.meta;
        if (!meta.pages.includes(pn)) meta.pages.push(pn);
      }
      // Hotspot pins: small pictures sitting inside this picture.
      const pins = small.filter((s) => {
        const cx = s.x + s.w / 2;
        const cy = s.y + s.h / 2;
        return cx > d.x && cx < d.x + d.w && cy > d.y && cy < d.y + d.h && Math.max(s.w, s.h) <= 50;
      });
      if (pins.length) {
        const pts = pins.map((s) => ({ x: (s.x + s.w / 2 - d.x) / d.w, y: (s.y + s.h / 2 - d.y) / d.h }));
        if (!markerObs.has(id)) markerObs.set(id, []);
        markerObs.get(id)!.push({ page: pn, points: pts });
      }
      const textOnTop = lines.some((l) => {
        const cy = l.y + l.size / 2;
        return l.x > d.x && l.x < d.x + d.w && cy > d.y && cy < d.y + d.h && lineText(l).length > 2;
      });
      const el: ImageEl = {
        kind: "image",
        page: pn,
        x: d.x,
        y: d.y,
        w: d.w,
        h: d.h,
        imageId: id,
        markerCount: pins.length,
        repeat,
        background: textOnTop,
      };
      elements.push(el);
    }

    elements.sort((a, b) => a.y - b.y || a.x - b.x);
    pages.push({ page: pn, elements });
    page.cleanup();
  }

  for (const [id, obs] of markerObs) {
    const img = images.get(id);
    if (img) img.meta.markers = orderMarkers(obs);
  }
  await doc.loadingTask.destroy();
  return { pageCount: pages.length, pages, images: [...images.values()] };
}

/** Render a whole page (for the snapshot picker). */
export async function renderPage(data: ArrayBuffer, pageNum: number, scale: number): Promise<HTMLCanvasElement> {
  const doc = await openPdf(data);
  try {
    const page = await doc.getPage(pageNum);
    return await renderPageCanvas(page, scale);
  } finally {
    await doc.loadingTask.destroy();
  }
}
