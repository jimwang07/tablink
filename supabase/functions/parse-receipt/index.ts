/// <reference path="../_shared/edge-runtime.d.ts" />

import OpenAI from 'npm:openai';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const REQUIRED_ENV = ['OPENAI_API_KEY'];
const missing = REQUIRED_ENV.filter((key) => !Deno.env.get(key));
if (missing.length) {
  console.error('Missing environment variables:', missing.join(', '));
  throw new Error(`parse-receipt function missing env vars: ${missing.join(', ')}`);
}

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! });

const ALLOWED_IMAGE_HOSTS = [
  'https://febsqzejbanainfjbbef.supabase.co/storage/v1/object/public/receipts',
];

type ReceiptRequest = {
  imageUrl: string;
  userId?: string;
};

type ParsedReceiptItem = {
  name: string;
  price: number;
  quantity: number;
};

type ParsedReceipt = {
  merchantName?: string;
  merchantAddress?: string;
  purchaseDate?: string;
  subtotal?: number;
  tax?: number;
  tip?: number;
  total?: number;
  currency?: string;
  items?: ParsedReceiptItem[];
  notes?: string;
};

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    const body = (await req.json()) as ReceiptRequest;
    if (!body?.imageUrl) {
      return new Response(JSON.stringify({ error: 'Missing imageUrl' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { imageUrl } = body;
    if (!ALLOWED_IMAGE_HOSTS.some((prefix) => imageUrl.startsWith(prefix))) {
      return new Response(JSON.stringify({ error: 'Invalid image host' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const schemaName = 'receipt_parser_response';
    const schema = {
      type: 'object',
      properties: {
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
          },
          nullable: true,
        },
        notes: { type: 'string', nullable: true },
      },
      required: ['items', 'subtotal', 'total'],
      additionalProperties: false,
    } as const;

    const prompt = `You are a receipt parsing assistant. Review the supplied receipt photo and extract structured data.
- Return all prices as numeric values (no currency symbols) in the detected currency.
- If subtotal, tax, tip, or total are missing, return 0.0 and note the absence.
- List each purchasable item with a descriptive name, unit price, and quantity.
- Include merchant name/address if visible. If not, leave those fields null.
- Provide purchaseDate as an ISO 8601 string when clearly stated; otherwise leave null.
- Use notes for any caveats, manual adjustments, or ambiguities.`;

    const response = await openai.responses.create({
      model: 'gpt-5-mini',
      input: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Parse this receipt image into the structured schema.',
            },
            {
              type: 'input_image',
              image_url: imageUrl,
            },
          ],
        },
      ],
      text: {
        format: {
          name: schemaName,
          type: 'json_schema',
          json_schema: schema,
        },
      },
    });

    const jsonOutput = response.output_text;
    if (!jsonOutput) {
      throw new Error('Model returned empty response');
    }

    let parsed: ParsedReceipt;
    try {
      parsed = JSON.parse(jsonOutput) as ParsedReceipt;
    } catch (error) {
      throw new Error('Failed to parse model JSON output');
    }

    const normalizedTotal = coerceAmount(parsed.total);
    const normalizedSubtotal = coerceAmount(parsed.subtotal);
    const normalizedTax = coerceAmount(parsed.tax);
    const normalizedTip = coerceAmount(parsed.tip);

    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter((item) => item?.name)
          .map((item) => ({
            name: item.name.trim(),
            price: coerceAmount(item.price),
            quantity: item.quantity && item.quantity > 0 ? Math.round(item.quantity) : 1,
          }))
      : [];

    const totals = reconcileTotals({
      subtotal: normalizedSubtotal,
      tax: normalizedTax,
      tip: normalizedTip,
      total: normalizedTotal,
      items,
    });

    const hasMeaningfulData = items.length > 0 && totals.total > 0.01;
    if (!hasMeaningfulData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No receipt detected in the image. Please retake or import a clearer photo.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const payload = {
      merchantName: parsed.merchantName?.trim() || null,
      merchantAddress: parsed.merchantAddress?.trim() || null,
      purchaseDate: parsed.purchaseDate ? safeDate(parsed.purchaseDate) : null,
      currency: parsed.currency?.trim() || 'USD',
      items,
      totals,
      notes: parsed.notes?.trim() || null,
      raw: {
        userId: body.userId ?? null,
        model: 'gpt-5-mini',
        imageUrl,
      },
    };

    return new Response(JSON.stringify({ success: true, data: payload }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('parse-receipt error', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

type ReconcileInput = {
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  items: ParsedReceiptItem[];
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

function safeDate(value: string): string | null {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString();
}

function reconcileTotals({ subtotal, tax, tip, total, items }: ReconcileInput) {
  const sumItems = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  let nextSubtotal = subtotal || sumItems;
  const inferredTax = tax || 0;
  const inferredTip = tip || 0;
  let nextTotal = total || nextSubtotal + inferredTax + inferredTip;

  if (nextSubtotal === 0 && sumItems > 0) {
    nextSubtotal = sumItems;
  }

  const sumWithExtras = nextSubtotal + inferredTax + inferredTip;
  if (nextTotal === 0 || Math.abs(nextTotal - sumWithExtras) > 0.05) {
    nextTotal = Number(sumWithExtras.toFixed(2));
  }

  return {
    subtotal: Number(nextSubtotal.toFixed(2)),
    tax: Number(inferredTax.toFixed(2)),
    tip: Number(inferredTip.toFixed(2)),
    total: Number(nextTotal.toFixed(2)),
    itemsTotal: Number(sumItems.toFixed(2)),
  };
}
