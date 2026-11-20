import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
  type ParagraphChild,
} from "docx";

import { figureNumbers, isExported } from "@/lib/notes/normalize";
import { ICON_FOR } from "@/lib/notes/icons";
import { paragraphsOf, parseInline } from "@/lib/notes/inline";
import {
  CALLOUT_LABELS,
  DISCLAIMER,
  FOOTER_LINE,
  type Block,
  type Project,
} from "@/lib/notes/types";

export interface DocImage {
  data: Uint8Array;
  width: number;
  height: number;
  type: "png" | "jpg";
}

export interface BrandAssets {
  coverLogo: DocImage;
  headerMark: DocImage;
  icons: Record<string, DocImage>;
}

export interface BuildOptions {
  brand: BrandAssets;
  /** Loads a picture; for hotspots `withMarkers` asks for numbered pins drawn on it. */
  getImage: (id: string, withMarkers: boolean) => Promise<DocImage | null>;
}

type Align = (typeof AlignmentType)[keyof typeof AlignmentType];
type Child = Paragraph | Table;

const FONT = "Plus Jakarta Sans";
const RED = "ED1C24";
const YELLOW = "FCAF17";
const GREY = "666666";
const LIGHT = "F4F4F4";
const CONTENT_PX = 624; // 6.5in at 96 dpi
const CONTENT_DXA = 9360;

function runs(
  text: string,
  base: { bold?: boolean; italic?: boolean; size?: number; color?: string } = {},
): TextRun[] {
  return parseInline(text).map(
    (r) =>
      new TextRun({
        text: r.text,
        bold: base.bold || r.bold,
        italics: base.italic || r.italic,
        ...(base.size ? { size: base.size } : {}),
        ...(base.color ? { color: base.color } : {}),
      }),
  );
}

function body(
  text: string,
  opts: { bold?: boolean; italic?: boolean; align?: Align; indent?: number } = {},
) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.JUSTIFIED,
    ...(opts.indent ? { indent: { left: opts.indent } } : {}),
    children: runs(text, opts),
  });
}

function fit(img: DocImage, maxW: number, maxH: number) {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1.6);
  return { width: Math.round(img.width * scale), height: Math.round(img.height * scale) };
}

function imageRun(img: DocImage, size: { width: number; height: number }, name: string) {
  return new ImageRun({
    type: img.type,
    data: img.data,
    transformation: size,
    altText: { title: name, description: name, name },
  });
}

function caption(n: number | undefined, text: string | null): Paragraph[] {
  if (!text) return [];
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 240 },
      children: [
        ...(n ? [new TextRun({ text: `Figure ${n}: `, bold: true, size: 20 })] : []),
        ...runs(text, { italic: true, size: 20 }),
      ],
    }),
  ];
}

function iconRun(brand: BrandAssets, key: string): ParagraphChild[] {
  const icon = brand.icons[key];
  if (!icon) return [];
  return [imageRun(icon, { width: 35, height: 35 }, key), new TextRun({ text: "  " })];
}

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return {
    top: none,
    bottom: none,
    left: none,
    right: none,
    insideHorizontal: none,
    insideVertical: none,
  };
}

function boxedCell(
  children: Paragraph[],
  border: { style: (typeof BorderStyle)[keyof typeof BorderStyle]; size: number; color: string },
  fill?: string,
): Table {
  return new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    columnWidths: [CONTENT_DXA],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_DXA, type: WidthType.DXA },
            borders: { top: border, bottom: border, left: border, right: border },
            ...(fill ? { shading: { fill, type: ShadingType.CLEAR, color: "auto" } } : {}),
            margins: { top: 160, bottom: 160, left: 200, right: 200 },
            children,
          }),
        ],
      }),
    ],
  });
}

function placeholderBox(label: string, lines: string[]): Table {
  return boxedCell(
    [
      new Paragraph({ children: [new TextRun({ text: label, bold: true, color: RED })] }),
      ...lines.map(
        (l) => new Paragraph({ alignment: AlignmentType.LEFT, children: runs(l, { size: 20 }) }),
      ),
    ],
    { style: BorderStyle.SINGLE, size: 12, color: YELLOW },
    "FFF4D9",
  );
}

let listInstance = 0;

