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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[character] || character));
}

async function sendInquiryNotification(inquiry: {
  id: string; type: string; productTitle: string; name: string; email: string;
  phone: string; location: string; message: string; photoCount: number;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("gallery-inquiry notification skipped: RESEND_API_KEY is not configured");
    return false;
  }

  const recipient = Deno.env.get("INQUIRY_NOTIFICATION_EMAIL") || "Olivejewelvintage@gmail.com";
  const from = Deno.env.get("INQUIRY_FROM_EMAIL") || "Olive Vintage Gallery <onboarding@resend.dev>";
  const kind = inquiry.type === "seller" ? "Seller offer" : inquiry.type === "buyer" ? "Buyer inquiry" : "Gallery inquiry";
  const details = [
    inquiry.productTitle && `<p><strong>Piece:</strong> ${escapeHtml(inquiry.productTitle)}</p>`,
    `<p><strong>From:</strong> ${escapeHtml(inquiry.name)} &lt;${escapeHtml(inquiry.email)}&gt;</p>`,
    inquiry.phone && `<p><strong>Phone:</strong> ${escapeHtml(inquiry.phone)}</p>`,
    inquiry.location && `<p><strong>Location:</strong> ${escapeHtml(inquiry.location)}</p>`,
    `<p><strong>Photos:</strong> ${inquiry.photoCount}</p>`,
  ].filter(Boolean).join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `gallery-inquiry-${inquiry.id}`,
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      reply_to: inquiry.email,
      subject: `${kind}${inquiry.productTitle ? ` — ${inquiry.productTitle}` : ""}`,
      html: `<div style="background:#10150e;color:#eee8d9;padding:32px;font:16px/1.6 Arial,sans-serif"><h1 style="color:#c9d49c;font:28px Georgia,serif">New ${escapeHtml(kind.toLowerCase())}</h1>${details}<div style="margin:24px 0;padding:18px;border-left:3px solid #9daa60;background:#171d14;white-space:pre-wrap">${escapeHtml(inquiry.message)}</div><p><a href="https://www.olivevintage.store/admin/inquiries.html" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#9daa60;color:#0b0e09;text-decoration:none;font-weight:bold">Open Owner Inbox</a></p></div>`,
    }),
  });
  if (!response.ok) throw new Error(`Resend notification failed with HTTP ${response.status}`);
  return true;
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
    let notified = false;
    try {
      notified = await sendInquiryNotification({
        id: inquiryId, type: inquiryType, productTitle, name, email, phone, location, message, photoCount: photos.length,
      });
    } catch (notificationError) {
      // Email is secondary: the saved owner-inbox record must remain successful.
      console.error("gallery-inquiry notification", notificationError);
    }
    return json(origin, { ok: true, id: inquiryId, notified }, 201);
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
