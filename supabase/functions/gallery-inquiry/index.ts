import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const ALLOWED_ORIGINS = new Set(["https://www.olivevintage.store", "https://olivevintage.store"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 5;

function getNamedKey(envName: string): string {
  const raw = Deno.env.get(envName);
  if (!raw) throw new Error(`${envName} is not configured`);
  const key = JSON.parse(raw)?.default;
  if (!key) throw new Error(`Default key missing from ${envName}`);
  return key;
}

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://www.olivevintage.store",
    "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function field(data: FormData, name: string, max: number) {
  const value = String(data.get(name) || "").trim();
  if (value.length > max) throw new Error(`${name.replace("_", " ")} is too long.`);
  return value;
}

function extension(type: string) {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json(origin, { error: "Method not allowed." }, 405);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json(origin, { error: "This form can only be submitted from Olive Vintage Gallery." }, 403);

  const uploaded: string[] = [];
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) return json(origin, { error: "Invalid form submission." }, 415);
    const data = await req.formData();
    if (field(data, "website", 200)) return json(origin, { ok: true });

    const openedAt = Number(field(data, "opened_at", 30));
    const elapsed = Date.now() - openedAt;
    if (!Number.isFinite(openedAt) || elapsed < 1200 || elapsed > 86_400_000) return json(origin, { error: "Please reopen the form and try again." }, 400);

    const inquiryType = field(data, "inquiry_type", 20);
    const productId = field(data, "product_id", 60);
    const productTitle = field(data, "product_title", 300);
    const name = field(data, "name", 160);
    const email = field(data, "email", 320).toLowerCase();
    const phone = field(data, "phone", 60);
    const location = field(data, "location", 200);
    const message = field(data, "message", 5000);
    if (!["buyer", "seller", "general"].includes(inquiryType)) return json(origin, { error: "Please choose a valid inquiry type." }, 400);
    if (!name || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(origin, { error: "Please provide your name, a valid email, and a message." }, 400);
    if (productId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) return json(origin, { error: "Invalid listing reference." }, 400);

    const photos = data.getAll("photos").filter((item): item is File => item instanceof File && item.size > 0);
    if (photos.length > MAX_IMAGES) return json(origin, { error: "Please choose no more than five photos." }, 400);
    for (const photo of photos) {
      if (!IMAGE_TYPES.has(photo.type)) return json(origin, { error: "Photos must be JPEG, PNG, or WebP images." }, 400);
      if (photo.size > MAX_IMAGE_BYTES) return json(origin, { error: `${photo.name || "A photo"} is larger than 5 MB.` }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const secretKey = getNamedKey("SUPABASE_SECRET_KEYS");
    const service = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
    const ipHash = await sha256Hex(`${forwarded}:${secretKey}`);
    const now = Date.now();
    await service.from("inquiry_rate_limits").delete().lt("submitted_at", new Date(now - 172_800_000).toISOString());
    const { data: marker, error: markerError } = await service.from("inquiry_rate_limits").insert({ ip_hash: ipHash }).select("id").single();
    if (markerError) throw markerError;
    const [{ count: hourly }, { count: daily }] = await Promise.all([
      service.from("inquiry_rate_limits").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("submitted_at", new Date(now - 3_600_000).toISOString()),
      service.from("inquiry_rate_limits").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("submitted_at", new Date(now - 86_400_000).toISOString()),
    ]);
    if ((hourly || 0) > 5 || (daily || 0) > 15) {
      await service.from("inquiry_rate_limits").delete().eq("id", marker.id);
      return json(origin, { error: "Too many inquiries have been sent from this connection. Please try again later or email Olivejewelvintage@gmail.com." }, 429);
    }

    const inquiryId = crypto.randomUUID();
    for (const photo of photos) {
      const path = `${inquiryId}/${crypto.randomUUID()}.${extension(photo.type)}`;
      const bytes = new Uint8Array(await photo.arrayBuffer());
      const { error } = await service.storage.from("inquiry-uploads").upload(path, bytes, { contentType: photo.type, cacheControl: "3600", upsert: false });
      if (error) throw error;
      uploaded.push(path);
    }
    const { error: insertError } = await service.from("gallery_inquiries").insert({
      id: inquiryId, inquiry_type: inquiryType, product_id: productId || null, product_title: productTitle || null,
      name, email, phone: phone || null, location: location || null, message, image_paths: uploaded,
    });
    if (insertError) throw insertError;
    return json(origin, { ok: true, id: inquiryId }, 201);
  } catch (error) {
    if (uploaded.length) {
      try {
        const service = createClient(Deno.env.get("SUPABASE_URL")!, getNamedKey("SUPABASE_SECRET_KEYS"), { auth: { persistSession: false, autoRefreshToken: false } });
        await service.storage.from("inquiry-uploads").remove(uploaded);
      } catch { /* best-effort cleanup */ }
    }
    console.error("gallery-inquiry", error);
    return json(origin, { error: "Unable to send right now. Please email Olivejewelvintage@gmail.com." }, 500);
  }
});
