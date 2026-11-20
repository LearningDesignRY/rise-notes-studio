import { Crop, ImagePlus, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useImageUrl } from "@/lib/notes/image-urls.browser";
import {
  BLOCK_LABELS,
  BLOCK_TYPES,
  CALLOUT_LABELS,
  CALLOUT_VARIANTS,
  type Block,
  type BlockType,
  type ImageMeta,
} from "@/lib/notes/types";
import { cn } from "@/lib/utils";

import { SnapshotDialog } from "./SnapshotDialog";

const HAS_TEXT: BlockType[] = [
  "heading",
  "paragraph",
  "statement",
  "callout",
  "quote",
  "image_text",
  "scenario",
  "video",
  "knowledge_check",
  "image_needed",
];
const HAS_ITEMS: BlockType[] = [
  "bullets",
  "numbered",
  "checklist",
  "steps",
  "hotspot",
  "knowledge_check",
];
const TITLED_ITEMS: BlockType[] = ["steps", "hotspot"];
const HAS_IMAGE: BlockType[] = ["image", "image_text", "hotspot"];
const HAS_CAPTION: BlockType[] = ["image", "image_text", "hotspot", "image_needed"];

const TITLE_LABEL: Partial<Record<BlockType, string>> = {
  callout: "Label",
  quote: "Attribution",
  video: "Video title",
  knowledge_check: "Lead-in (shown above the question)",
};
const TEXT_LABEL: Partial<Record<BlockType, string>> = {
  video: "Lead-in sentence",
  knowledge_check: "Question",
  image_needed: "What the designer should create",
};

function Thumb({ id, selected, onClick }: { id: string; selected: boolean; onClick: () => void }) {
  const url = useImageUrl(id);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "aspect-square overflow-hidden rounded border-2 bg-muted",
        selected ? "border-brand-red" : "border-transparent hover:border-brand-yellow",
      )}
    >
      {url && <img src={url} alt="" className="h-full w-full object-contain" />}
    </button>
  );
}

