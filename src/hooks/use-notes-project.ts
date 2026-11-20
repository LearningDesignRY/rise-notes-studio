import { useCallback, useEffect, useRef, useState } from "react";

import { convertPart, friendlyError } from "@/lib/notes/convert.browser";
import { primeImageUrl } from "@/lib/notes/image-urls.browser";
import { newId, normalizeBlocks } from "@/lib/notes/normalize";
import { clearAll, loadProject, savePdf, saveImage, saveProject } from "@/lib/notes/storage.browser";
import {
  DEFAULT_SETTINGS,
  type Block,
  type ImageMeta,
  type Lesson,
  type Project,
} from "@/lib/notes/types";

export type Phase = "loading" | "empty" | "reading" | "working";

const CONCURRENCY = 2;

export function useNotesProject() {
  const [project, setProject] = useState<Project | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [readProgress, setReadProgress] = useState<{ page: number; total: number } | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [halt, setHalt] = useState<string | null>(null);
  const projectRef = useRef<Project | null>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const queue = useRef<string[]>([]);
  const haltRef = useRef(false);

  // Restore saved work.
  useEffect(() => {
    loadProject().then((p) => {
      if (p) {
        const fixed: Project = {
          ...p,
          lessons: p.lessons.map((l) => (l.status === "running" ? { ...l, status: "pending" } : l)),
        };
        projectRef.current = fixed;
        setProject(fixed);
        setPhase("working");
      } else setPhase("empty");
    });
  }, []);

  // Persist (debounced).
  useEffect(() => {
    if (!project) return;
    const t = setTimeout(() => void saveProject(project), 400);
    return () => clearTimeout(t);
  }, [project]);

  const update = useCallback((fn: (p: Project) => Project) => {
    setProject((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      projectRef.current = next;
      return next;
    });
  }, []);

  const updateLesson = useCallback(
    (lessonId: string, fn: (l: Lesson) => Lesson) =>
      update((p) => ({ ...p, lessons: p.lessons.map((l) => (l.id === lessonId ? fn(l) : l)) })),
    [update],
  );

  const runLesson = useCallback(
    async (lessonId: string) => {
      const p = projectRef.current;
      const lesson = p?.lessons.find((l) => l.id === lessonId);
      if (!p || !lesson) return;
      const ctrl = new AbortController();
      controllers.current.set(lessonId, ctrl);
      updateLesson(lessonId, (l) => ({ ...l, status: "running", error: null }));
      setProgress((pr) => ({ ...pr, [lessonId]: 0 }));
      const parts = lesson.sourceText.split("\n<<<PART>>>\n");
      const known = new Set(Object.keys(p.images));
      try {
        const blocks: Block[] = [];
        let base = 0;
        let last = 0;
        for (let i = 0; i < parts.length; i++) {
          let attempt = 0;
          while (true) {
            try {
              const raw = await convertPart(
                {
                  lessonTitle: lesson.title,
                  moduleTitle: p.moduleTitle,
                  text: parts[i] ?? "",
                  part: i + 1,
                  partCount: parts.length,
                },
                ctrl.signal,
                (chars) => {
                  last = chars;
                  setProgress((pr) => ({ ...pr, [lessonId]: base + chars }));
                },
              );
              blocks.push(...normalizeBlocks(raw, known));
              base += last;
              break;
            } catch (err) {
              const info = friendlyError(err);
              if (info.retryable && attempt === 0 && !ctrl.signal.aborted) {
                attempt++;
                await new Promise((r) => setTimeout(r, 6000 + Math.random() * 4000));
                continue;
              }
              throw err;
            }
          }
        }
        updateLesson(lessonId, (l) => ({ ...l, status: "done", error: null, blocks }));
      } catch (err) {
        const info = friendlyError(err);
        updateLesson(lessonId, (l) => ({ ...l, status: "error", error: info.message }));
        if (info.stopAll) {
          haltRef.current = true;
          setHalt(info.message);
          queue.current = [];
        }
      } finally {
        controllers.current.delete(lessonId);
      }
    },
    [updateLesson],
  );

  const pump = useCallback(async () => {
    const worker = async () => {
      while (queue.current.length && !haltRef.current) {
        const id = queue.current.shift()!;
        await runLesson(id);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  }, [runLesson]);

  const enqueue = useCallback(
    (ids: string[]) => {
      haltRef.current = false;
      setHalt(null);
      const idle = queue.current.length === 0 && controllers.current.size === 0;
      for (const id of ids)
        if (!queue.current.includes(id) && !controllers.current.has(id)) queue.current.push(id);
      if (idle) void pump();
    },
    [pump],
  );

  const start = useCallback(
    async (file: File) => {
      setPhase("reading");
      setHalt(null);
      setReadProgress({ page: 0, total: 0 });
      controllers.current.forEach((c) => c.abort());
      queue.current = [];
      await clearAll();
      const data = await file.arrayBuffer();
      await savePdf(data);
      const { extractPdf } = await import("@/lib/pdf/extract.browser");
      const { splitLessons } = await import("@/lib/pdf/serialize");
      const result = await extractPdf(data, (page, total) => setReadProgress({ page, total }));
      const images: Record<string, ImageMeta> = {};
      for (const img of result.images) {
        await saveImage(img.meta.id, img.blob);
        primeImageUrl(img.meta.id, img.blob);
        images[img.meta.id] = img.meta;
      }
      const split = splitLessons(result.pages);
      const lessons: Lesson[] = split.lessons.map((l) => ({
        id: newId("lesson"),
        title: l.title,
        fromPage: l.fromPage,
        toPage: l.toPage,
        sourceText: l.parts.join("\n<<<PART>>>\n"),
        status: "pending",
        error: null,
        blocks: [],
      }));
      const proj: Project = {
        id: newId("project"),
        fileName: file.name,
        pageCount: result.pageCount,
        courseName: split.courseName,
        moduleNumber: split.moduleNumber,
        moduleTitle: split.moduleTitle,
        createdAt: Date.now(),
        settings: { ...DEFAULT_SETTINGS },
        lessons,
        images,
      };
      projectRef.current = proj;
      setProject(proj);
      await saveProject(proj);
      setPhase("working");
      setReadProgress(null);
      enqueue(lessons.map((l) => l.id));
    },
    [enqueue],
  );

  const stopLesson = useCallback((lessonId: string) => {
    queue.current = queue.current.filter((id) => id !== lessonId);
    controllers.current.get(lessonId)?.abort();
  }, []);

  const reset = useCallback(async () => {
    controllers.current.forEach((c) => c.abort());
    queue.current = [];
    await clearAll();
    projectRef.current = null;
    setProject(null);
    setPhase("empty");
  }, []);

  const addImage = useCallback(
    async (blob: Blob, width: number, height: number, origin: ImageMeta["origin"]) => {
      const id = newId(origin === "upload" ? "up" : "snap");
      await saveImage(id, blob);
      primeImageUrl(id, blob);
      const mime = blob.type === "image/png" ? "image/png" : "image/jpeg";
      const meta: ImageMeta = { id, width, height, mime, pages: [], markers: [], origin };
      update((p) => ({ ...p, images: { ...p.images, [id]: meta } }));
      return meta;
    },
    [update],
  );

  return {
    project,
    phase,
    readProgress,
    progress,
    halt,
    start,
    reset,
    update,
    updateLesson,
    enqueue,
    stopLesson,
    addImage,
    isQueued: (id: string) => queue.current.includes(id),
  };
}

export type NotesApi = ReturnType<typeof useNotesProject>;
