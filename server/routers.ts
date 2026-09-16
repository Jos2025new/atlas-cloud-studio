import { COOKIE_NAME } from "@shared/const";
import { assertModelMode, buildAtlasRequestParams, type AtlasModelMode } from "@shared/atlasModels";
import { resolveReferenceRequest } from "@shared/atlasReferenceModels";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const CHAT_BASE = "https://api.atlascloud.ai/v1";
const MEDIA_BASE = "https://api.atlascloud.ai/api/v1";
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

const apiKeySchema = z.string().trim().min(1, "An Atlas Cloud API key is required");
const modelParamsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({});
const referenceUrlsSchema = z.array(z.string().url()).max(10).default([]);

async function parseAtlasResponse(response: Response) {
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text }; }

  if (!response.ok) {
    const body = payload as { message?: string; error?: { message?: string } } | null;
    const message = body?.error?.message || body?.message || `Atlas Cloud returned ${response.status}`;
    const code = response.status === 401 ? "UNAUTHORIZED" : response.status === 429 ? "TOO_MANY_REQUESTS" : "BAD_REQUEST";
    throw new TRPCError({ code, message });
  }
  return payload;
}

async function atlasRequest(url: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return parseAtlasResponse(response);
}

function requestParams(model: string, mode: AtlasModelMode, params: Record<string, unknown>) {
  try {
    assertModelMode(model, mode);
    return buildAtlasRequestParams(model, params);
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Invalid Atlas model parameters.",
    });
  }
}

function mediaRequest(
  model: string,
  mode: "image" | "video",
  referenceUrls: string[] = [],
  finalFrameUrl?: string,
) {
  try {
    return resolveReferenceRequest(model, mode, referenceUrls, finalFrameUrl);
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Invalid reference configuration.",
    });
  }
}

function asyncTask(result: unknown, model: string) {
  const payload = result as { data?: { id?: string; status?: string }; id?: string; status?: string };
  const id = payload.data?.id || payload.id;
  if (!id) throw new TRPCError({ code: "BAD_REQUEST", message: "Atlas Cloud did not return a prediction ID." });
  return { id, status: payload.data?.status || payload.status || "queued", model };
}

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  atlas: router({
    chat: publicProcedure
      .input(z.object({
        apiKey: apiKeySchema,
        model: z.string().trim().min(1),
        messages: z.array(messageSchema).min(1),
        params: modelParamsSchema,
      }))
      .mutation(async ({ input }) => {
        const params = requestParams(input.model, "chat", input.params);
        const result = await atlasRequest(`${CHAT_BASE}/chat/completions`, input.apiKey, {
          method: "POST",
          body: JSON.stringify({ model: input.model, messages: input.messages, ...params }),
        }) as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          model?: string;
        };
        return {
          content: result.choices?.[0]?.message?.content || "Atlas Cloud returned an empty response.",
          finishReason: result.choices?.[0]?.finish_reason || null,
          usage: result.usage || null,
          model: result.model || input.model,
        };
      }),
    uploadMedia: publicProcedure
      .input(z.object({
        apiKey: apiKeySchema,
        fileName: z.string().trim().min(1).max(240),
        mimeType: z.string().trim().regex(/^image\//, "Only image uploads are supported in this workflow."),
        base64: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const bytes = Buffer.from(input.base64, "base64");
        if (!bytes.length) throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded image is empty." });
        if (bytes.length > MAX_UPLOAD_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "Atlas image uploads must be 30 MB or smaller." });

        const formData = new FormData();
        formData.append("file", new Blob([new Uint8Array(bytes)], { type: input.mimeType }), input.fileName);
        const response = await fetch(`${MEDIA_BASE}/model/uploadMedia`, {
          method: "POST",
          headers: { Authorization: `Bearer ${input.apiKey}` },
          body: formData,
        });
        const result = await parseAtlasResponse(response) as { url?: string; data?: { url?: string } };
        const url = result.url || result.data?.url;
        if (!url) throw new TRPCError({ code: "BAD_REQUEST", message: "Atlas Cloud did not return an upload URL." });
        return { url };
      }),
    generateImage: publicProcedure
      .input(z.object({
        apiKey: apiKeySchema,
        model: z.string().trim().min(1),
        prompt: z.string().trim().min(1),
        params: modelParamsSchema,
        referenceUrls: referenceUrlsSchema,
      }))
      .mutation(async ({ input }) => {
        const params = requestParams(input.model, "image", input.params);
        const resolved = mediaRequest(input.model, "image", input.referenceUrls);
        const result = await atlasRequest(`${MEDIA_BASE}/model/generateImage`, input.apiKey, {
          method: "POST",
          body: JSON.stringify({
            model: resolved.modelId,
            prompt: input.prompt,
            ...params,
            ...resolved.referencePayload,
          }),
        });
        return asyncTask(result, resolved.modelId);
      }),
    generateVideo: publicProcedure
      .input(z.object({
        apiKey: apiKeySchema,
        model: z.string().trim().min(1),
        prompt: z.string().trim().min(1),
        params: modelParamsSchema,
        referenceUrls: referenceUrlsSchema,
        finalFrameUrl: z.string().url().optional(),
      }))
      .mutation(async ({ input }) => {
        const params = requestParams(input.model, "video", input.params);
        const resolved = mediaRequest(input.model, "video", input.referenceUrls, input.finalFrameUrl);
        const result = await atlasRequest(`${MEDIA_BASE}/model/generateVideo`, input.apiKey, {
          method: "POST",
          body: JSON.stringify({
            model: resolved.modelId,
            prompt: input.prompt,
            ...params,
            ...resolved.referencePayload,
          }),
        });
        return asyncTask(result, resolved.modelId);
      }),
    prediction: publicProcedure
      .input(z.object({ apiKey: apiKeySchema, id: z.string().trim().min(1) }))
      .query(async ({ input }) => {
        const result = await atlasRequest(
          `${MEDIA_BASE}/model/prediction/${encodeURIComponent(input.id)}`,
          input.apiKey,
          { method: "GET", headers: { "Content-Type": "application/json" } },
        ) as {
          data?: { id?: string; status?: string; outputs?: unknown[]; error?: string | { message?: string } };
        };
        return {
          id: result.data?.id || input.id,
          status: result.data?.status || "processing",
          outputs: result.data?.outputs || [],
          error: typeof result.data?.error === "string" ? result.data.error : result.data?.error?.message || null,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
