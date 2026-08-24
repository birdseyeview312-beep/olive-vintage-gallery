import { supabase } from "./supabase-client.js";

// Supabase/PostgREST projects can enforce a server-side maximum number of rows
// returned by any one request. Fetch in small, stable pages and keep going until
// the server has no more rows. This means the public Collection has no practical
// catalog cap as inventory grows.
const DEFAULT_PAGE_SIZE = 10;

export async function getGalleryProducts({
  category = null,
  status = "available",
  featured = null,
  newArrival = null,
  limit = null
} = {}) {
  const requestedLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.floor(Number(limit))
    : null;

  const results = [];
  const seenIds = new Set();
  let from = 0;

  while (true) {
    const remaining = requestedLimit === null
      ? DEFAULT_PAGE_SIZE
      : requestedLimit - results.length;

    if (remaining <= 0) break;

    const pageSize = Math.min(DEFAULT_PAGE_SIZE, remaining);
    const to = from + pageSize - 1;

    let q = supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (status) q = q.eq("status", status);
    if (category) q = q.eq("category", category);
    if (featured !== null) q = q.eq("featured", featured);
    if (newArrival !== null) q = q.eq("new_arrival", newArrival);

    const { data, error } = await q;
    if (error) throw error;

    const page = data || [];
    if (!page.length) break;

    let added = 0;
    for (const product of page) {
      const key = product?.id ? String(product.id) : null;
      if (key && seenIds.has(key)) continue;
      if (key) seenIds.add(key);
      results.push(product);
      added += 1;
      if (requestedLimit !== null && results.length >= requestedLimit) break;
    }

    if (requestedLimit !== null && results.length >= requestedLimit) break;

    // A short page means we reached the end. If a backend ever ignores ranges
    // and repeats the same page, the no-new-rows guard prevents an endless loop.
    if (page.length < pageSize || added === 0) break;

    from += pageSize;
  }

  return results;
}

export function formatProductForExistingUI(p) {
  return {
    id: p.id,
    inventoryNumber: p.inventory_number,
    title: p.title,
    maker: p.maker,
    category: p.category,
    price: p.price,
    status: p.status,
    date: p.date_period,
    origin: p.origin,
    medium: p.medium,
    dimensions: { height: p.height, width: p.width, depth: p.depth },
    condition: p.condition,
    provenance: p.provenance,
    description: p.description,
    images: p.images || [],
    featured: p.featured,
    newArrival: p.new_arrival,
    inquireOnly: p.inquire_only
  };
}
