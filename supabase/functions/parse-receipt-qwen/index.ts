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
  throw new Error(`parse-receipt-qwen missing env vars: ${missing.join(", ")}`);
}

/** Setup */
const BUCKET = "receipts";
const RECEIPT_MODEL = "qwen/qwen3.6-27b";

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
type ModelExtractItem = {
  name: string;
  lineTotal: number;
  quantity: number;
};
type ModelAdjustment = {
  type: "discount" | "fee" | "other";
  label: string;
  amount: number;
};
type ModelExtract = {
  isValidReceipt: boolean;
  merchantName?: string | null;
  purchaseDateRaw?: string | null;
  currency?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  tip?: number | null;
  total?: number | null;
  items?: ModelExtractItem[] | null;
  adjustments?: ModelAdjustment[] | null;
  unparsedLines?: string[] | null;
};

type ParsedReceiptResponse = {
  success: boolean;
  data?: {
    merchantName: string | null;
    purchaseDate: string | null;
    currency: string;
    items: { name: string; price: number; quantity: number }[];
    adjustments: ModelAdjustment[];
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

type ReconcileInput = {
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  items: Array<{ lineTotal: number }>;
  adjustments: ModelAdjustment[];
};

type NormalizedItem = {
  name: string;
  price: number;
  quantity: number;
};

function coerceAmount(value: unknown): number {
  if (typeof value === "number" && isFinite(value)) return Number(value.toFixed(2));
  if (typeof value === "string") {
    const trimmed = value.trim();
    const isNegative =
      /^-/.test(trimmed) ||
      /-\s*[A-Za-z]*$/.test(trimmed) ||
      /^\(.*\)$/.test(trimmed);
    const numeric = trimmed.replace(/[^\d.]/g, "");
    if (!numeric) return 0;
    const parsed = Number.parseFloat(`${isNegative ? "-" : ""}${numeric}`);
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

function looksLikeDiscountLabel(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9%]+/g, " ");
  if (!normalized) return false;

  return /\b(disc|discount|coupon|rebate|promo|promotion|savings|reward|markdown|less|off)\b/.test(normalized) ||
    /\b(member|instant)\s+savings\b/.test(normalized);
}

function normalizeAdjustmentLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Discount";
  return trimmed.replace(/\s+/g, " ");
}

function extractDiscountAdjustmentsFromItems(items: NormalizedItem[]) {
  const nextItems: NormalizedItem[] = [];
  const derivedAdjustments: ModelAdjustment[] = [];

  for (const item of items) {
    if (item.price < 0) {
      const amount = Math.abs(item.price);
      if (amount > 0) {
        derivedAdjustments.push({
          type: "discount",
          label: normalizeAdjustmentLabel(item.name),
          amount,
        });
        continue;
      }
    }

    nextItems.push(item);
  }

  return { items: nextItems, adjustments: derivedAdjustments };
}

function reconcileTotals({ subtotal, tax, tip, total, items, adjustments }: ReconcileInput) {
  // `lineTotal` is the total shown on the receipt line, not the unit price.
  const itemsSum = items.reduce((a, i) => a + i.lineTotal, 0);
  const nonTaxNonTipAdjustments = adjustments.reduce((sum, adjustment) => {
    const amount = coerceAmount(adjustment.amount);
    if (adjustment.type === "discount") return sum - amount;
    return sum + amount;
  }, 0);
  let nextSubtotal = subtotal || itemsSum;
  const nextTax = tax || 0;
  const nextTip = tip || 0;
  let nextTotal = total || nextSubtotal + nonTaxNonTipAdjustments + nextTax + nextTip;
  const expected = nextSubtotal + nonTaxNonTipAdjustments + nextTax + nextTip;
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

const MODEL_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    isValidReceipt: { type: "boolean" },
    merchantName: { type: ["string", "null"] },
    purchaseDateRaw: { type: ["string", "null"] },
    currency: { type: ["string", "null"] },
    subtotal: { type: ["number", "null"] },
    tax: { type: ["number", "null"] },
    tip: { type: ["number", "null"] },
    total: { type: ["number", "null"] },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          lineTotal: { type: "number" },
          quantity: { type: "number" },
        },
        required: ["name", "lineTotal", "quantity"],
        additionalProperties: false,
      },
    },
    adjustments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["discount", "fee", "other"] },
          label: { type: "string" },
          amount: { type: "number" },
        },
        required: ["type", "label", "amount"],
        additionalProperties: false,
      },
    },
    unparsedLines: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "isValidReceipt",
    "merchantName",
    "purchaseDateRaw",
    "currency",
    "subtotal",
    "tax",
    "tip",
    "total",
    "items",
    "adjustments",
    "unparsedLines",
  ],
  additionalProperties: false,
} as const;

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
  console.log(`[perf][parse-receipt-qwen] ${event}${suffix ? ` ${suffix}` : ""}`);
}

