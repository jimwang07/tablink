/// <reference path="../_shared/edge-runtime.d.ts" />

import OpenAI from "npm:openai";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Config */
const VISION_MODEL = "gpt-4o-mini";

/** CORS */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Env check */
const REQUIRED_ENV = ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = REQUIRED_ENV.filter((k) => !Deno.env.get(k));
if (missing.length) throw new Error(`missing env vars: ${missing.join(", ")}`);

/** Supabase + OpenAI */
const BUCKET = "receipts";
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);
const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

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
    items: ModelExtractItem[];
    totals: { subtotal: number; tax: number; tip: number; total: number; itemsTotal: number };
    notes: string | null;
    raw: { userId: string | null; model: string; imagePath: string };
  };
  error?: string;
};

/** Small helpers */
function json(status: number, obj: ParsedReceiptResponse) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function bytesToBase64(u8: Uint8Array): string {
  let s = "";
  const c = 0x8000;
  for (let i = 0; i < u8.length; i += c) s += String.fromCharCode(...u8.subarray(i, i + c));
  return btoa(s);
}
function coerceAmount(v: unknown): number {
  if (typeof v === "number" && isFinite(v)) return Number(v.toFixed(2));
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.-]/g, ""));
    if (!Number.isNaN(n)) return Number(n.toFixed(2));
  }
  return 0;
}
function safeDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
function reconcileTotals({
  subtotal,
  tax,
  tip,
  total,
  items,
}: {
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  items: ModelExtractItem[];
}) {
  const itemsSum = items.reduce((a, i) => a + i.price * i.quantity, 0);
  let s = subtotal || itemsSum;
  const tx = tax || 0;
  const tp = tip || 0;
  let tot = total || s + tx + tp;
  const exp = s + tx + tp;
  if (tot === 0 || Math.abs(tot - exp) > 0.05) tot = Number(exp.toFixed(2));
  return {
    subtotal: Number(s.toFixed(2)),
    tax: Number(tx.toFixed(2)),
    tip: Number(tp.toFixed(2)),
    total: Number(tot.toFixed(2)),
    itemsTotal: Number(itemsSum.toFixed(2)),
  };
}
/** Extract JSON from Responses payload (covers common shapes) */
function extractJson(resp: any): any | null {
  if (resp?.output_parsed) return resp.output_parsed;
  const parts = resp?.output?.[0]?.content ?? [];
  for (const p of parts) {
    if (p?.json) return p.json;
    if (typeof p?.text === "string") {
      try {
        return JSON.parse(p.text);
      } catch {}
    }
  }
  if (typeof resp?.output_text === "string" && resp.output_text) {
    try {
      return JSON.parse(resp.output_text);
    } catch {}
  }
  return null;
}

/** Handler */
Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { success: false, error: "Method Not Allowed" });

    const body = (await req.json()) as ReceiptRequest;
    if (!body?.imagePath || typeof body.imagePath !== "string" || body.imagePath.includes("..")) {
      return json(400, { success: false, error: "Invalid imagePath" });
    }

    // Signed URL → fetch → base64 → data URL
    const signed = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(body.imagePath, 60);
    if (signed.error || !signed.data?.signedUrl)
      return json(400, { success: false, error: "Unable to sign image URL" });

    const imgRes = await fetch(signed.data.signedUrl, { redirect: "follow" });
    if (!imgRes.ok) return json(400, { success: false, error: `Failed to fetch image (${imgRes.status})` });
    const buf = new Uint8Array(await imgRes.arrayBuffer());
    const dataUrl = `data:image/jpeg;base64,${bytesToBase64(buf)}`;

    // Schema
    const schema = {
      type: "object",
      properties: {
        isValidReceipt: { type: "boolean" },
        merchantName: { type: "string", nullable: true },
        merchantAddress: { type: "string", nullable: true },
        purchaseDate: { type: "string", nullable: true },
        currency: { type: "string", nullable: true },
        subtotal: { type: "number", nullable: true },
        tax: { type: "number", nullable: true },
        tip: { type: "number", nullable: true },
        total: { type: "number", nullable: true },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, price: { type: "number" }, quantity: { type: "number" } },
            required: ["name", "price", "quantity"],
            additionalProperties: false,
          },
          nullable: true,
        },
        notes: { type: "string", nullable: true },
      },
      required: [
        "isValidReceipt",
        "merchantName",
        "merchantAddress",
        "purchaseDate",
        "currency",
        "subtotal",
        "tax",
        "tip",
        "total",
        "items",
        "notes",
      ],
      additionalProperties: false,
    } as const;

    const instructions = `You are a receipt parsing assistant. If not a receipt, set isValidReceipt=false and items=[] with an explanation in notes. Extract fields; numbers must be plain numbers (no $). Default quantity=1 when unclear.`;

    // Responses API (base64 via data URL)
    const resp = await openai.responses.create({
      model: VISION_MODEL,
      instructions,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Parse this receipt image into the structured schema." },
            { type: "input_image", image_url: dataUrl, detail: "low" },
          ],
        },
      ],
      text: {
        format: { type: "json_schema", name: "receipt_parser_response", schema, strict: true },
      },
      max_output_tokens: 600,
      temperature: 0,
    });

    const parsed = extractJson(resp) as ModelExtract | null;
    if (!parsed) return json(502, { success: false, error: "Model did not return valid JSON" });

    if (!parsed.isValidReceipt) {
      return json(200, { success: false, error: parsed.notes || "Image did not contain a valid receipt." });
    }

    // Normalize
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter((i) => i && i.name)
          .map((i) => ({
            name: i.name.trim(),
            price: coerceAmount(i.price),
            quantity: i.quantity && i.quantity > 0 ? Math.round(i.quantity) : 1,
          }))
      : [];
    const totals = reconcileTotals({
      subtotal: coerceAmount(parsed.subtotal),
      tax: coerceAmount(parsed.tax),
      tip: coerceAmount(parsed.tip),
      total: coerceAmount(parsed.total),
      items,
    });

    const payload = {
      merchantName: parsed.merchantName?.trim() || null,
      merchantAddress: parsed.merchantAddress?.trim() || null,
      purchaseDate: parsed.purchaseDate ? safeDate(parsed.purchaseDate) : null,
      currency: (parsed.currency?.trim() || "USD") as string,
      items,
      totals,
      notes: parsed.notes?.trim() || null,
      raw: { userId: body.userId ?? null, model: VISION_MODEL, imagePath: body.imagePath },
    };

    return json(200, { success: true, data: payload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json(500, { success: false, error: msg });
  }
});
