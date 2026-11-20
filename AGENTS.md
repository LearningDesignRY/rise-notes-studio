<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project architecture

- PDF reading, image extraction, project storage (IndexedDB) and Word export all run in the browser; only the per-lesson AI conversion runs on the server (`/api/convert-lesson`). Why: single user, no accounts or database needed, and large PDFs never leave the machine except as lesson text.
- Browser-only modules use the `.browser.ts` suffix, not `.client.ts`. Why: `.client.*` files are blocked from the server render graph and break page load.
- pdf.js image decoders and standard fonts are served from `public/pdfjs/` (copied from `node_modules/pdfjs-dist`). Why: Rise exports contain JPEG 2000 images that pdf.js can't decode without them; re-copy after upgrading pdfjs-dist.
- Docx text runs only ever switch bold/italic on, never off. Why: explicit `false` overrides heading styles.
