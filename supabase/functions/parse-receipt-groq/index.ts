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
  const itemsSum = items.reduce((a, i) => a + i.price * i.quantity, 0);
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

    // 2) Fetch image
    const imgRes = await fetch(signedUrl, { redirect: "follow" });
    if (!imgRes.ok) {
      return json(400, { success: false, error: `Failed to fetch image (${imgRes.status})` });
    }
    const arrayBuffer = await imgRes.arrayBuffer();

    // 3) Base64 encode
    const u8 = new Uint8Array(arrayBuffer);
    const b64 = bytesToBase64(u8);

    // 4) Schema prompt
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
- If quantity is unclear, default to 1.
`;

    // 5) Groq Chat: try DATA-URL first
    let completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: "You are a strict receipt parsing assistant. Always return valid JSON only, matching the requested shape.",
        },
        {
          role: "user",
          content: buildUserContent(schemaText, "data-url", b64),
        },
      ],
    });

    let content = completion?.choices?.[0]?.message?.content || "";

    // If empty / invalid JSON, retry ONCE with SIGNED URL
    const needRetry =
      !content ||
      typeof content !== "string" ||
      (() => {
        try {
          JSON.parse(content);
          return false;
        } catch {
          return true;
        }
      })();

    if (needRetry) {
      completion = await groq.chat.completions.create({
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
            content: buildUserContent(schemaText, "signed-url", signedUrl),
          },
        ],
      });
      content = completion?.choices?.[0]?.message?.content || "";
    }

    if (!content || typeof content !== "string") {
      return json(502, { success: false, error: "Empty content from model" });
    }

    let parsed: ModelExtract;
    try {
      parsed = JSON.parse(content) as ModelExtract;
    } catch {
      return json(502, { success: false, error: "Model did not return valid JSON" });
    }

    if (!parsed.isValidReceipt) {
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
      totals,
      notes: parsed.notes?.trim() || null,
      raw: {
        userId: body.userId ?? null,
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        imagePath: body.imagePath,
      },
    };

    return json(200, { success: true, data: payload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json(500, { success: false, error: msg });
  }
});
