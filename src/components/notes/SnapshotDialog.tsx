import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { loadPdf } from "@/lib/notes/storage.client";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Lets the user drag a box on a PDF page and returns that area as a picture. */
export function SnapshotDialog({
  open,
  onOpenChange,
  initialPage,
  pageCount,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialPage: number;
  pageCount: number;
  onPick: (blob: Blob, width: number, height: number) => void;
}) {
  const [page, setPage] = useState(initialPage);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (open) setPage(Math.min(Math.max(1, initialPage), pageCount || 1));
  }, [open, initialPage, pageCount]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setRect(null);
    (async () => {
      const data = await loadPdf();
      if (!data) return;
      const { renderPage } = await import("@/lib/pdf/extract.client");
      const canvas = await renderPage(data, page, 1.4);
      if (alive) setPreview(canvas.toDataURL("image/jpeg", 0.85));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [open, page]);

  const rel = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const use = async () => {
    if (!rect) return;
    setBusy(true);
    try {
      const data = await loadPdf();
      if (!data) return;
      const { renderPage, canvasToBlob } = await import("@/lib/pdf/extract.client");
      const full = await renderPage(data, page, 3);
      const c = document.createElement("canvas");
      c.width = Math.round(rect.w * full.width);
      c.height = Math.round(rect.h * full.height);
      c.getContext("2d")!.drawImage(full, rect.x * full.width, rect.y * full.height, c.width, c.height, 0, 0, c.width, c.height);
      const blob = await canvasToBlob(c, "image/png");
      onPick(blob, c.width, c.height);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Use part of a PDF page</DialogTitle>
          <DialogDescription>Drag a box around the graphic you want to place in the notes.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous page" onClick={() => setPage((p) => Math.max(1, p - 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 text-sm">
            Page
            <Input
              className="h-9 w-20"
              type="number"
              min={1}
              max={pageCount}
              value={page}
              onChange={(e) => setPage(Math.min(pageCount, Math.max(1, Number(e.target.value) || 1)))}
            />
            of {pageCount}
          </div>
          <Button variant="outline" size="icon" aria-label="Next page" onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-auto rounded border bg-muted p-2">
          {loading || !preview ? (
            <div className="flex h-96 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div
              ref={box}
              className="relative mx-auto w-fit cursor-crosshair touch-none select-none"
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                const p = rel(e);
                drag.current = p;
                setRect({ x: p.x, y: p.y, w: 0, h: 0 });
              }}
              onPointerMove={(e) => {
                if (!drag.current) return;
                const p = rel(e);
                const s = drag.current;
                setRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
              }}
              onPointerUp={() => (drag.current = null)}
            >
              <img src={preview} alt={`PDF page ${page}`} className="block max-w-full" draggable={false} />
              {rect && rect.w > 0 && (
                <div
                  className="absolute border-2 border-brand-red bg-brand-red/10"
                  style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
                />
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={use} disabled={!rect || rect.w < 0.02 || rect.h < 0.02 || busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Use selected area
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
