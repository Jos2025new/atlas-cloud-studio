import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const CHAT_BASE = "https://api.atlascloud.ai/v1";
const MEDIA_BASE = "https://api.atlascloud.ai/api/v1";

const apiKeySchema = z.string().trim().min(1, "An Atlas Cloud API key is required");

async function atlasRequest(
  url: string,
  apiKey: string,
  init: RequestInit = {},
) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { message: text };
  }

  if (!response.ok) {
    const body = payload as { message?: string; error?: { message?: string } } | null;
    const message = body?.error?.message || body?.message || `Atlas Cloud returned ${response.status}`;
    const code = response.status === 401
      ? "UNAUTHORIZED"
      : response.status === 429
        ? "TOO_MANY_REQUESTS"
        : "BAD_REQUEST";
    throw new TRPCError({ code, message });
  }

  return payload;
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
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().int().min(64).max(4096).optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await atlasRequest(`${CHAT_BASE}/chat/completions`, input.apiKey, {
          method: "POST",
          body: JSON.stringify({
            model: input.model,
            messages: input.messages,
            temperature: input.temperature ?? 0.7,
            max_tokens: input.maxTokens ?? 800,
          }),
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
    generateImage: publicProcedure
      .input(z.object({
        apiKey: apiKeySchema,
        model: z.string().trim().min(1),
        prompt: z.string().trim().min(3),
        aspectRatio: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await atlasRequest(`${MEDIA_BASE}/model/generateImage`, input.apiKey, {
          method: "POST",
          body: JSON.stringify({
            model: input.model,
            prompt: input.prompt,
            ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
          }),
        }) as { data?: { id?: string; status?: string } };
        const id = result.data?.id;
        if (!id) throw new TRPCError({ code: "BAD_REQUEST", message: "Atlas Cloud did not return a prediction ID." });
        return { id, status: result.data?.status || "queued" };
      }),
    generateVideo: publicProcedure
      .input(z.object({
        apiKey: apiKeySchema,
        model: z.string().trim().min(1),
        prompt: z.string().trim().min(3),
        duration: z.number().int().min(2).max(12).optional(),
        aspectRatio: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await atlasRequest(`${MEDIA_BASE}/model/generateVideo`, input.apiKey, {
          method: "POST",
          body: JSON.stringify({
            model: input.model,
            prompt: input.prompt,
            ...(input.duration ? { duration: input.duration } : {}),
            ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
          }),
        }) as { data?: { id?: string; status?: string } };
        const id = result.data?.id;
        if (!id) throw new TRPCError({ code: "BAD_REQUEST", message: "Atlas Cloud did not return a prediction ID." });
        return { id, status: result.data?.status || "queued" };
      }),
    prediction: publicProcedure
      .input(z.object({ apiKey: apiKeySchema, id: z.string().trim().min(1) }))
      .query(async ({ input }) => {
        const result = await atlasRequest(`${MEDIA_BASE}/model/prediction/${encodeURIComponent(input.id)}`, input.apiKey, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        }) as {
          data?: {
            id?: string;
            status?: string;
            outputs?: unknown[];
            error?: string | { message?: string };
          };
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
