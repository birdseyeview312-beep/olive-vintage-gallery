import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { XMLParser } from "npm:fast-xml-parser@5.2.5";

function getNamedKey(envName: string): string {
  const raw = Deno.env.get(envName);
  if (!raw) throw new Error(`${envName} is not configured`);
  const parsed = JSON.parse(raw);
  const key = parsed.default;
  if (!key) throw new Error(`Default key missing from ${envName}`);
  return key;
}
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-olive-worker-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function ebayApiBase(mode: string) { return mode === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com"; }
function ebayTradingBase(mode: string) { return mode === "sandbox" ? "https://api.sandbox.ebay.com/ws/api.dll" : "https://api.ebay.com/ws/api.dll"; }
function ebayItemBase(mode: string) { return mode === "sandbox" ? "https://www.sandbox.ebay.com/itm" : "https://www.ebay.com/itm"; }
async function mintAccessToken(credentials: any) {
  const clientId = String(credentials?.client_id || "");
  const clientSecret = String(credentials?.client_secret || "");
  const refreshToken = String(credentials?.refresh_token || "");
  const mode = credentials?.mode === "sandbox" ? "sandbox" : "live";
  if (!clientId || !clientSecret || !refreshToken) throw new Error("eBay developer credentials and seller refresh token are not connected yet.");
  const response = await fetch(`${ebayApiBase(mode)}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) throw new Error(data?.error_description || data?.error || "Unable to refresh the eBay seller token.");
  return { token: String(data.access_token), mode };
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", parseTagValue: true, trimValues: true, removeNSPrefix: true });
function arr<T = any>(v: T | T[] | undefined | null): T[] { if (v === undefined || v === null) return []; return Array.isArray(v) ? v : [v]; }
function text(v: any): string { if (v === undefined || v === null) return ""; if (typeof v === "object" && "#text" in v) return String(v["#text"] ?? "").trim(); return String(v).trim(); }
function amount(v: any): number | null { const n = Number(text(v)); return Number.isFinite(n) ? n : null; }
function decodeEntities(v: string) { return v.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">"); }
function plainText(v: any) {
  return decodeEntities(text(v).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/p\s*>/gi, "\n\n").replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function specific(item: any, names: RegExp): string {
  for (const row of arr(item?.ItemSpecifics?.NameValueList)) {
    const name = text(row?.Name);
    if (!names.test(name)) continue;
    const v = arr(row?.Value).map(text).filter(Boolean).join(", ");
    if (v) return v;
  }
  return "";
}
function unit(v: any) { return String(v?.["@_unit"] || "").trim().toLowerCase(); }
function oneDecimal(n: number) { return Math.round(n * 10) / 10; }
function toInches(v: any): number | null {
  const n = amount(v); if (n === null || n <= 0) return null;
  const u = unit(v);
  if (u.includes("cm")) return oneDecimal(n / 2.54);
  if (u.includes("mm")) return oneDecimal(n / 25.4);
  if (u.includes("m") && !u.includes("mm") && !u.includes("cm")) return oneDecimal(n * 39.3701);
  return oneDecimal(n);
}
function shippingPackage(item: any) {
  const d = item?.ShippingPackageDetails;
  if (!d) return {} as Record<string, unknown>;
  const major = amount(d?.WeightMajor) ?? 0;
  const minor = amount(d?.WeightMinor) ?? 0;
  const majorUnit = unit(d?.WeightMajor);
  const minorUnit = unit(d?.WeightMinor);
  const measurement = text(d?.MeasurementUnit).toLowerCase();
  let weightOz: number | null = null;
  if (major > 0 || minor > 0) {
    const metric = majorUnit.includes("kg") || minorUnit.includes("gr") || minorUnit === "g" || measurement === "metric";
    weightOz = metric ? major * 35.27396195 + minor * 0.03527396195 : major * 16 + minor;
    if (!Number.isFinite(weightOz) || weightOz <= 0) weightOz = null;
  }
  const length = toInches(d?.PackageLength);
  const width = toInches(d?.PackageWidth);
  const height = toInches(d?.PackageDepth);
  const out: Record<string, unknown> = {};
  if (weightOz) out.shipping_weight_oz = oneDecimal(weightOz);
  if (length) out.shipping_length_in = length;
  if (width) out.shipping_width_in = width;
  if (height) out.shipping_height_in = height;
  if (Object.keys(out).length) out.shipping_package_source = "ebay";
  return out;
}
function hasCompleteShipping(p: any) {
  return [p?.shipping_weight_oz, p?.shipping_length_in, p?.shipping_width_in, p?.shipping_height_in].every(v => Number(v) > 0);
}
const GLASS_TERMS = /\b(glass|crystal|art glass|pressed glass|blown glass|cut glass|milk glass|stained glass|pyrex|murano|steuben|latticino|sommerso|paperweight)\b/i;
const NON_GLASS_TERMS = /\b(ceramic|pottery|porcelain|earthenware|stoneware|acrylic|resin|wood|wooden|metal|bronze|brass|silver|gold|jewelry|brooch|pendant|painting|print|textile|fabric)\b/i;
function isGlassListing(input: { title: string; category: string; medium: string | null; description: string }) {
  const explicitMaterial = [input.medium, input.category].filter(Boolean).join(" ");
  if (NON_GLASS_TERMS.test(explicitMaterial) && !GLASS_TERMS.test(explicitMaterial)) return false;
  return GLASS_TERMS.test([input.title, input.category, input.medium, input.description].filter(Boolean).join(" "));
}

function curatedCategory(input: { title: string; sourceCategory: string; maker: string | null; origin: string | null; medium: string | null; datePeriod: string | null; description: string }) {
  const value = [input.title, input.sourceCategory, input.maker, input.origin, input.medium, input.datePeriod, input.description].filter(Boolean).join(" ");
  if (/\b(paper\s*weight|paperweight|marble|millefiori orb|lampwork orb)\b/i.test(value)) return "Marbles & Paperweights";
  if (/\b(vintage|antique|art nouveau|mid[- ]century|early 19\d\ds|circa 19\d\ds|c\.?\s*19\d\d)\b/i.test(value)) return "Vintage & Antique Glass";
  if (/\b(murano|italy|italian|venice|venetian|france|french|sweden|swedish|scandinavia|scandinavian|denmark|danish|finland|finnish|norway|norwegian|czech|czechoslovak|bohemia|bohemian|poland|polish|romania|romanian|germany|german|austria|austrian|belgium|belgian|netherlands|dutch|united kingdom|england|english|scotland|scottish|wales|welsh|ireland|irish|kosta boda|holmegaard|daum|loetz|lalique|saint louis|fratelli toso|cenedese|carlo moretti|ioan nemtoi|caithness|paul ysart|pallme|k[oö]nig)\b/i.test(value)) return "European & Italian Glass";
  if (/\b(united states|u\.?s\.?a\.?|american|california|steuben|fenton|durand|eickholt|rollin karg|karg glass|neptune hot glass|annieglass|correia|tiffany|st\.? clair|cohn[- ]stone)\b/i.test(value)) return "American Art Glass";
  return "Contemporary Studio Glass";
}

async function tradingCall(callName: string, token: string, mode: string, requestXml: string) {
  const response = await fetch(ebayTradingBase(mode), {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", "X-EBAY-API-CALL-NAME": callName, "X-EBAY-API-SITEID": "0", "X-EBAY-API-COMPATIBILITY-LEVEL": "1475", "X-EBAY-API-IAF-TOKEN": token },
    body: requestXml,
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`eBay ${callName} HTTP ${response.status}`);
  const parsed = parser.parse(body);
  const root = parsed?.[`${callName}Response`] || parsed?.[callName + "Response"] || parsed;
  const ack = text(root?.Ack);
  if (ack && !["Success", "Warning"].includes(ack)) {
    const errs = arr(root?.Errors).map((e: any) => text(e?.LongMessage) || text(e?.ShortMessage)).filter(Boolean);
    throw new Error(errs.join(" | ") || `eBay ${callName} failed with ${ack}`);
  }
  return root;
}
function listingPageXml(page: number) { return `<?xml version="1.0" encoding="utf-8"?>\n<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents"><DetailLevel>ReturnAll</DetailLevel><ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList></GetMyeBaySellingRequest>`; }
function getItemXml(itemId: string) { return `<?xml version="1.0" encoding="utf-8"?>\n<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents"><DetailLevel>ReturnAll</DetailLevel><ItemID>${itemId.replace(/[^0-9]/g, "")}</ItemID><IncludeItemSpecifics>true</IncludeItemSpecifics></GetItemRequest>`; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const secretKey = getNamedKey("SUPABASE_SECRET_KEYS");
  const service = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString();
  try {
    const workerKey = req.headers.get("x-olive-worker-key") || "";
    const { data: cfg, error: cfgErr } = await service.from("marketplace_config").select("*").eq("id", true).single();
    if (cfgErr) throw cfgErr;
    const workerAuthorized = Boolean(workerKey && cfg?.worker_key_hash && await sha256Hex(workerKey) === cfg.worker_key_hash);
    let adminAuthorized = false;
    if (!workerAuthorized) {
      const authHeader = req.headers.get("Authorization") || "";
      if (authHeader.startsWith("Bearer ")) {
        const publishableKey = getNamedKey("SUPABASE_PUBLISHABLE_KEYS");
        const userClient = createClient(supabaseUrl, publishableKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        const { data: { user } } = await userClient.auth.getUser(authHeader.slice(7));
        adminAuthorized = user?.app_metadata?.olive_role === "admin";
      }
    }
    if (!workerAuthorized && !adminAuthorized) return json({ error: "Owner or scheduled-worker authorization required." }, 401);

    await service.from("marketplace_config").update({ ebay_import_last_run: now, ebay_import_last_error: null, updated_at: now }).eq("id", true);
    if (cfg?.ebay_import_enabled === false) return json({ status: "disabled", imported: 0 });

    const { data: credentials, error: credErr } = await service.rpc("server_get_ebay_credentials");
    if (credErr) throw credErr;
    if (!credentials?.client_id || !credentials?.client_secret || !credentials?.refresh_token) {
      const message = "Waiting for eBay developer approval and seller OAuth credentials.";
      await service.from("marketplace_config").update({ ebay_import_last_error: message, ebay_import_last_count: 0, updated_at: now }).eq("id", true);
      return json({ status: "waiting_for_ebay_credentials", imported: 0, message });
    }

    const { token, mode } = await mintAccessToken(credentials);
    const activeItems: any[] = [];
    let totalPages = 1;
    for (let page = 1; page <= totalPages && page <= 25; page++) {
      const selling = await tradingCall("GetMyeBaySelling", token, mode, listingPageXml(page));
      activeItems.push(...arr(selling?.ActiveList?.ItemArray?.Item));
      const parsedPages = Number(text(selling?.ActiveList?.PaginationResult?.TotalNumberOfPages) || "1");
      totalPages = Number.isFinite(parsedPages) && parsedPages > 0 ? parsedPages : 1;
    }

    const activeIds = activeItems.map(x => text(x?.ItemID)).filter(Boolean);
    const activeSet = new Set(activeIds);
    const { data: knownRows, error: knownErr } = await service.from("platform_listings").select("id,product_id,external_listing_id,listing_status").eq("platform", "ebay").not("external_listing_id", "is", null);
    if (knownErr) throw knownErr;
    const knownById = new Map((knownRows || []).map((x: any) => [String(x.external_listing_id), x]));

    const imported: any[] = [];
    const errors: any[] = [];
    const newItems = activeItems.filter(x => { const id = text(x?.ItemID); return id && !knownById.has(id); }).slice(0, 12);

    for (const summary of newItems) {
      const itemId = text(summary?.ItemID);
      try {
        const detailResp = await tradingCall("GetItem", token, mode, getItemXml(itemId));
        const item = detailResp?.Item || {};
        const title = text(item?.Title) || text(summary?.Title) || `eBay Item ${itemId}`;
        const sku = text(item?.SKU) || text(summary?.SKU);
        const inventoryNumber = sku || `EBAY-${itemId}`;
        const images = Array.from(new Set([...arr(item?.PictureDetails?.PictureURL).map(text), text(item?.PictureDetails?.GalleryURL), text(summary?.PictureDetails?.GalleryURL)].filter(x => /^https:\/\//i.test(x)))).slice(0, 12);
        const price = amount(item?.SellingStatus?.CurrentPrice) ?? amount(item?.StartPrice) ?? amount(summary?.SellingStatus?.CurrentPrice) ?? amount(summary?.StartPrice);
        const sourceCategory = text(item?.PrimaryCategory?.CategoryName) || "Uncategorized";
        const maker = specific(item, /^(brand|maker|artist|designer|studio)$/i) || null;
        const origin = specific(item, /country.*manufacture|origin/i) || null;
        const medium = specific(item, /^(material|production technique)$/i) || null;
        const datePeriod = specific(item, /time period|era|year manufactured|production year/i) || null;
        const conditionParts = [text(item?.ConditionDisplayName), plainText(item?.ConditionDescription)].filter(Boolean);
        const condition = conditionParts.join(" — ") || null;
        const description = plainText(item?.Description) || title;
        const glassEligible = isGlassListing({ title, category: sourceCategory, medium, description });
        const category = curatedCategory({ title, sourceCategory, maker, origin, medium, datePeriod, description });
        const status = glassEligible && images.length > 0 && Number(price) > 0 ? "available" : "draft";
        const packageData = shippingPackage(item);

        let productId: string | null = null;
        const { data: existingProduct } = await service.from("products").select("id,shipping_package_source").eq("inventory_number", inventoryNumber).maybeSingle();
        if (existingProduct?.id) {
          productId = existingProduct.id;
          const shippingUpdate = existingProduct.shipping_package_source === "manual" ? {} : packageData;
          await service.from("products").update({ title, maker, category, category_manual: false, price, status, date_period: datePeriod, origin, medium, description, condition, images, gallery_cover_image: images[0] || null, gallery_cover_source_image: images[0] || null, new_arrival: true, updated_at: now, ...shippingUpdate }).eq("id", productId);
        } else {
          const { data: created, error: createErr } = await service.from("products").insert({ inventory_number: inventoryNumber, title, maker, category, category_manual: false, price, status, date_period: datePeriod, origin, medium, description, condition, images, gallery_cover_image: images[0] || null, gallery_cover_source_image: images[0] || null, new_arrival: true, featured: false, inquire_only: false, ...packageData }).select("id").single();
          if (createErr) throw createErr;
          productId = created.id;
        }
        if (!productId) throw new Error("Unable to resolve Olive product ID.");

        if (images.length) {
          const imageRows = images.map((url, i) => ({ product_id: productId, image_url: url, alt_text: `${title} — image ${i + 1}`, sort_order: i, is_primary: i === 0, source_platform: "ebay" }));
          await service.from("product_images").delete().eq("product_id", productId).eq("source_platform", "ebay");
          const { error: imageErr } = await service.from("product_images").insert(imageRows);
          if (imageErr) throw imageErr;
        }
        const { error: listingErr } = await service.from("platform_listings").insert({ product_id: productId, platform: "ebay", external_listing_id: itemId, listing_url: `${ebayItemBase(mode)}/${encodeURIComponent(itemId)}`, listing_status: "active", sync_managed: false, last_synced_at: now, updated_at: now });
        if (listingErr) throw listingErr;
        imported.push({ item_id: itemId, product_id: productId, title, status, glass_eligible: glassEligible, shipping_ready: Object.keys(packageData).length >= 5 });
      } catch (e) {
        errors.push({ item_id: itemId, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Backfill packed shipping details for existing eBay-linked Olive products that are still missing them.
    const productIds = Array.from(new Set((knownRows || []).map((r: any) => String(r.product_id || "")).filter(Boolean)));
    let shippingBackfilled = 0;
    if (productIds.length) {
      const { data: existingProducts } = await service.from("products").select("id,shipping_weight_oz,shipping_length_in,shipping_width_in,shipping_height_in,shipping_package_source").in("id", productIds);
      const missingIds = new Set((existingProducts || []).filter((p: any) => p.shipping_package_source !== "manual" && !hasCompleteShipping(p)).map((p: any) => String(p.id)));
      const candidates = (knownRows || []).filter((r: any) => r.listing_status === "active" && activeSet.has(String(r.external_listing_id || "")) && missingIds.has(String(r.product_id))).slice(0, 12);
      for (const row of candidates) {
        const itemId = String(row.external_listing_id || "");
        try {
          const detailResp = await tradingCall("GetItem", token, mode, getItemXml(itemId));
          const packageData = shippingPackage(detailResp?.Item || {});
          if (!Object.keys(packageData).length) continue;
          const current = (existingProducts || []).find((p: any) => String(p.id) === String(row.product_id));
          const patch: Record<string, unknown> = { updated_at: now };
          for (const key of ["shipping_weight_oz","shipping_length_in","shipping_width_in","shipping_height_in"]) {
            if (!(Number(current?.[key]) > 0) && packageData[key] !== undefined) patch[key] = packageData[key];
          }
          if (Object.keys(patch).length > 1) {
            patch.shipping_package_source = "ebay";
            await service.from("products").update(patch).eq("id", row.product_id);
            shippingBackfilled++;
          }
        } catch (e) {
          errors.push({ item_id: itemId, error: `Shipping backfill: ${e instanceof Error ? e.message : String(e)}` });
        }
      }
    }

    for (const row of knownRows || []) {
      const id = String(row.external_listing_id || "");
      if (!id || activeSet.has(id) || row.listing_status !== "active") continue;
      await service.from("platform_listings").update({ listing_status: "ended", last_synced_at: now, updated_at: now }).eq("id", row.id);
      await service.from("products").update({ status: "draft", updated_at: now }).eq("id", row.product_id).eq("status", "available");
    }

    const finalError = errors.length ? `${errors.length} eBay operation(s) had an issue. First error: ${errors[0].error}` : null;
    await service.from("marketplace_config").update({ ebay_import_last_success: now, ebay_import_last_error: finalError, ebay_import_last_count: imported.length, updated_at: now }).eq("id", true);
    return json({ status: "ok", active_ebay_items: activeIds.length, new_items_found: newItems.length, imported: imported.length, shipping_backfilled: shippingBackfilled, imported_items: imported, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("marketplace-import-worker failed", message);
    await service.from("marketplace_config").update({ ebay_import_last_error: message, ebay_import_last_count: 0, updated_at: now }).eq("id", true).catch(() => {});
    return json({ error: message }, 500);
  }
});
