import { describe, expect, it } from "vitest";

import { emptyBlock, figureNumbers, isExported } from "@/lib/notes/normalize";
import { DEFAULT_SETTINGS, FOOTER_LINE, type Block } from "@/lib/notes/types";

const block = (patch: Partial<Block>): Block => ({ ...emptyBlock("paragraph"), ...patch });

describe("static notes rules", () => {
  it("uses the current copyright footer line", () => {
    expect(FOOTER_LINE).toBe(
      "Copyright Red & Yellow Creative School of Business – Do not copy or share",
    );
  });

  it("leaves knowledge checks out of the Word file by default", () => {
    const kc = block({ type: "knowledge_check" });
    expect(isExported(kc, { settings: DEFAULT_SETTINGS })).toBe(false);
    expect(isExported(kc, { settings: { includeKnowledgeChecks: true } })).toBe(true);
  });

  it("numbers figures across lessons, skipping uncaptioned and hidden blocks", () => {
    const a = block({ type: "image", caption: "One" });
    const b = block({ type: "image", caption: null });
    const hidden = block({ type: "knowledge_check", caption: "Quiz" });
    const c = block({ type: "image_needed", caption: "Two" });
    const lessons = [{ blocks: [a, b, hidden] }, { blocks: [c] }] as unknown as Parameters<
      typeof figureNumbers
    >[0]["lessons"];
    const map = figureNumbers({ lessons, settings: DEFAULT_SETTINGS });
    expect(map.get(a.id)).toBe(1);
    expect(map.has(b.id)).toBe(false);
    expect(map.get(c.id)).toBe(2);
  });
});