export function BlockEditor({
  block,
  open,
  onOpenChange,
  onSave,
  images,
  pageCount,
  addImage,
}: {
  block: Block | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSave: (b: Block) => void;
  images: Record<string, ImageMeta>;
  pageCount: number;
  addImage: (blob: Blob, w: number, h: number, origin: ImageMeta["origin"]) => Promise<ImageMeta>;
}) {
  const [draft, setDraft] = useState<Block | null>(block);
  const [tableText, setTableText] = useState("");
  const [snapOpen, setSnapOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(block);
    if (block?.table)
      setTableText([block.table.headers, ...block.table.rows].map((r) => r.join(" | ")).join("\n"));
    else setTableText("Column 1 | Column 2\n | ");
  }, [block]);

  if (!draft) return null;
  const set = (patch: Partial<Block>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const t = draft.type;

  const setImage = (meta: ImageMeta) => {
    if (t === "image_needed") set({ type: "image", imageId: meta.id, text: null });
    else set({ imageId: meta.id });
  };

  const upload = async (file: File) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;
    await img.decode();
    const meta = await addImage(file, img.naturalWidth, img.naturalHeight, "upload");
    URL.revokeObjectURL(url);
    setImage(meta);
  };

  const save = () => {
    let out = { ...draft };
    if (t === "table") {
      const lines = tableText.split("\n").filter((l) => l.trim());
      const cells = lines.map((l) => l.split("|").map((c) => c.trim()));
      out = { ...out, table: { headers: cells[0] ?? [], rows: cells.slice(1) } };
    }
    if (HAS_ITEMS.includes(t) && !out.items) out.items = [];
    if (t === "heading" && !out.level) out.level = 2;
    if (t === "callout" && !out.variant) out.variant = "quick_insight";
    onSave(out);
    onOpenChange(false);
  };

  const pdfImages = Object.values(images);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit block</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Block type</Label>
                <Select value={t} onValueChange={(v) => set({ type: v as BlockType })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BLOCK_TYPES.map((bt) => (
                      <SelectItem key={bt} value={bt}>
                        {BLOCK_LABELS[bt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {t === "heading" && (
                <div className="grid gap-1.5">
                  <Label>Level</Label>
                  <Select
                    value={String(draft.level ?? 2)}
                    onValueChange={(v) => set({ level: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Lesson title (new page)</SelectItem>
                      <SelectItem value="2">Section heading</SelectItem>
                      <SelectItem value="3">Sub-heading</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {t === "callout" && (
                <div className="grid gap-1.5">
                  <Label>Icon</Label>
                  <Select
                    value={draft.variant ?? "information"}
                    onValueChange={(v) => set({ variant: v as Block["variant"] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CALLOUT_VARIANTS.map((v) => (
                        <SelectItem key={v} value={v}>
                          {CALLOUT_LABELS[v]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {t === "image_text" && (
                <div className="grid gap-1.5">
                  <Label>Picture side</Label>
                  <Select
                    value={draft.imageSide ?? "left"}
                    onValueChange={(v) => set({ imageSide: v as "left" | "right" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">Left</SelectItem>
                      <SelectItem value="right">Right</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {TITLE_LABEL[t] && (
              <div className="grid gap-1.5">
                <Label>{TITLE_LABEL[t]}</Label>
                <Input
                  value={draft.title ?? ""}
                  onChange={(e) => set({ title: e.target.value || null })}
                />
              </div>
            )}

            {HAS_TEXT.includes(t) && (
              <div className="grid gap-1.5">
                <Label>{TEXT_LABEL[t] ?? "Text"}</Label>
                <Textarea
                  rows={t === "heading" ? 2 : 6}
                  value={draft.text ?? ""}
                  onChange={(e) => set({ text: e.target.value || null })}
                />
                <p className="text-xs text-muted-foreground">
                  Use **double stars** for bold and *single stars* for italic. Blank line = new
                  paragraph.
                </p>
              </div>
            )}

            {HAS_ITEMS.includes(t) && (
              <div className="grid gap-2">
                <Label>{t === "knowledge_check" ? "Options" : "Items"}</Label>
                {(draft.items ?? []).map((it, i) => (
                  <div key={i} className="flex gap-2 rounded-md border p-2">
                    <span className="w-5 pt-2 text-right text-sm font-bold text-brand-yellow">
                      {i + 1}.
                    </span>
                    <div className="grid flex-1 gap-2">
                      {TITLED_ITEMS.includes(t) && (
                        <Input
                          placeholder="Title"
                          value={it.title ?? ""}
                          onChange={(e) =>
                            set({
                              items: draft.items!.map((x, j) =>
                                j === i ? { ...x, title: e.target.value || null } : x,
                              ),
                            })
                          }
                        />
                      )}
                      <Textarea
                        rows={2}
                        value={it.text}
                        onChange={(e) =>
                          set({
                            items: draft.items!.map((x, j) =>
                              j === i ? { ...x, text: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove item"
                      onClick={() => set({ items: draft.items!.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() =>
                    set({ items: [...(draft.items ?? []), { title: null, text: "" }] })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> Add item
                </Button>
              </div>
            )}

            {t === "knowledge_check" && (
              <div className="grid gap-1.5">
                <Label>Answer</Label>
                <Textarea
                  rows={2}
                  value={draft.answer ?? ""}
                  onChange={(e) => set({ answer: e.target.value || null })}
                />
              </div>
            )}

            {t === "table" && (
              <div className="grid gap-1.5">
                <Label>Table</Label>
                <Textarea
                  rows={8}
                  className="font-mono text-xs"
                  value={tableText}
                  onChange={(e) => setTableText(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  One row per line, cells separated by |. The first line is the header row.
                </p>
              </div>
            )}

            {(HAS_IMAGE.includes(t) || t === "image_needed") && (
              <div className="grid gap-2">
                <Label>Picture</Label>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                    <Upload className="mr-1 h-4 w-4" /> Upload picture
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSnapOpen(true)}>
                    <Crop className="mr-1 h-4 w-4" /> Use part of a PDF page
                  </Button>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  aria-label="Upload picture"
                  onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                />
                {pdfImages.length > 0 && (
                  <>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ImagePlus className="h-3.5 w-3.5" /> Or pick a picture already in this lesson
                      set
                    </p>
                    <div className="grid max-h-56 grid-cols-6 gap-2 overflow-y-auto">
                      {pdfImages.map((m) => (
                        <Thumb
                          key={m.id}
                          id={m.id}
                          selected={draft.imageId === m.id}
                          onClick={() => setImage(m)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {HAS_CAPTION.includes(t) && (
              <div className="grid gap-1.5">
                <Label>Figure caption</Label>
                <Textarea
                  rows={2}
                  value={draft.caption ?? ""}
                  onChange={(e) => set({ caption: e.target.value || null })}
                />
                <p className="text-xs text-muted-foreground">
                  “Figure N:” is added automatically. Leave empty for no caption.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save block</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SnapshotDialog
        open={snapOpen}
        onOpenChange={setSnapOpen}
        initialPage={draft.sourcePage ?? 1}
        pageCount={pageCount}
        onPick={async (blob, w, h) => setImage(await addImage(blob, w, h, "snapshot"))}
      />
    </>
  );
}
