import type { RawBlock } from "./ai-schema";
import { BLOCK_TYPES, CALLOUT_VARIANTS, type Block, type BlockType, type CalloutVariant, type Project } from "./types";

let seq = 0;
export function newId(prefix = "b"): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const IMAGE_TYPES: BlockType[] = ["image", "image_text", "hotspot"];

function clean(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.replace(/\r/g, "").trim();
  return t.length ? t : null;
}

export function stripFigurePrefix(caption: string | null): string | null {
  if (!caption) return caption;
  return clean(caption.replace(/^\**\s*(figure|fig\.?)\s*\d+\s*[:.\-–]\s*\**\s*/i, ""));
}

export function emptyBlock(type: BlockType): Block {
  return {
    id: newId(),
    type,
    level: type === "heading" ? 2 : null,
    text: null,
    title: null,
    variant: type === "callout" ? "quick_insight" : null,
    items: ["bullets", "numbered", "checklist", "steps", "hotspot", "knowledge_check"].includes(type) ? [] : null,
    table: type === "table" ? { headers: ["Column 1", "Column 2"], rows: [["", ""]] } : null,
    imageId: null,
    imageSide: type === "image_text" ? "left" : null,
    caption: null,
    sourcePage: null,
    answer: null,
  };
}

/** Turn the AI's raw blocks into app blocks. Unknown picture ids become "image needed" placeholders. */
export function normalizeBlocks(raw: RawBlock[], knownImageIds: Set<string>): Block[] {
  const out: Block[] = [];
  for (const r of raw) {
    if (!r || !BLOCK_TYPES.includes(r.type as BlockType)) continue;
    let type = r.type as BlockType;
    const variant = CALLOUT_VARIANTS.includes(r.variant as CalloutVariant) ? (r.variant as CalloutVariant) : null;
    let imageId = clean(r.image_id);
    let text = clean(r.text);
    if (IMAGE_TYPES.includes(type) && (!imageId || !knownImageIds.has(imageId))) {
      // Picture referenced but not available: keep the content, flag the picture.
      if (type === "image_text" && text) {
        out.push({ ...emptyBlock("paragraph"), text, sourcePage: r.source_page ?? null });
      }
      if (type === "hotspot" && r.items?.length) {
        out.push({
          ...emptyBlock("image_needed"),
          text: "Labelled graphic from the Rise lesson (picture could not be extracted).",
          caption: stripFigurePrefix(clean(r.caption)),
          sourcePage: r.source_page ?? null,
        });
        out.push({ ...emptyBlock("steps"), items: r.items.map((i) => ({ title: clean(i.title), text: i.text.trim() })) });
        continue;
      }
      type = "image_needed";
      text = type === "image_needed" && r.type === "image_text" ? "Picture shown beside the text in Rise." : "Picture from the Rise lesson could not be extracted.";
      imageId = null;
    }
    const items = r.items?.map((i) => ({ title: clean(i.title), text: (i.text ?? "").trim() })).filter((i) => i.text || i.title) ?? null;
    const block: Block = {
      id: newId(),
      type,
      level: type === "heading" ? Math.min(3, Math.max(1, r.level ?? 2)) : null,
      text,
      title: clean(r.title),
      variant: type === "callout" ? (variant ?? "information") : null,
      items: items && items.length ? items : ["bullets", "numbered", "checklist", "steps", "hotspot", "knowledge_check"].includes(type) ? [] : null,
      table:
        type === "table" && r.table
          ? { headers: r.table.headers.map((h) => h.trim()), rows: r.table.rows.map((row) => row.map((c) => c.trim())) }
          : null,
      imageId,
      imageSide: type === "image_text" ? (r.image_side === "right" ? "right" : "left") : null,
      caption: stripFigurePrefix(clean(r.caption)),
      sourcePage: r.source_page ?? null,
      answer: clean(r.answer),
    };
    // Drop blocks with no content at all.
    const hasContent =
      block.text || block.title || block.items?.length || block.table || block.imageId || block.type === "image_needed";
    if (!hasContent) continue;
    out.push(block);
  }
  return out;
}

/** Whether a block appears in the exported document under the current settings. */
export function isExported(block: Block, project: Pick<Project, "settings">): boolean {
  if (block.type === "knowledge_check") return project.settings.includeKnowledgeChecks;
  return true;
}

/** Figure numbers keyed by block id, counting only exported blocks with a caption. */
export function figureNumbers(project: Pick<Project, "lessons" | "settings">): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const lesson of project.lessons)
    for (const b of lesson.blocks) {
      if (!isExported(b, project)) continue;
      if (["image", "image_text", "hotspot", "image_needed"].includes(b.type) && b.caption) map.set(b.id, ++n);
    }
  return map;
}

export function docxFileName(project: Pick<Project, "moduleNumber" | "moduleTitle">): string {
  const title = (project.moduleTitle || "Static notes").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
  return `${project.moduleNumber ? `M${project.moduleNumber}_` : ""}${title}.docx`;
}
