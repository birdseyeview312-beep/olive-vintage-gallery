import { supabase } from "./supabase-client.js";

export async function getGalleryProducts({
  category = null,
  status = "available",
  featured = null,
  newArrival = null,
  limit = null
} = {}) {
  let q = supabase.from("products").select("*").order("created_at", { ascending: false });

  if (status) q = q.eq("status", status);
  if (category) q = q.eq("category", category);
  if (featured !== null) q = q.eq("featured", featured);
  if (newArrival !== null) q = q.eq("new_arrival", newArrival);
  if (limit) q = q.limit(limit);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
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
