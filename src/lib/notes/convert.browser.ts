import type { RawBlock } from "./ai-schema";

export class ConvertError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ConvertPartInput {
  lessonTitle: string;
  moduleTitle: string;
  text: string;
  part: number;
  partCount: number;
}

/** Calls the server route and reads its NDJSON stream. Resolves with the lesson's raw blocks. */
export async function convertPart(
  input: ConvertPartInput,
  signal: AbortSignal,
  onProgress: (chars: number) => void,
): Promise<RawBlock[]> {
  const res = await fetch("/api/convert-lesson", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = `The converter failed (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* not JSON */
    }
    throw new ConvertError(res.status, message);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let json = "";
  let finished = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as { t: string; v?: string; status?: number; message?: string };
      if (msg.t === "d" && msg.v) {
        json += msg.v;
        onProgress(json.length);
      } else if (msg.t === "error") {
        throw new ConvertError(msg.status ?? 500, msg.message ?? "The converter failed.");
      } else if (msg.t === "done") {
        finished = true;
      }
    }
  }
  if (!finished) throw new ConvertError(500, "The connection closed before the lesson finished.");
  try {
    const parsed = JSON.parse(json) as { blocks?: RawBlock[] };
    return parsed.blocks ?? [];
  } catch {
    throw new ConvertError(422, "The AI answer for this lesson was incomplete.");
  }
}

export function friendlyError(err: unknown): {
  message: string;
  stopAll: boolean;
  retryable: boolean;
} {
  if (err instanceof ConvertError) {
    if (err.status === 402)
      return { message: `Out of AI credits: ${err.message}`, stopAll: true, retryable: false };
    if (err.status === 401 || err.status === 403)
      return { message: err.message, stopAll: true, retryable: false };
    if (err.status === 429)
      return {
        message: "The AI is busy right now. Try this lesson again in a minute.",
        stopAll: false,
        retryable: true,
      };
    if (err.status === 499) return { message: "Stopped.", stopAll: false, retryable: false };
    if (err.status >= 500)
      return { message: err.message || "The AI had a problem.", stopAll: false, retryable: true };
    return { message: err.message, stopAll: false, retryable: false };
  }
  if (err instanceof DOMException && err.name === "AbortError")
    return { message: "Stopped.", stopAll: false, retryable: false };
  return {
    message: err instanceof Error ? err.message : "Something went wrong.",
    stopAll: false,
    retryable: true,
  };
}
