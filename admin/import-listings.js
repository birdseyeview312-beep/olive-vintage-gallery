import { supabase } from "./supabase-client.js";

const $ = (id) => document.getElementById(id);
const fields = [
  ["title", "Title", true, ["title", "listing title", "item title", "product name", "name"]],
  ["price", "Price", false, ["price", "listing price", "asking price", "item price"]],
  ["sku", "SKU", false, ["sku", "custom label", "custom label sku", "seller sku"]],
  ["externalId", "Marketplace listing ID", false, ["listing id", "item id", "ebay item id", "whatnot listing id", "external id"]],
  ["url", "Marketplace listing URL", false, ["listing url", "item url", "url", "link"]],
  ["description", "Description", false, ["description", "listing description", "item description"]],
  ["maker", "Maker / brand", false, ["maker", "brand", "manufacturer"]],
  ["category", "Category", false, ["category", "listing category", "product category"]],
  ["condition", "Condition", false, ["condition", "item condition"]],
  ["era", "Era / date period", false, ["era", "date period", "period", "year"]],
  ["dimensions", "Dimensions", false, ["dimensions", "size"]],
  ["images", "Photo URLs", false, ["image urls", "photo urls", "images", "photos", "image url", "photo url"]]
];
let headers = [];
let rows = [];
let fileName = "";
let map = {};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function parseCsv(text) {
  const data = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); data.push(row); row = []; cell = ""; }
    else cell += c;
  }
  row.push(cell.replace(/\r$/, ""));
  if (row.some((v) => v.trim())) data.push(row);
  if (!data.length) return { headers: [], rows: [] };
  const clean = (v) => String(v ?? "").replace(/^\uFEFF/, "").trim();
  return { headers: data[0].map(clean), rows: data.slice(1).filter((r) => r.some((v) => String(v ?? "").trim())).map((r) => Object.fromEntries(data[0].map((h, i) => [clean(h), String(r[i] ?? "").trim()]))) };
}
function guessColumn(field, headerList) {
  const aliases = fields.find((f) => f[0] === field)?.[3] || [];
  const normalized = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return headerList.find((h) => aliases.includes(normalized(h))) || "";
}
function currentValues() {
  return Object.fromEntries(fields.map(([key]) => [key, $(`map-${key}`).value]));
}
function valueFor(row, key, mapping = map) {
  const column = mapping[key];
  return column ? String(row[column] ?? "").trim() : "";
}
function parseMoney(input) {
  if (!input) return null;
  const cleaned = String(input).replace(/[^0-9.\-]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
}
function photoUrls(input) {
  return String(input || "").split(/\s*[|;]\s*|\s*,\s*(?=https?:\/\/)/i)
    .map((url) => url.trim()).filter((url) => /^https?:\/\//i.test(url)).slice(0, 12);
}
function hashSku(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return `IMPORT-${(hash >>> 0).toString(16).toUpperCase()}`;
}
function productFrom(row, index, mapping = map) {
  const title = valueFor(row, "title", mapping);
  const price = parseMoney(valueFor(row, "price", mapping));
  const skuRaw = valueFor(row, "sku", mapping);
  const externalId = valueFor(row, "externalId", mapping).replace(/\.0$/, "");
  const platform = $("sourcePlatform").value;
  const sku = skuRaw || (externalId ? `${platform.toUpperCase()}-${externalId}` : hashSku(`${title}| ${price ?? ""}| ${photoUrls(valueFor(row, "images", mapping))[0] || index}`));
  const images = photoUrls(valueFor(row, "images", mapping));
  const description = valueFor(row, "description", mapping);
  const category = valueFor(row, "category", mapping);
  const condition = valueFor(row, "condition", mapping);
  const url = valueFor(row, "url", mapping);
  return {
    sku, externalId, url, images,
    product: {
      sku, title, description: description || null, maker: valueFor(row, "maker", mapping) || null,
      category: category || null, condition: condition || null, era: valueFor(row, "era", mapping) || null,
      dimensions: valueFor(row, "dimensions", mapping) || null, price, price_cents: price === null ? null : Math.round(price * 100),
      currency: "USD", inventory_quantity: 1, status: "draft", images,
      provenance: `Imported from ${fileName || "marketplace CSV"} on ${new Date().toLocaleDateString()}.`
    }
  };
}
function renderPreview() {
  map = currentValues();
  const prepared = rows.map((r, i) => productFrom(r, i));
  const visible = prepared;
  $("previewRows").innerHTML = visible.map((item, i) => {
    const duplicateLikely = rows[i] && item.product.sku.startsWith("IMPORT-") ? " · generated SKU" : "";
    return `<tr><td><label><input class="include-row" type="checkbox" data-index="${i}" checked> Include</label></td><td>${escapeHtml(item.product.title || "(missing title)")}</td><td>${item.product.price === null ? "No price" : new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(item.product.price)}</td><td>${escapeHtml(item.product.sku)}${duplicateLikely}</td><td>${item.images.length}</td></tr>`;
  }).join("");
  $("previewTitle").textContent = `Preview — ${rows.length} row${rows.length === 1 ? "" : "s"}`;
  $("previewCount").textContent = `${rows.length} rows ready to review`;
  $("importBtn").disabled = !map.title || !rows.length;
}
function renderMappings() {
  const options = `<option value="">— skip this field —</option>` + headers.map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join("");
  $("mappingGrid").innerHTML = fields.map(([key, label, required]) => `
    <label>${escapeHtml(label)}${required ? " *" : ""}
      <select id="map-${key}" data-field="${key}">${options}</select>
    </label>`).join("");
  fields.forEach(([key]) => { const guessed = guessColumn(key, headers); if (guessed) $(`map-${key}`).value = guessed; });
  $("mappingGrid").querySelectorAll("select").forEach((select) => select.addEventListener("change", renderPreview));
}
$("csvFile").addEventListener("change", async () => {
  const file = $("csvFile").files?.[0];
  if (!file) return;
  fileName = file.name;
  $("fileInfo").textContent = "Reading CSV…";
  try {
    const parsed = parseCsv(await file.text());
    headers = parsed.headers; rows = parsed.rows;
    if (!headers.length || !rows.length) throw new Error("This CSV has no listing rows.");
    $("fileInfo").textContent = `${file.name} · ${rows.length} data row${rows.length === 1 ? "" : "s"}`;
    $("mappingPanel").classList.remove("hidden");
    $("previewPanel").classList.remove("hidden");
    renderMappings(); renderPreview();
  } catch (error) {
    $("fileInfo").textContent = error.message;
    $("mappingPanel").classList.add("hidden"); $("previewPanel").classList.add("hidden");
  }
});
$("sourcePlatform").addEventListener("change", renderPreview);
$("importBtn").addEventListener("click", async () => {
  const button = $("importBtn");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user || session.user.app_metadata?.olive_role !== "admin") {
    $("importMessage").textContent = "Owner access expired. Sign in again.";
    return;
  }
  map = currentValues();
  const selected = [...document.querySelectorAll(".include-row:checked")].map((box) => Number(box.dataset.index));
  const prepared = selected.map((i) => productFrom(rows[i], i)).filter((item) => item.product.title);
  if (!prepared.length) { $("importMessage").textContent = "Select at least one row with a title."; return; }
  button.disabled = true; button.textContent = "Importing…"; $("importMessage").textContent = "Checking for duplicates…";
  try {
    const platform = $("sourcePlatform").value;
    const skus = [...new Set(prepared.map((item) => item.product.sku))];
    const { data: found, error: findError } = await supabase.from("products").select("id,sku").in("sku", skus);
    if (findError) throw findError;
    const existingBySku = new Map((found || []).filter((p) => p.sku).map((p) => [p.sku, p.id]));
    const uniquePrepared = [];
    const seen = new Set();
    for (const item of prepared) {
      if (seen.has(item.product.sku)) continue;
      seen.add(item.product.sku);
      uniquePrepared.push(item);
    }
    const fresh = uniquePrepared.filter((item) => !existingBySku.has(item.product.sku));
    const duplicateProducts = prepared.length - fresh.length;
    const inserted = [];
    for (let start = 0; start < fresh.length; start += 20) {
      const batch = fresh.slice(start, start + 20);
      const { data, error } = await supabase.from("products").insert(batch.map((item) => item.product)).select("id,sku");
      if (error) throw error;
      inserted.push(...(data || []));
    }
    const idBySku = new Map(existingBySku);
    inserted.forEach((p) => idBySku.set(p.sku, p.id));
    const candidateKeys = new Set();
    const candidates = prepared.filter((item) => {
      if (!item.externalId || !idBySku.has(item.product.sku) || candidateKeys.has(item.externalId)) return false;
      candidateKeys.add(item.externalId);
      return true;
    });
    const externalIds = [...new Set(candidates.map((item) => item.externalId))];
    let linkedCount = 0;
    if (externalIds.length) {
      const { data: existingLinks, error: linksReadError } = await supabase.from("platform_listings")
        .select("external_listing_id").eq("platform", platform).in("external_listing_id", externalIds);
      if (linksReadError) throw linksReadError;
      const linkedIds = new Set((existingLinks || []).map((link) => link.external_listing_id));
      const links = candidates.filter((item) => !linkedIds.has(item.externalId)).map((item) => ({
        product_id: idBySku.get(item.product.sku),
        platform,
        external_listing_id: item.externalId,
        listing_url: item.url || null,
        listing_status: "active",
        sync_managed: false,
        last_synced_at: new Date().toISOString()
      }));
      if (links.length) {
        const { error } = await supabase.from("platform_listings").insert(links);
        if (error) throw error;
        linkedCount = links.length;
      }
    }
    $("importMessage").textContent = `Added ${inserted.length} new Olive draft${inserted.length === 1 ? "" : "s"}; ${duplicateProducts} existing/duplicate product row${duplicateProducts === 1 ? "" : "s"} reused or skipped. Linked ${linkedCount} new ${platform === "ebay" ? "eBay" : "Whatnot"} listing${linkedCount === 1 ? "" : "s"}.`;
  } catch (error) {
    $("importMessage").textContent = error?.message || "Import failed.";
  } finally {
    button.disabled = false; button.textContent = "Import selected as drafts";
  }
});
$("signOutBtn").addEventListener("click", async () => { await supabase.auth.signOut(); location.href = "./dashboard.html"; });
(async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  const isAdmin = session?.user?.app_metadata?.olive_role === "admin";
  if (!isAdmin) { $("accessPanel").classList.remove("hidden"); return; }
  $("accessPanel").classList.add("hidden");
  $("importApp").classList.remove("hidden");
  $("signOutBtn").classList.remove("hidden");
  $("sessionEmail").textContent = session.user.email || "";
})();
