import { createFileRoute } from "@tanstack/react-router";

import { handleConvertLesson } from "@/lib/ai/convert-lesson.server";

export const Route = createFileRoute("/api/convert-lesson")({
  server: { handlers: { POST: ({ request }) => handleConvertLesson(request) } },
});
