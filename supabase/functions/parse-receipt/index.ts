/// <reference path="../_shared/edge-runtime.d.ts" />

import OpenAI from 'npm:openai';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// required env vars for this function
const REQUIRED_ENV = ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = REQUIRED_ENV.filter((k) => !Deno.env.get(k));
if (missing.length) {
  console.error('Missing env vars:', missing.join(', '));
  throw new Error(`parse-receipt missing env vars: ${missing.join(', ')}`);
}

// single bucket
const BUCKET = 'receipts';

// admin supabase client for signing URLs (service role key never leaves server)
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: { persistSession: false },
  }
);

// OpenAI client
const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! });

// types that match client expectations
type ReceiptRequest = {
  imagePath: string; // e.g. "user_123/1730000000000.jpg"
  userId?: string;
};

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

// shape we return to the client
type ParsedReceiptResponse = {
  success: boolean;
  data?: {
    merchantName: string | null;
    merchantAddress: string | null;
    purchaseDate: string | null;
    currency: string;
    items: {
      name: string;
      price: number;
      quantity: number;
    }[];
    totals: {
      subtotal: number;
      tax: number;
      tip: number;
      total: number;
      itemsTotal: number;
    };
    notes: string | null;
    raw: {
      userId: string | null;
      model: string;
      imagePath: string;
    };
  };
  error?: string;
};

Deno.serve(async (req) => {
  try {
    // handle OPTIONS
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return json(405, { success: false, error: 'Method Not Allowed' });
    }

    const body = (await req.json()) as ReceiptRequest;

    // validate request
    if (!body?.imagePath || typeof body.imagePath !== 'string') {
      return json(400, { success: false, error: 'Missing or invalid imagePath' });
    }
    if (body.imagePath.includes('..')) {
      return json(400, { success: false, error: 'Invalid imagePath' });
    }

    // Create a short-lived signed URL (private bucket -> temporary link)
    const signed = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(body.imagePath, 60); // allow OpenAI to fetch for ~60s

    if (signed.error || !signed.data?.signedUrl) {
      return json(400, { success: false, error: 'Unable to sign image URL' });
    }

    const signedUrl = signed.data.signedUrl;

    // JSON schema we want the model to fill
    const schema = {
      type: 'object',
      properties: {
        isValidReceipt: { type: 'boolean' },
        merchantName: { type: 'string', nullable: true },
        merchantAddress: { type: 'string', nullable: true },
        purchaseDate: { type: 'string', nullable: true },
        currency: { type: 'string', nullable: true },
        subtotal: { type: 'number', nullable: true },
        tax: { type: 'number', nullable: true },
        tip: { type: 'number', nullable: true },
        total: { type: 'number', nullable: true },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              price: { type: 'number' },
              quantity: { type: 'number' },
            },
            required: ['name', 'price', 'quantity'],
            additionalProperties: false,
          },
          nullable: true,
        },
        notes: { type: 'string', nullable: true },
      },
      required: [
        'isValidReceipt',
        'merchantName',
        'merchantAddress',
        'purchaseDate',
        'currency',
        'subtotal',
        'tax',
        'tip',
        'total',
        'items',
        'notes',
      ],
      additionalProperties: false,
    } as const;

    const prompt = `You are a receipt parsing assistant. Review the supplied image of a receipt.
- If it's NOT a purchase receipt (random photo, unreadable, no totals/items), set isValidReceipt=false, items=[], and explain in notes.
- If it IS a receipt: isValidReceipt=true and extract fields.
- All numeric prices should be numbers only (no $).
- If subtotal / tax / tip / total are missing, you may leave them null.
- items[] should list each purchased line item with name, unit price, and quantity (default quantity 1 if unclear).
- purchaseDate should be an ISO-8601-like string if visible, else null.
- currency should be visible currency code if obvious, else "USD" if it's in the US style, else null.
- merchantName/address if visible, else null.
- Use notes for any caveats or uncertainty.`;

    // Call OpenAI responses with vision
    const response = await openai.responses.create({
      model: 'gpt-5-nano',
      instructions: prompt,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Parse this receipt image into the structured schema.' },
            { type: 'input_image', image_url: signedUrl },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'receipt_parser_response',
          schema,
          strict: true,
        },
      },
    });

    // response.output_text should be strict-valid JSON
    const parsed = JSON.parse(response.output_text) as ModelExtract;

    // If model says it's not a receipt, soft-fail
    if (!parsed.isValidReceipt) {
      return json(200, {
        success: false,
        error: parsed.notes || 'Image did not contain a valid receipt.',
      });
    }

    // normalize
    const normalizedSubtotal = coerceAmount(parsed.subtotal);
    const normalizedTax = coerceAmount(parsed.tax);
    const normalizedTip = coerceAmount(parsed.tip);
    const normalizedTotal = coerceAmount(parsed.total);

    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter((item) => item && item.name)
          .map((item) => ({
            name: item.name.trim(),
            price: coerceAmount(item.price),
            quantity:
              item.quantity && item.quantity > 0
                ? Math.round(item.quantity)
                : 1,
          }))
      : [];

    const totals = reconcileTotals({
      subtotal: normalizedSubtotal,
      tax: normalizedTax,
      tip: normalizedTip,
      total: normalizedTotal,
      items,
    });

    const payload = {
      merchantName: parsed.merchantName?.trim() || null,
      merchantAddress: parsed.merchantAddress?.trim() || null,
      purchaseDate: parsed.purchaseDate ? safeDate(parsed.purchaseDate) : null,
      currency: (parsed.currency?.trim() || 'USD') as string,
      items,
      totals,
      notes: parsed.notes?.trim() || null,
      raw: {
        userId: body.userId ?? null,
        model: 'gpt-5-nano',
        imagePath: body.imagePath,
      },
    };

    return json(200, { success: true, data: payload });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json(500, { success: false, error: message });
  }
});

// small helpers

function json(status: number, obj: ParsedReceiptResponse) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type ReconcileInput = {
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  items: ModelExtractItem[];
};

function coerceAmount(value: unknown): number {
  if (typeof value === 'number' && isFinite(value)) {
    return Number(value.toFixed(2));
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ''));
    if (!Number.isNaN(parsed)) {
      return Number(parsed.toFixed(2));
    }
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
  const itemsSum = items.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );

  let nextSubtotal = subtotal || itemsSum;
  const inferredTax = tax || 0;
  const inferredTip = tip || 0;
  let nextTotal = total || nextSubtotal + inferredTax + inferredTip;

  // infer subtotal from items if missing
  if (nextSubtotal === 0 && itemsSum > 0) {
    nextSubtotal = itemsSum;
  }

  // rebuild total if it's clearly off
  const sumWithExtras = nextSubtotal + inferredTax + inferredTip;
  if (nextTotal === 0 || Math.abs(nextTotal - sumWithExtras) > 0.05) {
    nextTotal = Number(sumWithExtras.toFixed(2));
  }

  return {
    subtotal: Number(nextSubtotal.toFixed(2)),
    tax: Number(inferredTax.toFixed(2)),
    tip: Number(inferredTip.toFixed(2)),
    total: Number(nextTotal.toFixed(2)),
    itemsTotal: Number(itemsSum.toFixed(2)),
  };
}
