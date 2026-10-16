import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function getNamedKey(envName: string): string {
  const raw = Deno.env.get(envName);
  if (!raw) throw new Error(`${envName} is not configured`);
  const parsed = JSON.parse(raw);
  const key = parsed.default;
  if (!key) throw new Error(`Default key missing from ${envName}`);
  return key;
}

async function adminRpc(name: string, body: Record<string, unknown> = {}) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const secretKey = getNamedKey("SUPABASE_SECRET_KEYS");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      "Accept-Profile": "public",
      "Content-Profile": "public",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text || `RPC ${name} failed`;
    try { message = JSON.parse(text)?.message || message; } catch {}
    throw new Error(message);
  }
  return text ? JSON.parse(text) : null;
}

function ebayBase(mode: string) {
  return mode === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}

async function mintAccessToken(credentials: any) {
  const clientId = String(credentials?.client_id || "");
  const clientSecret = String(credentials?.client_secret || "");
  const refreshToken = String(credentials?.refresh_token || "");
  const mode = credentials?.mode === "sandbox" ? "sandbox" : "live";
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Save the eBay Client ID, Client Secret, and seller Refresh Token first.");

  const tokenUrl = `${ebayBase(mode)}/identity/v1/oauth2/token`;
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || "eBay rejected the OAuth credentials or refresh token.");
  }
  return { token: String(data.access_token), mode };
}

async function ebayJson(url: string, token: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Content-Language": "en-US" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.errors?.[0]?.longMessage || data?.errors?.[0]?.message || data?.message || `eBay request failed (${response.status})`;
    throw new Error(detail);
  }
  return data;
}

async function testAndDiscover() {
  const credentials = await adminRpc("server_get_ebay_credentials");
  const { token, mode } = await mintAccessToken(credentials);
  const base = ebayBase(mode);
  const marketplace = String(credentials?.marketplace_id || "EBAY_US");
  const [inventory, locations, fulfillment, payment, returns] = await Promise.all([
    ebayJson(`${base}/sell/inventory/v1/inventory_item?limit=1`, token),
    ebayJson(`${base}/sell/inventory/v1/location?limit=100`, token),
    ebayJson(`${base}/sell/account/v1/fulfillment_policy?marketplace_id=${encodeURIComponent(marketplace)}`, token),
    ebayJson(`${base}/sell/account/v1/payment_policy?marketplace_id=${encodeURIComponent(marketplace)}`, token),
    ebayJson(`${base}/sell/account/v1/return_policy?marketplace_id=${encodeURIComponent(marketplace)}`, token),
  ]);
  const summarize = (arr: any[], idKey: string) => (arr || []).map((x: any) => ({ id: x?.[idKey] || null, name: x?.name || null }));
  return {
    connected: true,
    mode,
    marketplace_id: marketplace,
    inventory_access: true,
    locations: (locations?.locations || []).map((x: any) => ({ key: x?.merchantLocationKey || null, name: x?.name || null, status: x?.merchantLocationStatus || null })),
    fulfillment_policies: summarize(fulfillment?.fulfillmentPolicies, "fulfillmentPolicyId"),
    payment_policies: summarize(payment?.paymentPolicies, "paymentPolicyId"),
    return_policies: summarize(returns?.returnPolicies, "returnPolicyId"),
    inventory_total: inventory?.total ?? null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Sign in required." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const publishableKey = getNamedKey("SUPABASE_PUBLISHABLE_KEYS");
    const userClient = createClient(url, publishableKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const token = authHeader.slice(7);
    const { data: { user }, error } = await userClient.auth.getUser(token);
    if (error || !user) return json({ error: "Invalid session." }, 401);
    if (user.app_metadata?.olive_role !== "admin") return json({ error: "Owner access required." }, 403);

    if (req.method === "GET") {
      const status = await adminRpc("admin_get_ebay_status");
      return json(status);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.action === "test" || body?.action === "discover") return json(await testAndDiscover());

      const current = await adminRpc("admin_get_ebay_status");
      const clientId = String(body?.client_id || "").trim();
      const clientSecret = String(body?.client_secret || "").trim();
      const refreshToken = String(body?.refresh_token || "").trim();
      if (!current?.client_id_hint && !clientId) return json({ error: "eBay Client ID is required for the first connection." }, 400);
      if (!current?.refresh_token_configured && !refreshToken) return json({ error: "eBay seller Refresh Token is required for the first connection." }, 400);

      const saved = await adminRpc("admin_set_ebay_settings", {
        p_client_id: clientId,
        p_client_secret: clientSecret,
        p_refresh_token: refreshToken,
        p_mode: String(body?.mode || "live"),
        p_marketplace_id: String(body?.marketplace_id || "EBAY_US"),
        p_category_id: body?.category_id ? String(body.category_id) : null,
        p_merchant_location_key: body?.merchant_location_key ? String(body.merchant_location_key) : null,
        p_payment_policy_id: body?.payment_policy_id ? String(body.payment_policy_id) : null,
        p_fulfillment_policy_id: body?.fulfillment_policy_id ? String(body.fulfillment_policy_id) : null,
        p_return_policy_id: body?.return_policy_id ? String(body.return_policy_id) : null,
        p_condition: String(body?.condition || "USED_EXCELLENT"),
        p_enabled: body?.enabled !== false,
      });
      return json(saved);
    }

    if (req.method === "DELETE") return json(await adminRpc("admin_clear_ebay_settings"));
    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("marketplace-settings request failed", error instanceof Error ? error.message : error);
    return json({ error: error instanceof Error ? error.message : "Unable to update marketplace settings." }, 400);
  }
});
