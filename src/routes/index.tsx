import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { AppHeader } from "@/components/notes/AppHeader";
import { ReadingPanel, UploadPanel } from "@/components/notes/UploadPanel";
import { Workspace } from "@/components/notes/Workspace";
import { useNotesProject } from "@/hooks/use-notes-project";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Static Notes Studio – Rise PDF to Red & Yellow notes" },
      { name: "description", content: "Upload a Rise lesson PDF and download branded Red & Yellow static notes as a Word document." },
      { property: "og:title", content: "Static Notes Studio – Rise PDF to Red & Yellow notes" },
      { property: "og:description", content: "Upload a Rise lesson PDF and download branded Red & Yellow static notes as a Word document." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const api = useNotesProject();

  if (api.phase === "working" && api.project) return <Workspace api={api} project={api.project} />;

  return (
    <div className="min-h-screen">
      <AppHeader />
      {api.phase === "loading" && (
        <div className="flex justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {api.phase === "empty" && <UploadPanel onFile={(f) => void api.start(f)} />}
      {api.phase === "reading" && <ReadingPanel page={api.readProgress?.page ?? 0} total={api.readProgress?.total ?? 0} />}
    </div>
  );
}
