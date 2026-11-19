import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Circle,
  Download,
  FilePlus2,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Square,
  Trash2,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { NotesApi } from "@/hooks/use-notes-project";
import { emptyBlock, figureNumbers, isExported } from "@/lib/notes/normalize";
import { BLOCK_LABELS, BLOCK_TYPES, type Block, type Lesson, type Project } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

import { AppHeader } from "./AppHeader";
import { BlockEditor } from "./BlockEditor";
import { BlockView } from "./BlockView";

function StatusIcon({ status }: { status: Lesson["status"] }) {
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-brand-green" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-brand-yellow" />;
  if (status === "error") return <XCircle className="h-4 w-4 text-brand-red" />;
  return <Circle className="h-4 w-4 text-sidebar-foreground/40" />;
}

function needs(lesson: Lesson) {
  return lesson.blocks.filter((b) => b.type === "image_needed" || b.type === "video").length;
}

export function Workspace({ api, project }: { api: NotesApi; project: Project }) {
  const [editing, setEditing] = useState<{ lessonId: string; block: Block } | null>(null);
  const [exporting, setExporting] = useState(false);
  const figures = useMemo(() => figureNumbers(project), [project]);

  const running = project.lessons.some((l) => l.status === "running");
  const done = project.lessons.filter((l) => l.status === "done").length;
  const pending = project.lessons.filter((l) => l.status === "pending" || l.status === "error");
  const totalNeeds = project.lessons.reduce((n, l) => n + needs(l), 0);

  const mutateBlocks = (lessonId: string, fn: (blocks: Block[]) => Block[]) =>
    api.updateLesson(lessonId, (l) => ({ ...l, blocks: fn(l.blocks) }));

  const download = async () => {
    setExporting(true);
    try {
      const { exportDocx } = await import("@/lib/docx/export.client");
      await exportDocx(project);
      toast.success("Word document downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't build the Word document", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
              <FilePlus2 className="mr-1.5 h-4 w-4" /> New PDF
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start over with a new PDF?</AlertDialogTitle>
              <AlertDialogDescription>
                This clears the current notes and any edits. Download the Word document first if you need it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep working</AlertDialogCancel>
              <AlertDialogAction onClick={() => void api.reset()}>Clear and start over</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button size="sm" onClick={download} disabled={exporting || done === 0}>
          {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
          Download Word document
        </Button>
      </AppHeader>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-80 shrink-0 overflow-y-auto bg-sidebar p-5 text-sidebar-foreground lg:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60">Cover details</p>
          <div className="mt-3 grid gap-3">
            <div className="grid gap-1">
              <Label htmlFor="course" className="text-xs text-sidebar-foreground/80">Course name</Label>
              <Input id="course" className="border-sidebar-border bg-sidebar-accent text-sidebar-foreground" value={project.courseName} onChange={(e) => api.update((p) => ({ ...p, courseName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-[72px_1fr] gap-2">
              <div className="grid gap-1">
                <Label htmlFor="modnum" className="text-xs text-sidebar-foreground/80">Module</Label>
                <Input id="modnum" className="border-sidebar-border bg-sidebar-accent text-sidebar-foreground" value={project.moduleNumber} onChange={(e) => api.update((p) => ({ ...p, moduleNumber: e.target.value }))} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="modtitle" className="text-xs text-sidebar-foreground/80">Module title</Label>
                <Input id="modtitle" className="border-sidebar-border bg-sidebar-accent text-sidebar-foreground" value={project.moduleTitle} onChange={(e) => api.update((p) => ({ ...p, moduleTitle: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-md border border-sidebar-border p-3 text-sm">
              <span>
                Include knowledge checks
                <span className="block text-xs text-sidebar-foreground/60">Your finished notes leave them out</span>
              </span>
              <Switch
                checked={project.settings.includeKnowledgeChecks}
                onCheckedChange={(v) => api.update((p) => ({ ...p, settings: { ...p.settings, includeKnowledgeChecks: v } }))}
                aria-label="Include knowledge checks"
              />
            </label>
          </div>

          <div className="mt-7 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/60">
              Lessons · {done}/{project.lessons.length}
            </p>
            {pending.length > 0 && !running && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-sidebar-primary hover:bg-sidebar-accent hover:text-sidebar-primary" onClick={() => api.enqueue(pending.map((l) => l.id))}>
                Convert remaining
              </Button>
            )}
          </div>
          <nav className="mt-2 grid gap-0.5">
            {project.lessons.map((l) => (
              <a key={l.id} href={`#${l.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent">
                <StatusIcon status={l.status} />
                <span className="min-w-0 flex-1 truncate">{l.title}</span>
                {needs(l) > 0 && (
                  <span className="rounded bg-sidebar-primary px-1.5 text-[11px] font-semibold text-sidebar-primary-foreground" title="Pictures or summaries to add">
                    {needs(l)}
                  </span>
                )}
              </a>
            ))}
          </nav>
          <p className="mt-6 text-xs text-sidebar-foreground/50">
            {project.fileName} · {project.pageCount} pages · {Object.keys(project.images).length} pictures
          </p>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-8 md:px-10">
          {api.halt && (
            <div className="mx-auto mb-6 flex max-w-[816px] items-start gap-3 rounded-lg border border-destructive/40 bg-card p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-red" />
              <div>
                <p className="font-semibold">Conversion paused</p>
                <p className="text-muted-foreground">{api.halt}</p>
              </div>
            </div>
          )}
          {totalNeeds > 0 && (
            <div className="mx-auto mb-6 flex max-w-[816px] items-center gap-3 rounded-lg border border-brand-yellow bg-placeholder px-4 py-3 text-sm">
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-yellow px-1.5 text-xs font-bold">{totalNeeds}</span>
              Pictures or video summaries to add. Fill them in here, or search the Word file for “NEEDED”.
            </div>
          )}

          <div className="notes-paper mx-auto max-w-[816px] rounded-sm bg-paper px-8 py-12 shadow-[var(--shadow-paper)] md:px-[72px]">
            {project.lessons.map((lesson, li) => (
              <section key={lesson.id} id={lesson.id} className={cn("scroll-mt-20", li > 0 && "mt-16 border-t border-dashed pt-12")}>
                <div className="mb-4 flex items-center gap-2 font-sans text-xs text-muted-foreground">
                  <StatusIcon status={lesson.status} />
                  <span>
                    Lesson {li + 1} · Rise pages {lesson.fromPage}–{lesson.toPage}
                  </span>
                  <div className="ml-auto flex gap-1">
                    {lesson.status === "running" ? (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => api.stopLesson(lesson.id)}>
                        <Square className="mr-1 h-3 w-3" /> Stop
                      </Button>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                            <RotateCw className="mr-1 h-3 w-3" /> {lesson.status === "done" ? "Convert again" : "Convert"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Convert “{lesson.title}” again?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {lesson.status === "done" ? "Your edits to this lesson will be replaced." : "This lesson will be sent to the AI now."}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => api.enqueue([lesson.id])}>Convert</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>

                {lesson.status !== "done" && (
                  <div className="rounded-md border border-dashed p-6 font-sans">
                    <h1 className="text-muted-foreground">{lesson.title}</h1>
                    {lesson.status === "running" && (
                      <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Rebuilding this lesson… {api.progress[lesson.id] ? `${Math.round(api.progress[lesson.id] / 1000)}k characters written` : "thinking"}
                      </p>
                    )}
                    {lesson.status === "pending" && <p className="mt-2 text-sm text-muted-foreground">Waiting in line.</p>}
                    {lesson.status === "error" && <p className="mt-2 text-sm text-brand-red">{lesson.error}</p>}
                  </div>
                )}

                {lesson.status === "done" && (
                  <div className="space-y-4">
                    {lesson.blocks.map((b, bi) => {
                      const exported = isExported(b, project);
                      return (
                        <div key={b.id} className={cn("group relative -mx-3 rounded-md px-3 py-1 transition-colors hover:bg-muted/60", !exported && "opacity-45")}>
                          {!exported && (
                            <span className="mb-1 inline-block rounded bg-muted px-1.5 font-sans text-[11px] text-muted-foreground">Not in the Word file</span>
                          )}
                          <BlockView block={b} figure={figures.get(b.id)} images={project.images} />
                          <div className="absolute -top-3 right-2 z-10 hidden items-center gap-0.5 rounded-md border bg-card p-0.5 font-sans shadow-sm group-hover:flex group-focus-within:flex">
                            <span className="px-1.5 text-[11px] text-muted-foreground">{BLOCK_LABELS[b.type]}</span>
                            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit block" onClick={() => setEditing({ lessonId: lesson.id, block: b })}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move up" disabled={bi === 0} onClick={() => mutateBlocks(lesson.id, (bs) => { const c = [...bs]; [c[bi - 1], c[bi]] = [c[bi], c[bi - 1]]; return c; })}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move down" disabled={bi === lesson.blocks.length - 1} onClick={() => mutateBlocks(lesson.id, (bs) => { const c = [...bs]; [c[bi + 1], c[bi]] = [c[bi], c[bi + 1]]; return c; })}>
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Add block below">
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                                {BLOCK_TYPES.map((t) => (
                                  <DropdownMenuItem
                                    key={t}
                                    onClick={() => {
                                      const nb = emptyBlock(t);
                                      mutateBlocks(lesson.id, (bs) => [...bs.slice(0, bi + 1), nb, ...bs.slice(bi + 1)]);
                                      setEditing({ lessonId: lesson.id, block: nb });
                                    }}
                                  >
                                    {BLOCK_LABELS[t]}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-brand-red" aria-label="Delete block" onClick={() => mutateBlocks(lesson.id, (bs) => bs.filter((x) => x.id !== b.id))}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        </main>
      </div>

      <BlockEditor
        block={editing?.block ?? null}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        images={project.images}
        pageCount={project.pageCount}
        addImage={api.addImage}
        onSave={(nb) => editing && mutateBlocks(editing.lessonId, (bs) => bs.map((x) => (x.id === nb.id ? nb : x)))}
      />
    </div>
  );
}