const RESPONSE_FORMAT = { type: "json_object" } as const;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    const candidate = fenced[1].trim();
    if (candidate.startsWith("{") && candidate.endsWith("}")) return candidate;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
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
Return ONLY a valid JSON object with this exact shape:

{
  "isValidReceipt": boolean,
  "merchantName": string | null,
  "purchaseDateRaw": string | null,
  "currency": string | null,
  "subtotal": number | null,
  "tax": number | null,
  "tip": number | null,
  "total": number | null,
  "items": [{"name": string, "lineTotal": number, "quantity": number}],
  "adjustments": [{"type": "discount" | "fee" | "other", "label": string, "amount": number}],
  "unparsedLines": string[]
}

Priorities:
1. Do not silently drop visible monetary lines.
2. If a line is uncertain, include it in "unparsedLines" instead of omitting it.
3. When choosing between "adjustments" and omission, prefer "adjustments" if the line clearly represents money.

General rules:
- Output JSON ONLY. No prose. No markdown. No code fences.
- Numbers must be plain numbers with decimal points and no currency symbols.
- If not a receipt, set isValidReceipt=false and return empty arrays.
- If a scalar value is missing, use null. Arrays must always be present and use [] when empty.
- Read conservatively. Do not invent values that are not visibly supported by the image.

Items:
- Put only purchasable goods or services in "items".
- For each item, set "lineTotal" to the total shown for that line, not the unit price.
- If a line reads like "3 @ 4.69" with a rightmost total of "14.07", return quantity=3 and lineTotal=14.07.
- If quantity is unclear but the line is clearly an item, default quantity to 1.
- Do not classify clearly negative monetary lines as items.

Adjustments:
- Put discounts, coupons, promotions, rebates, credits, markdowns, member savings, and non-item fees in "adjustments".
- For discount adjustments, return type="discount" and return "amount" as a positive magnitude.
- If a receipt prints a discount as "-4.30", "4.30-", "4.30-A", or "(4.30)", return amount=4.30.
- If a standalone line has a negative amount, a trailing-minus amount, or a minus-plus-suffix amount, treat it as an adjustment rather than an item.
- If a line has a code-like or numeric label and a negative amount, prefer classifying it as a discount adjustment rather than omitting it.
- Use type="fee" for service charges, surcharges, deposits, delivery fees, and similar non-tax extras.
- Put tax and tip only in the top-level "tax" and "tip" fields, never in "adjustments".

Do not classify these as items:
- payment/tender lines such as VISA, MASTERCARD, CASH, CHANGE, AUTH, REF, PAYMENT, BALANCE DUE
- summary lines such as SUBTOTAL, TAX, TIP, TOTAL
- standalone negative or trailing-minus monetary lines

Ambiguity:
- If a visible line with text and/or an amount cannot be safely classified, copy that line into "unparsedLines".
- Do not omit visible discount-like lines just because the label is short, numeric, or code-like.

