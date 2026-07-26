/// <reference path="../_shared/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = REQUIRED_ENV.filter((key) => !Deno.env.get(key));
if (missing.length) {
  throw new Error(`delete-account missing env vars: ${missing.join(", ")}`);
}

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const [scheme, token] = authHeader.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const token = getBearerToken(req);
  if (!token) {
    return jsonResponse({ success: false, error: "Missing authorization token" }, 401);
  }

  const { data: userResult, error: userError } = await supabaseAdmin.auth.getUser(token);
  const user = userResult?.user;

  if (userError || !user) {
    return jsonResponse({ success: false, error: "Invalid session" }, 401);
  }

  const { data: receipts, error: receiptsError } = await supabaseAdmin
    .from("receipts")
    .select("image_path, thumb_path")
    .eq("owner_id", user.id);

  if (receiptsError) {
    return jsonResponse({ success: false, error: receiptsError.message }, 500);
  }

  const storagePaths = new Set<string>();
  for (const receipt of receipts ?? []) {
    if (receipt.image_path) storagePaths.add(receipt.image_path);
    if (receipt.thumb_path) storagePaths.add(receipt.thumb_path);
  }

  const { data: userFiles, error: listError } = await supabaseAdmin.storage
    .from("receipts")
    .list(user.id, { limit: 1000 });

  if (listError) {
    return jsonResponse({ success: false, error: listError.message }, 500);
  }

  for (const file of userFiles ?? []) {
    if (file.name) storagePaths.add(`${user.id}/${file.name}`);
  }

  if (storagePaths.size > 0) {
    const { error: removeError } = await supabaseAdmin.storage
      .from("receipts")
      .remove([...storagePaths]);

    if (removeError) {
      return jsonResponse({ success: false, error: removeError.message }, 500);
    }
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return jsonResponse({ success: false, error: deleteError.message }, 500);
  }

  return jsonResponse({ success: true });
});
