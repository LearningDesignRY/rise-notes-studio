import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, jsonSchema, Output, streamText } from "ai";

import { LESSON_OUTPUT_SCHEMA } from "@/lib/notes/ai-schema";
import { CONVERT_INSTRUCTIONS } from "@/lib/notes/prompt.server";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

interface ConvertRequestBody {
  lessonTitle: string;
  moduleTitle: string;
  text: string;
  part: number;
  partCount: number;
}

function errorInfo(error: unknown): { status: number; message: string } {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 500;
    let message = error.message;
    try {
      const body = JSON.parse(error.responseBody ?? "{}");
      message = body?.error?.message ?? body?.message ?? message;
    } catch {
      /* keep SDK message */
    }
    return { status, message };
  }
  if (error instanceof Error && error.name === "AbortError") {
    return { status: 499, message: "Cancelled" };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { status: 500, message };
}

/**
 * Streams NDJSON lines to the browser:
 *   {"t":"d","v":"<json text delta>"} ... {"t":"done"}  or  {"t":"error","status":402,"message":"..."}
 */
export async function handleConvertLesson(request: Request): Promise<Response> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    return Response.json({ message: "The AI service isn't configured." }, { status: 401 });
  }

  let body: ConvertRequestBody;
  try {
    body = (await request.json()) as ConvertRequestBody;
  } catch {
    return Response.json({ message: "Invalid request." }, { status: 400 });
  }
  if (!body?.text || typeof body.text !== "string") {
    return Response.json({ message: "No lesson text received." }, { status: 400 });
  }

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const partNote =
    body.partCount > 1
      ? `\nThis is part ${body.part} of ${body.partCount} of the lesson.${
          body.part > 1
            ? " Do NOT output the level 1 lesson heading again; continue from where the previous part ended."
            : ""
        }`
      : "";

  const result = streamText({
    model: provider.responses(MODEL),
    instructions: CONVERT_INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: `Module: ${body.moduleTitle}\nLesson: ${body.lessonTitle}${partNote}\n\n${body.text}`,
      },
    ],
    output: Output.object({ schema: jsonSchema(LESSON_OUTPUT_SCHEMA as never) }),
    abortSignal: request.signal,
    maxRetries: 1,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const encoder = new TextEncoder();
  const line = (obj: unknown) => encoder.encode(JSON.stringify(obj) + "\n");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sentAny = false;
      try {
        for await (const part of result.stream) {
          if (part.type === "text-delta") {
            sentAny = true;
            controller.enqueue(line({ t: "d", v: part.text }));
          } else if (part.type === "reasoning-delta") {
            controller.enqueue(line({ t: "r" }));
          } else if (part.type === "error") {
            const info = errorInfo(part.error);
            controller.enqueue(line({ t: "error", ...info }));
            controller.close();
            return;
          }
        }
        if (!sentAny) {
          controller.enqueue(
            line({ t: "error", status: 422, message: "The AI returned an empty answer for this lesson." }),
          );
        } else {
          controller.enqueue(line({ t: "done" }));
        }
        controller.close();
      } catch (error) {
        const info = errorInfo(error);
        try {
          controller.enqueue(line({ t: "error", ...info }));
          controller.close();
        } catch {
          /* client went away */
        }
      }
    },
  });

  return withLovableAiGatewayRunIdHeader(
    new Response(stream, {
      headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
    }),
    runIdFetch,
    undefined,
    { waitForUpstreamHeaders: false },
  );
}