Examples:
- "123456  4.30-" => adjustment { type: "discount", label: "123456", amount: 4.30 }
- "Member Savings  -2.15" => adjustment { type: "discount", label: "Member Savings", amount: 2.15 }
- "Service Fee 3.00" => adjustment { type: "fee", label: "Service Fee", amount: 3.00 }
`;

    const createCompletion = async (transport: "data-url" | "signed-url", value: string) =>
      groq.chat.completions.create({
        model: RECEIPT_MODEL,
        temperature: 0,
        max_tokens: 1200,
        reasoning_format: "hidden",
        reasoning_effort: "none",
        response_format: RESPONSE_FORMAT,
        messages: [
          {
            role: "system",
            content:
              "You are a strict receipt parser for messy real-world receipts. Capture every visible monetary line. Never silently drop discount-like lines. Always return valid JSON only.",
          },
          {
            role: "user",
            content: buildUserContent(schemaText, transport, value),
          },
        ],
      });

    // 3) Groq Chat: try SIGNED URL first
    let completion;
    let content = "";
    let transportUsed: "signed-url" | "data-url" = "signed-url";
    let usedFallback = false;
    let fallbackReason: string | null = null;

    try {
      const modelStartedAt = Date.now();
      completion = await groq.chat.completions.create({
        model: RECEIPT_MODEL,
        temperature: 0,
        max_tokens: 1200,
        reasoning_format: "hidden",
        reasoning_effort: "none",
        response_format: RESPONSE_FORMAT,
        messages: [
          {
            role: "system",
            content:
              "You are a strict receipt parser for messy real-world receipts. Capture every visible monetary line. Never silently drop discount-like lines. Always return valid JSON only.",
          },
          {
            role: "user",
            content: buildUserContent(schemaText, "signed-url", signedUrl),
          },
        ],
      });
      content = completion?.choices?.[0]?.message?.content || "";
      logPerf("model_attempt", {
        transport: "signed-url",
        duration_ms: Date.now() - modelStartedAt,
        content_length: typeof content === "string" ? content.length : 0,
      });
    } catch (error) {
      if (!isLikelyImageTransportError(error)) {
        logPerf("model_error", {
          transport: "signed-url",
          reason: "non_transport_error",
          model: RECEIPT_MODEL,
          error: getErrorMessage(error),
          duration_ms: Date.now() - requestStartedAt,
        });
        throw error;
      }

      // Fall back to base64 only when URL transport likely failed.
      usedFallback = true;
      fallbackReason = "signed_url_transport_error";
      const imgRes = await fetch(signedUrl, { redirect: "follow" });
      if (!imgRes.ok) {
        return json(400, { success: false, error: `Failed to fetch image (${imgRes.status})` });
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      const u8 = new Uint8Array(arrayBuffer);
      const b64 = bytesToBase64(u8);

      transportUsed = "data-url";
      const fallbackStartedAt = Date.now();
      completion = await createCompletion("data-url", b64);
      content = completion?.choices?.[0]?.message?.content || "";
      logPerf("model_attempt", {
        transport: "data-url",
        duration_ms: Date.now() - fallbackStartedAt,
        content_length: typeof content === "string" ? content.length : 0,
        fallback: true,
        fallback_reason: fallbackReason,
      });
    }

    // If signed URL returns empty content, retry once with base64.
    if (!content || typeof content !== "string") {
      usedFallback = true;
      fallbackReason = "empty_content";
      const imgRes = await fetch(signedUrl, { redirect: "follow" });
      if (!imgRes.ok) {
        return json(400, { success: false, error: `Failed to fetch image (${imgRes.status})` });
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      const u8 = new Uint8Array(arrayBuffer);
      const b64 = bytesToBase64(u8);

      transportUsed = "data-url";
      const fallbackStartedAt = Date.now();
      completion = await createCompletion("data-url", b64);
      content = completion?.choices?.[0]?.message?.content || "";
      logPerf("model_attempt", {
        transport: "data-url",
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
        model: RECEIPT_MODEL,
        duration_ms: Date.now() - requestStartedAt,
      });
      return json(502, { success: false, error: "Empty content from model" });
    }

    let parsed: ModelExtract;
    const jsonContent = extractJsonObject(content);
    try {
      parsed = JSON.parse(jsonContent) as ModelExtract;
    } catch {
      logPerf("request_complete", {
        success: false,
        transport: transportUsed,
        fallback: usedFallback,
        fallback_reason: fallbackReason,
        model: RECEIPT_MODEL,
        reason: "invalid_json",
        content_preview: content.slice(0, 200),
        duration_ms: Date.now() - requestStartedAt,
      });
      console.error("[parse-receipt-qwen] Invalid JSON from model", {
        contentPreview: content.slice(0, 1000),
      });
      return json(200, { success: false, error: "Qwen did not return valid receipt JSON." });
    }

    if (!parsed.isValidReceipt) {
      logPerf("request_complete", {
        success: false,
        transport: transportUsed,
        fallback: usedFallback,
        fallback_reason: fallbackReason,
        model: RECEIPT_MODEL,
        duration_ms: Date.now() - requestStartedAt,
        valid_receipt: false,
      });
      return json(200, {
        success: false,
        error: "Image did not contain a valid receipt.",
      });
    }

    // Normalize
    const subtotal = coerceAmount(parsed.subtotal);
    const tax = coerceAmount(parsed.tax);
    const tip = coerceAmount(parsed.tip);
    const total = coerceAmount(parsed.total);

    const parsedAdjustments = Array.isArray(parsed.adjustments)
      ? parsed.adjustments
          .filter((adjustment) => adjustment && adjustment.label && adjustment.type)
          .map((adjustment) => ({
            type: adjustment.type,
            label: adjustment.label.trim(),
            amount:
              adjustment.type === "discount"
                ? Math.abs(coerceAmount(adjustment.amount))
                : coerceAmount(adjustment.amount),
          }))
      : [];

    const normalizedItems = Array.isArray(parsed.items)
      ? parsed.items
          .filter((i) => i && i.name)
          .map((i) => ({
            name: i.name.trim(),
            price: coerceAmount(i.lineTotal),
            quantity: i.quantity && i.quantity > 0 ? Math.round(i.quantity) : 1,
          }))
      : [];

    const derivedDiscounts = extractDiscountAdjustmentsFromItems(normalizedItems);
    const items = derivedDiscounts.items;
    const adjustments = [...parsedAdjustments, ...derivedDiscounts.adjustments];

    const totals = reconcileTotals({
      subtotal,
      tax,
      tip,
      total,
      items: items.map((item) => ({ lineTotal: item.price })),
      adjustments,
    });

    const payload = {
      merchantName: parsed.merchantName?.trim() || null,
      purchaseDate: parsed.purchaseDateRaw ? safeDate(parsed.purchaseDateRaw) : null,
      currency: (parsed.currency?.trim() || "USD") as string,
      items,
      adjustments,
      totals,
      notes: Array.isArray(parsed.unparsedLines) && parsed.unparsedLines.length > 0
        ? `Unparsed lines: ${parsed.unparsedLines.join(" | ")}`
        : null,
      raw: {
        userId: body.userId ?? null,
        model: RECEIPT_MODEL,
        imagePath: body.imagePath,
      },
    };

    logPerf("request_complete", {
      success: true,
      transport: transportUsed,
      fallback: usedFallback,
      fallback_reason: fallbackReason,
      model: RECEIPT_MODEL,
      duration_ms: Date.now() - requestStartedAt,
      item_count: items.length,
    });
    return json(200, { success: true, data: payload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[parse-receipt-qwen] Handler error", { message: msg });
    logPerf("request_complete", {
      success: false,
      transport: null,
      fallback: false,
      fallback_reason: "handler_exception",
      error: msg,
      duration_ms: 0,
    });
    return json(500, { success: false, error: msg });
  }
});
