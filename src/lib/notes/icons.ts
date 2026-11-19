import type { CalloutVariant } from "./types";

/** Brand icon file (src/assets/brand/icons/<name>.png) used for each callout kind. */
export const ICON_FOR: Record<CalloutVariant | "video", string> = {
  quick_insight: "information",
  good_practice: "good-practice",
  key_concept: "key-concept",
  important: "important",
  information: "information",
  example: "example",
  question: "question",
  pause_reflect: "pause-and-reflect",
  case_study: "case-study",
  legal_case_study: "legal-case-study",
  practical_activity: "practical-activity",
  reading_activity: "reading-activity",
  listen: "listen",
  interaction: "online-interactivity",
  completion_time: "completion-time",
  video: "video",
};