function numberedItems(
  items: { title: string | null; text: string }[],
  titled: boolean,
): Paragraph[] {
  const inst = ++listInstance;
  const out: Paragraph[] = [];
  for (const it of items) {
    if (titled && it.title) {
      out.push(
        new Paragraph({
          numbering: { reference: "numbers", level: 0, instance: inst },
          spacing: { before: 160 },
          keepNext: true,
          children: runs(it.title, { bold: true }),
        }),
      );
      for (const p of paragraphsOf(it.text)) out.push(body(p));
    } else {
      const paras = paragraphsOf(it.title ? `**${it.title}** ${it.text}` : it.text);
      paras.forEach((p, i) =>
        out.push(
          i === 0
            ? new Paragraph({
                numbering: { reference: "numbers", level: 0, instance: inst },
                alignment: AlignmentType.JUSTIFIED,
                children: runs(p),
              })
            : body(p, { indent: 720 }),
        ),
      );
    }
  }
  return out;
}

async function blockToDocx(
  b: Block,
  fig: Map<string, number>,
  opts: BuildOptions,
): Promise<Child[]> {
  const brand = opts.brand;
  switch (b.type) {
    case "heading": {
      const level =
        b.level === 1
          ? HeadingLevel.HEADING_1
          : b.level === 3
            ? HeadingLevel.HEADING_3
            : HeadingLevel.HEADING_2;
      return [new Paragraph({ heading: level, children: runs(b.text ?? "") })];
    }
    case "paragraph":
      return paragraphsOf(b.text).map((p) => body(p));
    case "statement":
      return paragraphsOf(b.text).map((p) => body(p, { bold: true, align: AlignmentType.LEFT }));
    case "scenario":
      return paragraphsOf(b.text).map((p) => body(p, { italic: true }));
    case "quote":
      return [
        ...paragraphsOf(b.text).map(
          (p) =>
            new Paragraph({
              indent: { left: 567 },
              border: { left: { style: BorderStyle.SINGLE, size: 24, color: YELLOW, space: 12 } },
              children: runs(p, { italic: true }),
            }),
        ),
        ...(b.title
          ? [new Paragraph({ indent: { left: 567 }, children: runs(`– ${b.title}`, { size: 20 }) })]
          : []),
      ];
    case "bullets":
      return (b.items ?? []).map(
        (it) =>
          new Paragraph({
            numbering: { reference: "bullets", level: 0 },
            alignment: AlignmentType.JUSTIFIED,
            children: runs(it.title ? `**${it.title}** ${it.text}` : it.text),
          }),
      );
    case "checklist":
      return (b.items ?? []).map(
        (it) =>
          new Paragraph({ numbering: { reference: "checks", level: 0 }, children: runs(it.text) }),
      );
    case "numbered":
      return numberedItems(b.items ?? [], false);
    case "steps":
      return numberedItems(b.items ?? [], true);
    case "callout": {
      const variant = b.variant ?? "information";
      const icon = iconRun(brand, ICON_FOR[variant]);
      if (variant === "interaction" || !b.title) {
        return paragraphsOf(b.text).map(
          (p, i) =>
            new Paragraph({
              spacing: { before: i === 0 ? 240 : 0 },
              alignment: AlignmentType.LEFT,
              children: [...(i === 0 ? icon : []), ...runs(p, { bold: variant === "interaction" })],
            }),
        );
      }
      return [
        new Paragraph({
          spacing: { before: 240 },
          keepNext: true,
          children: [...icon, ...runs(b.title ?? CALLOUT_LABELS[variant], { bold: true })],
        }),
        ...paragraphsOf(b.text).map((p) => body(p)),
      ];
    }
    case "video":
      return [
        new Paragraph({
          spacing: { before: 240 },
          keepNext: true,
          children: [
            ...iconRun(brand, ICON_FOR.video),
            ...runs(b.text ?? b.title ?? "Video", { bold: true }),
          ],
        }),
        placeholderBox("VIDEO SUMMARY NEEDED", [
          `Add a short written summary of the video${b.title ? ` “${b.title}”` : ""}.`,
          ...(b.sourcePage ? [`From Rise PDF page ${b.sourcePage}.`] : []),
        ]),
        new Paragraph({ children: [] }),
      ];
    case "knowledge_check": {
      const out: Child[] = [
        new Paragraph({
          spacing: { before: 240 },
          keepNext: true,
          children: [
            ...iconRun(brand, ICON_FOR.question),
            new TextRun({ text: "Check your understanding", bold: true }),
          ],
        }),
        body(b.text ?? "", { bold: true, align: AlignmentType.LEFT }),
      ];
      (b.items ?? []).forEach((it, i) =>
        out.push(
          new Paragraph({
            indent: { left: 567 },
            children: runs(`${String.fromCharCode(97 + i)}) ${it.text}`),
          }),
        ),
      );
      if (b.answer)
        out.push(
          new Paragraph({
            spacing: { before: 120 },
            children: [new TextRun({ text: "Answer: ", bold: true }), ...runs(b.answer)],
          }),
        );
      return out;
    }
    case "table": {
      const t = b.table;
      if (!t || !t.headers.length) return [];
      const cols = Math.max(t.headers.length, ...t.rows.map((r) => r.length));
      const w = Math.floor(CONTENT_DXA / cols);
      const widths = Array.from({ length: cols }, (_, i) =>
        i === cols - 1 ? CONTENT_DXA - w * (cols - 1) : w,
      );
      const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" };
      const borders = { top: border, bottom: border, left: border, right: border };
      const cell = (text: string, i: number, header: boolean, shade: boolean) =>
        new TableCell({
          width: { size: widths[i] ?? w, type: WidthType.DXA },
          borders,
          verticalAlign: VerticalAlign.TOP,
          ...(header || shade
            ? { shading: { fill: header ? RED : LIGHT, type: ShadingType.CLEAR, color: "auto" } }
            : {}),
          margins: { top: 100, bottom: 100, left: 140, right: 140 },
          children: paragraphsOf(text || " ").map(
            (p) =>
              new Paragraph({
                spacing: { after: 60, line: 300 },
                children: runs(
                  p,
                  header ? { bold: true, color: "FFFFFF", size: 20 } : { size: 20 },
                ),
              }),
          ),
        });
      return [
        new Table({
          width: { size: CONTENT_DXA, type: WidthType.DXA },
          columnWidths: widths,
          rows: [
            new TableRow({
              tableHeader: true,
              children: widths.map((_, i) => cell(t.headers[i] ?? "", i, true, false)),
            }),
            ...t.rows.map(
              (r, ri) =>
                new TableRow({
                  children: widths.map((_, i) => cell(r[i] ?? "", i, false, ri % 2 === 1)),
                }),
            ),
          ],
        }),
        new Paragraph({ children: [] }),
      ];
    }
    case "image":
    case "hotspot": {
      const out: Child[] = [];
      const img = b.imageId ? await opts.getImage(b.imageId, b.type === "hotspot") : null;
      if (img) {
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200 },
            keepNext: !!b.caption,
            children: [imageRun(img, fit(img, CONTENT_PX, 520), b.caption ?? "Figure")],
          }),
        );
        out.push(...caption(fig.get(b.id), b.caption));
      }
      if (b.type === "hotspot") out.push(...numberedItems(b.items ?? [], true));
      return out;
    }
    case "image_text": {
      const img = b.imageId ? await opts.getImage(b.imageId, false) : null;
      const textParas = paragraphsOf(b.text).map((p) => body(p, { align: AlignmentType.LEFT }));
      if (!img) return textParas;
      const imgW = Math.round(CONTENT_DXA * 0.45);
      const gap = 300;
      const txtW = CONTENT_DXA - imgW - gap;
      const imgCell = new TableCell({
        width: { size: imgW, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              imageRun(img, fit(img, Math.round(CONTENT_PX * 0.45), 380), b.caption ?? "Figure"),
            ],
          }),
          ...caption(fig.get(b.id), b.caption),
        ],
      });
      const spacer = new TableCell({
        width: { size: gap, type: WidthType.DXA },
        children: [new Paragraph({ children: [] })],
      });
      const txtCell = new TableCell({
        width: { size: txtW, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        children: textParas.length ? textParas : [new Paragraph({ children: [] })],
      });
      const left = b.imageSide !== "right";
      return [
        new Table({
          width: { size: CONTENT_DXA, type: WidthType.DXA },
          columnWidths: left ? [imgW, gap, txtW] : [txtW, gap, imgW],
          borders: noBorders(),
          rows: [
            new TableRow({
              children: left ? [imgCell, spacer, txtCell] : [txtCell, spacer, imgCell],
            }),
          ],
        }),
        new Paragraph({ children: [] }),
      ];
    }
    case "image_needed":
      return [
        new Paragraph({ spacing: { before: 200 }, children: [] }),
        placeholderBox("IMAGE NEEDED", [
          b.text ?? "Add a picture here.",
          ...(b.sourcePage ? [`From Rise PDF page ${b.sourcePage}.`] : []),
        ]),
        ...caption(fig.get(b.id), b.caption),
      ];
    default:
      return [];
  }
}

