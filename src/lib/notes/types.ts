/** Shared shapes for a converted set of static notes. Browser + server safe. */

export const CALLOUT_VARIANTS = [
  "quick_insight",
  "good_practice",
  "key_concept",
  "important",
  "information",
  "example",
  "question",
  "pause_reflect",
  "case_study",
  "legal_case_study",
  "practical_activity",
  "reading_activity",
  "listen",
  "interaction",
  "completion_time",
] as const;
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

export const BLOCK_TYPES = [
  "heading",
  "paragraph",
  "statement",
  "bullets",
  "numbered",
  "checklist",
  "callout",
  "quote",
  "image",
  "image_text",
  "hotspot",
  "steps",
  "table",
  "scenario",
  "video",
  "knowledge_check",
  "image_needed",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface Item {
  title: string | null;
  text: string;
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface Block {
  id: string;
  type: BlockType;
  level: number | null;
  text: string | null;
  title: string | null;
  variant: CalloutVariant | null;
  items: Item[] | null;
  table: TableData | null;
  imageId: string | null;
  imageSide: "left" | "right" | null;
  caption: string | null;
  sourcePage: number | null;
  answer: string | null;
}

export type LessonStatus = "pending" | "running" | "done" | "error";

export interface Lesson {
  id: string;
  title: string;
  fromPage: number;
  toPage: number;
  /** Text sent to the AI (kept so a lesson can be re-run). */
  sourceText: string;
  status: LessonStatus;
  error: string | null;
  blocks: Block[];
}

export interface Marker {
  /** Centre of the hotspot marker as a fraction of the image width/height. */
  x: number;
  y: number;
}

export interface ImageMeta {
  id: string;
  width: number;
  height: number;
  mime: "image/png" | "image/jpeg";
  pages: number[];
  markers: Marker[];
  origin: "pdf" | "upload" | "snapshot";
}

export interface NotesSettings {
  includeKnowledgeChecks: boolean;
}

export interface Project {
  id: string;
  fileName: string;
  pageCount: number;
  courseName: string;
  moduleNumber: string;
  moduleTitle: string;
  createdAt: number;
  settings: NotesSettings;
  lessons: Lesson[];
  images: Record<string, ImageMeta>;
}

export const DEFAULT_SETTINGS: NotesSettings = {
  includeKnowledgeChecks: false,
};

export const FOOTER_LINE =
  "Copyright Red & Yellow Creative School of Business – Do not copy or share";

export const DISCLAIMER =
  "Please note that the following document represents a resource for revision and reference. The full learning experience for this course can be accessed from the Red & Yellow learning platform.";

export const CALLOUT_LABELS: Record<CalloutVariant, string> = {
  quick_insight: "Quick insight",
  good_practice: "Good practice",
  key_concept: "Key concept",
  important: "Important",
  information: "Information",
  example: "Example",
  question: "Question",
  pause_reflect: "Pause and reflect",
  case_study: "Case study",
  legal_case_study: "Legal case study",
  practical_activity: "Practical activity",
  reading_activity: "Reading activity",
  listen: "Listen",
  interaction: "Interaction note",
  completion_time: "Completion time",
};

export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  statement: "Statement",
  bullets: "Bullet list",
  numbered: "Numbered list",
  checklist: "Checklist",
  callout: "Callout",
  quote: "Quote",
  image: "Image",
  image_text: "Image beside text",
  hotspot: "Hotspot image + key",
  steps: "Numbered steps",
  table: "Table",
  scenario: "Scenario",
  video: "Video",
  knowledge_check: "Knowledge check",
  image_needed: "Image needed",
};
