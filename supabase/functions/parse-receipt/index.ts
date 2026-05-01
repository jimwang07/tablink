/// <reference path="../_shared/edge-runtime.d.ts" />

import OpenAI from "npm:openai";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** CORS */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Required ENV */
const REQUIRED_ENV = ["GROQ_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = REQUIRED_ENV.filter((k) => !Deno.env.get(k));
if (missing.length) {
  throw new Error(`parse-receipt (groq-chat-b64) missing env vars: ${missing.join(", ")}`);
}

/** Setup */
const BUCKET = "receipts";
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// Groq via OpenAI-compatible client, using chat.completions
const groq = new OpenAI({
  apiKey: Deno.env.get("GROQ_API_KEY")!,
  baseURL: "https://api.groq.com/openai/v1",
});

/** Types */
type ReceiptRequest = { imagePath: string; userId?: string };
type ModelExtractItem = { name: string; price: number; quantity: number };
type ModelExtract = {
  isValidReceipt: boolean;
  merchantName?: string | null;
  merchantAddress?: string | null;
  purchaseDate?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  tip?: number | null;
  total?: number | null;
  currency?: string | null;
  items?: ModelExtractItem[] | null;
  notes?: string | null;
};

type ParsedReceiptResponse = {
  success: boolean;
  data?: {
    merchantName: string | null;
    merchantAddress: string | null;
    purchaseDate: string | null;
    currency: string;
    items: { name: string; price: number; quantity: number }[];
    adjustments: { type: "discount" | "service_fee" | "fee" | "other"; label: string; amount: number }[];
    totals: { subtotal: number; tax: number; tip: number; total: number; itemsTotal: number };
    notes: string | null;
    raw: { userId: string | null; model: string; imagePath: string };
  };
  error?: string;
};

/** Utils */
function json(status: number, obj: ParsedReceiptResponse, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

function bytesToBase64(u8: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

type ReconcileInput = { subtotal: number; tax: number; tip: number; total: number; items: ModelExtractItem[] };

function coerceAmount(value: unknown): number {
  if (typeof value === "number" && isFinite(value)) return Number(value.toFixed(2));
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
    if (!Number.isNaN(parsed)) return Number(parsed.toFixed(2));
  }
  return 0;
}

function safeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

function reconcileTotals({ subtotal, tax, tip, total, items }: ReconcileInput) {
  // `price` is the line total shown on the receipt, not the unit price.
  const itemsSum = items.reduce((a, i) => a + i.price, 0);
  let nextSubtotal = subtotal || itemsSum;
  const nextTax = tax || 0;
  const nextTip = tip || 0;
  let nextTotal = total || nextSubtotal + nextTax + nextTip;
  const expected = nextSubtotal + nextTax + nextTip;
  if (nextTotal === 0 || Math.abs(nextTotal - expected) > 0.05) {
    nextTotal = Number(expected.toFixed(2));
  }
  return {
    subtotal: Number(nextSubtotal.toFixed(2)),
    tax: Number(nextTax.toFixed(2)),
    tip: Number(nextTip.toFixed(2)),
    total: Number(nextTotal.toFixed(2)),
    itemsTotal: Number(itemsSum.toFixed(2)),
  };
}

function buildUserContent(schemaText: string, transport: "data-url" | "signed-url", value: string) {
  return [
    { type: "text", text: "Parse this receipt image into the exact JSON schema described." },
    { type: "text", text: schemaText.trim() },
    transport === "data-url"
      ? { type: "image_url", image_url: { url: `data:image/jpeg;base64,${value}` } }
      : { type: "image_url", image_url: { url: value } },
  ] as any;
}

function isLikelyImageTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  return [
    "image",
    "url",
    "fetch",
    "download",
    "unsupported",
    "invalid",
    "timeout",
    "timed out",
    "connection",
    "redirect",
    "403",
    "404",
    "415",
  ].some((token) => normalized.includes(token));
}

function logPerf(event: string, details: Record<string, string | number | boolean | null>) {
  const suffix = Object.entries(details)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  console.log(`[perf][parse-receipt] ${event}${suffix ? ` ${suffix}` : ""}`);
}

/** Handler */
Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { success: false, error: "Method Not Allowed" });

    const body = (await req.json()) as ReceiptRequest;
    if (!body?.imagePath || typeof body.imagePath !== "string") {
      return json(400, { success: false, error: "Missing or invalid imagePath" });
    }
    if (body.imagePath.includes("..")) {
      return json(400, { success: false, error: "Invalid imagePath" });
    }

    // 1) Signed URL
    const signed = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(body.imagePath, 60);
    if (signed.error || !signed.data?.signedUrl) {
      return json(400, { success: false, error: "Unable to sign image URL" });
    }
    const signedUrl = signed.data.signedUrl;
    const requestStartedAt = Date.now();

    // 2) Schema prompt
    const schemaText = `
Return ONLY a valid JSON object with this shape:

{
  "isValidReceipt": boolean,
  "merchantName": string | null,
  "merchantAddress": string | null,
  "purchaseDate": string | null,
  "currency": string | null,
  "subtotal": number | null,
  "tax": number | null,
  "tip": number | null,
  "total": number | null,
  "items": [{"name": string, "price": number, "quantity": number}] | [],
  "notes": string | null
}

Rules:
- Output JSON ONLY (no prose, no code fences).
- Numbers must be plain numbers (no "$").
- If not a receipt, set isValidReceipt=false, items=[], and explain in "notes".
- If date or totals are missing, use null (not strings like "N/A").
- For each item, set "price" to the line total shown on the receipt, not the unit price.
- Example: if a line reads "3 @ 4.69" and the rightmost amount is "14.07", return {"quantity": 3, "price": 14.07}.
- If quantity is unclear, default to 1.
`;

    const createCompletion = async (transport: "data-url" | "signed-url", value: string) =>
      groq.chat.completions.create({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content:
              "You are a strict receipt parsing assistant. Always return valid JSON only, matching the requested shape.",
          },
          {
            role: "user",
            content: buildUserContent(schemaText, transport, value),
          },
        ],
      });

    // 3) Fetch + encode once so this baseline uses DATA URL first.
    const imgRes = await fetch(signedUrl, { redirect: "follow" });
    if (!imgRes.ok) {
      return json(400, { success: false, error: `Failed to fetch image (${imgRes.status})` });
    }
    const arrayBuffer = await imgRes.arrayBuffer();
    const u8 = new Uint8Array(arrayBuffer);
    const b64 = bytesToBase64(u8);

    // 4) Groq Chat: try DATA URL first
    let completion;
    let content = "";
    let transportUsed: "signed-url" | "data-url" = "data-url";
    let usedFallback = false;
    let fallbackReason: string | null = null;

    try {
      const modelStartedAt = Date.now();
      completion = await createCompletion("data-url", b64);
      content = completion?.choices?.[0]?.message?.content || "";
      logPerf("model_attempt", {
        transport: "data-url",
        duration_ms: Date.now() - modelStartedAt,
        content_length: typeof content === "string" ? content.length : 0,
      });
    } catch (error) {
      if (!isLikelyImageTransportError(error)) {
        logPerf("model_error", {
          transport: "data-url",
          reason: "non_transport_error",
          duration_ms: Date.now() - requestStartedAt,
        });
        throw error;
      }

      // Fall back to signed URL when the data URL transport likely failed.
      usedFallback = true;
      fallbackReason = "data_url_transport_error";
      transportUsed = "signed-url";
      const fallbackStartedAt = Date.now();
      completion = await createCompletion("signed-url", signedUrl);
      content = completion?.choices?.[0]?.message?.content || "";
      logPerf("model_attempt", {
        transport: "signed-url",
        duration_ms: Date.now() - fallbackStartedAt,
        content_length: typeof content === "string" ? content.length : 0,
        fallback: true,
        fallback_reason: fallbackReason,
      });
    }

    // If data URL returns empty content, retry once with signed URL.
    if (!content || typeof content !== "string") {
      usedFallback = true;
      fallbackReason = "empty_content";
      transportUsed = "signed-url";
      const fallbackStartedAt = Date.now();
      completion = await createCompletion("signed-url", signedUrl);
      content = completion?.choices?.[0]?.message?.content || "";
      logPerf("model_attempt", {
        transport: "signed-url",
        duration_ms: Date.now() - fallbackStartedAt,
        content_length: typeof content === "string" ? content.length : 0,
        fallback: true,
        fallback_reason: fallbackReason,
      });
    }

    if (!content || typeof content !== "string") {
      logPerf("request_complete", {
        success: false,
        transport: transportUsed,
        fallback: usedFallback,
        fallback_reason: fallbackReason,
        duration_ms: Date.now() - requestStartedAt,
      });
      return json(502, { success: false, error: "Empty content from model" });
    }

    let parsed: ModelExtract;
    try {
      parsed = JSON.parse(content) as ModelExtract;
    } catch {
      logPerf("request_complete", {
        success: false,
        transport: transportUsed,
        fallback: usedFallback,
        fallback_reason: fallbackReason,
        duration_ms: Date.now() - requestStartedAt,
      });
      return json(502, { success: false, error: "Model did not return valid JSON" });
    }

    if (!parsed.isValidReceipt) {
      logPerf("request_complete", {
        success: false,
        transport: transportUsed,
        fallback: usedFallback,
        fallback_reason: fallbackReason,
        duration_ms: Date.now() - requestStartedAt,
        valid_receipt: false,
      });
      return json(200, {
        success: false,
        error: parsed.notes || "Image did not contain a valid receipt.",
      });
    }

    // Normalize
    const subtotal = coerceAmount(parsed.subtotal);
    const tax = coerceAmount(parsed.tax);
    const tip = coerceAmount(parsed.tip);
    const total = coerceAmount(parsed.total);

    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter((i) => i && i.name)
          .map((i) => ({
            name: i.name.trim(),
            price: coerceAmount(i.price),
            quantity: i.quantity && i.quantity > 0 ? Math.round(i.quantity) : 1,
          }))
      : [];

    const totals = reconcileTotals({ subtotal, tax, tip, total, items });

    const payload = {
      merchantName: parsed.merchantName?.trim() || null,
      merchantAddress: parsed.merchantAddress?.trim() || null,
      purchaseDate: parsed.purchaseDate ? safeDate(parsed.purchaseDate) : null,
      currency: (parsed.currency?.trim() || "USD") as string,
      items,
      adjustments: [],
      totals,
      notes: parsed.notes?.trim() || null,
      raw: {
        userId: body.userId ?? null,
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        imagePath: body.imagePath,
      },
    };

    logPerf("request_complete", {
      success: true,
      transport: transportUsed,
      fallback: usedFallback,
      fallback_reason: fallbackReason,
      duration_ms: Date.now() - requestStartedAt,
      item_count: items.length,
    });
    return json(200, { success: true, data: payload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logPerf("request_complete", {
      success: false,
      transport: null,
      fallback: false,
      fallback_reason: "handler_exception",
      duration_ms: 0,
    });
    return json(500, { success: false, error: msg });
  }
});
