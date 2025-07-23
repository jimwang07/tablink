import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "https://esm.sh/openai";
const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY")
});
const visionApiKey = Deno.env.get("GOOGLE_CLOUD_API_KEY");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * parseReceipt — Edge Function
 * POST body: { imageUrl: string }
 * Returns: structured JSON with items + totals
 */ Deno.serve(async (req)=>{
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    if (req.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: corsHeaders
      });
    }
    const { imageUrl } = await req.json();
    if (!imageUrl) {
      return new Response("Missing imageUrl", {
        status: 400,
        headers: corsHeaders
      });
    }
    /* 1 ── OCR via Google Vision */ const visionPayload = {
      requests: [
        {
          image: {
            source: {
              imageUri: imageUrl
            }
          },
          features: [
            {
              type: "DOCUMENT_TEXT_DETECTION"
            }
          ]
        }
      ]
    };
    const visionRes = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(visionPayload)
    });
    const visionJson = await visionRes.json();
    const ocrText = visionJson.responses?.[0]?.fullTextAnnotation?.text;
    if (!ocrText) throw new Error("OCR failed or returned no text");
    /* 2 ── Define GPT function‑calling schema */ const functions = [
      {
        name: "parse_receipt",
        description: "Parse receipt into structured data matching the client app format",
        parameters: {
          type: "object",
          properties: {
            merchant_name: {
              type: "string",
              description: "Name of the restaurant/merchant"
            },
            merchant_address: {
              type: "string", 
              description: "Address of the restaurant/merchant"
            },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Item name/description"
                  },
                  price: {
                    type: "number",
                    description: "Item price in dollars (not cents)"
                  },
                  quantity: {
                    type: "integer",
                    description: "Quantity of this item"
                  }
                },
                required: [
                  "name",
                  "price",
                  "quantity"
                ]
              }
            },
            subtotal: {
              type: "number",
              description: "Subtotal in dollars (not cents)"
            },
            tax: {
              type: "number",
              description: "Tax amount in dollars (not cents)"
            },
            tip: {
              type: "number",
              description: "Tip amount in dollars (not cents)"
            },
            total: {
              type: "number",
              description: "Total amount in dollars (not cents)"
            }
          },
          required: [
            "merchant_name",
            "items",
            "subtotal",
            "tax",
            "tip",
            "total"
          ]
        }
      }
    ];
    /* 3 ── Call GPT‑4o to turn OCR text into JSON */ const gptResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: `Extract line items and totals from this OCR text. Return all prices in dollars (not cents). If tip is 0 or not found, set it to 0. Make sure to extract the merchant name and address if available:\n\n${ocrText}`
        }
      ],
      functions,
      function_call: {
        name: "parse_receipt"
      }
    });
    const rawArgs = gptResponse.choices[0].message.function_call?.arguments;
    if (!rawArgs) throw new Error("LLM did not return structured data");
    const parsed = JSON.parse(rawArgs);
    
    /* 4 ── Convert to client app format */ 
    const receiptData = {
      receiptData: {
        id: crypto.randomUUID(),
        created_by: 'system',
        merchant_name: parsed.merchant_name || 'Unknown Restaurant',
        description: parsed.merchant_address || 'Address not found',
        date: new Date().toISOString(),
        subtotal: parsed.subtotal || 0,
        tax: parsed.tax || 0,
        tip: parsed.tip || 0,
        total: parsed.total || 0,
        status: 'active',
        share_link: `receipt-${Date.now()}`
      },
      items: (parsed.items || []).map((item: any) => ({
        id: crypto.randomUUID(),
        receipt_id: '',
        name: item.name || 'Unknown Item',
        price: item.price || 0,
        quantity: item.quantity || 1
      }))
    };
    
    // Update receipt_id for items
    receiptData.items.forEach(item => {
      item.receipt_id = receiptData.receiptData.id;
    });
    
    /* 5 ── Respond with client-formatted JSON */ return new Response(JSON.stringify({
      success: true,
      data: receiptData
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 200
    });
  } catch (err) {
    console.error("parseReceipt error:", err);
    return new Response(JSON.stringify({
      error: err?.message ?? String(err)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