export async function buildDocx(project: Project, opts: BuildOptions): Promise<Blob> {
  listInstance = 0;
  const fig = figureNumbers(project);
  const content: Child[] = [];
  let firstHeading = true;
  for (const lesson of project.lessons) {
    for (const b of lesson.blocks) {
      if (!isExported(b, project)) continue;
      if (b.type === "heading" && b.level === 1) {
        if (!firstHeading) content.push(new Paragraph({ children: [new PageBreak()] }));
        firstHeading = false;
      }
      content.push(...(await blockToDocx(b, fig, opts)));
    }
  }

  const { brand } = opts;
  const cover: Child[] = [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [imageRun(brand.coverLogo, fit(brand.coverLogo, 107, 83), "Red & Yellow logo")],
    }),
    new Paragraph({
      spacing: { before: 2200 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: (project.courseName || "Course name").toUpperCase(),
          bold: true,
          size: 62,
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 600 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Module ${project.moduleNumber || "–"}:`, size: 52 })],
    }),
    new Paragraph({
      spacing: { before: 240 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: project.moduleTitle || "Module title", size: 52 })],
    }),
    new Paragraph({
      spacing: { before: 360 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Downloadable PDF", italics: true, size: 38 })],
    }),
    new Paragraph({ spacing: { before: 1200 }, children: [] }),
    boxedCell(
      [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 0, line: 300 },
          children: [new TextRun({ text: DISCLAIMER, bold: true, size: 20 })],
        }),
      ],
      { style: BorderStyle.SINGLE, size: 8, color: "000000" },
    ),
  ];

  const footer = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_DXA }],
        children: [
          new TextRun({ text: FOOTER_LINE, color: GREY, size: 18 }),
          new TextRun({ children: ["\t", PageNumber.CURRENT], size: 20 }),
        ],
      }),
    ],
  });
  const header = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [imageRun(brand.headerMark, fit(brand.headerMark, 39, 51), "Red & Yellow mark")],
      }),
    ],
  });

  const page = {
    size: { width: 12240, height: 15840 },
    margin: { top: 1440, right: 1440, bottom: 1300, left: 1440, header: 500, footer: 600 },
  };

  const doc = new Document({
    creator: "Red & Yellow Creative School of Business",
    title: `${project.courseName} – Module ${project.moduleNumber}: ${project.moduleTitle}`,
    features: { updateFields: true },
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22 },
          paragraph: { spacing: { after: 160, line: 360 } },
        },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: 40, bold: true, color: "000000" },
          paragraph: { spacing: { before: 0, after: 320 }, outlineLevel: 0, keepNext: true },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: 32, bold: true, color: "000000" },
          paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 1, keepNext: true },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: FONT, size: 24, bold: true, color: "000000" },
          paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 2, keepNext: true },
        },
        {
          id: "TOC1",
          name: "toc 1",
          basedOn: "Normal",
          next: "Normal",
          run: { font: FONT, bold: true, size: 22 },
          paragraph: { spacing: { before: 120, after: 40 } },
        },
        {
          id: "TOC2",
          name: "toc 2",
          basedOn: "Normal",
          next: "Normal",
          run: { font: FONT, size: 22 },
          paragraph: { indent: { left: 360 }, spacing: { after: 40 } },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "●",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
                run: { color: YELLOW, size: 16 },
              },
            },
          ],
        },
        {
          reference: "checks",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "☐",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
                run: { color: RED, font: "Segoe UI Symbol" },
              },
            },
          ],
        },
        {
          reference: "numbers",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 720, hanging: 360 } },
                run: { color: YELLOW, bold: true },
              },
            },
          ],
        },
      ],
    },
    sections: [
      { properties: { page }, children: cover },
      {
        properties: { page },
        headers: { default: header },
        footers: { default: footer },
        children: [
          new Paragraph({
            spacing: { after: 360 },
            children: [new TextRun({ text: "Table of contents", bold: true, size: 52 })],
          }),
          new TableOfContents("Table of contents", { hyperlink: true, headingStyleRange: "1-2" }),
          new Paragraph({ children: [new PageBreak()] }),
          ...content,
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}
