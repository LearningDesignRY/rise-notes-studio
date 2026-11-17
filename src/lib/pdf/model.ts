/** Intermediate, layout-aware representation of a Rise PDF page. Pure data, no pdf.js. */

export interface TextRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

export interface TextLine {
  kind: "text";
  page: number;
  x: number;
  /** Top of the line in points from the top of the page. */
  y: number;
  size: number;
  runs: TextRun[];
}

export interface ImageEl {
  kind: "image";
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  imageId: string;
  markerCount: number;
  repeat: boolean;
  /** Text is printed on top of this picture (Rise banner / statement background). */
  background: boolean;
}

export type PageElement = TextLine | ImageEl;

export interface PageContent {
  page: number;
  elements: PageElement[];
}

export function lineText(line: TextLine): string {
  return line.runs
    .map((r) => r.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
