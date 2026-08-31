import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { supabase as authSupabase } from "./supabase-client.js";
import { bindProductImageGalleries } from "./product-gallery.js";

authSupabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    window.location.replace("./admin/settings.html?recovery=1");
  }
});

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const intro = document.getElementById("intro");
const dismissIntro = () => intro?.classList.add("done");
let introSeen = false;
try { introSeen = sessionStorage.getItem("olive_intro_seen") === "1"; } catch {}
if (reducedMotion || introSeen) {
  dismissIntro();
} else {
  window.addEventListener("load", () => setTimeout(dismissIntro, 250));
  setTimeout(dismissIntro, 900);
  try { sessionStorage.setItem("olive_intro_seen", "1"); } catch {}
}

const header = document.querySelector(".site-header");
const menuBtn = document.getElementById("menuBtn");
const nav = document.getElementById("nav");

window.addEventListener("scroll", () => header?.classList.toggle("scrolled", window.scrollY > 20));
menuBtn?.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
});
nav?.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
  nav.classList.remove("open");
  menuBtn?.setAttribute("aria-expanded","false");
}));

const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      io.unobserve(entry.target);
    }
  });
}, { threshold: .12 });
document.querySelectorAll(".reveal").forEach(el => io.observe(el));
document.getElementById("year").textContent = new Date().getFullYear();

const esc = (s="") => String(s).replace(/[&<>"']/g, m => ({
  "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
}[m]));

const money = value => {
  if (value === null || value === undefined || value === "") return "Price on request";
  return new Intl.NumberFormat("en-US", {
    style:"currency", currency:"USD", maximumFractionDigits:0
  }).format(Number(value));
};
const needsPriceInquiry = product => product?.inquire_only || product?.price === null || product?.price === undefined || product?.price === "";
const inquiryHref = product => `mailto:Olivejewelvintage@gmail.com?subject=${encodeURIComponent(`Olive Vintage Gallery inquiry — ${product?.title || "Artwork"}`)}`;

const isShippingReady = product => [
  product?.shipping_weight_oz,
  product?.shipping_length_in,
  product?.shipping_width_in,
  product?.shipping_height_in
].every(value => Number(value) > 0);

let checkoutEnabled = false;
let homeInventoryRows = [];
let homeActiveStatus = "available";
let homeActiveCategory = "";
const HOME_PAGE_SIZE = 18;
let homeVisibleLimit = HOME_PAGE_SIZE;
const TRAY_KEY = "olive_collector_tray_v1";
const LIGHTS_KEY = "olive_gallery_lights_v1";
let collectorTrayIds = new Set();
try { collectorTrayIds = new Set(JSON.parse(localStorage.getItem(TRAY_KEY) || "[]").map(String)); } catch {}

async function getCheckoutEnabled() {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/payment-status`, {
      method: "GET",
      headers: { apikey: SUPABASE_ANON_KEY },
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    return response.ok && data?.enabled === true;
  } catch {
    return false;
  }
}

const fallbackProducts = [
  { title: "Purple Optic Vase", category: "STUDIO GLASS", images: ["./assets/products/black-optic-teardrop-vase.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "Raspberry & Blossom Paperweight", category: "ART GLASS", images: ["./assets/products/raspberry-blossom-paperweight.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "Emerald & Violet Striped Vase", category: "STUDIO GLASS", images: ["./assets/products/emerald-violet-striped-vase.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "Blue Bird Glass Sculpture", category: "ART GLASS", images: ["./assets/products/blue-bird-glass-sculpture.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "Aqua Glass Boot Sculpture", category: "ART GLASS", images: ["./assets/products/aqua-glass-boot-sculpture.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "Pink Floral Paperweight", category: "ART GLASS", images: ["./assets/products/pink-floral-paperweight.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "White Blossom Paperweight", category: "ART GLASS", images: ["./assets/products/white-blossom-paperweight.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "Color Burst Studio Vase", category: "STUDIO GLASS", images: ["./assets/products/color-burst-studio-vase.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true }
];

function productCard(p, index = 0) {
  const image = p.gallery_cover_image || p.images?.[0];
  const isSold = p.status === "sold";
  const price = isSold ? "Sold" : money(p.price);
  const makerLine = [p.maker, p.date_period].filter(Boolean).join(" · ") || "Olive Vintage Gallery";
  const cardClass = index === 0 ? "product-card featured-product reveal visible" : "product-card reveal visible";
  const inquirySubject = encodeURIComponent(`Olive Vintage Gallery inquiry — ${p.title || "Artwork"}`);
  const canBuyNow = checkoutEnabled && isShippingReady(p) && !!p.id && p.status === "available" && !p.inquire_only && p.price !== null && p.price !== undefined && Number(p.price) > 0;
  const action = isSold ? `<span class="collection-status sold">Sold</span>` : canBuyNow
    ? `<button class="product-buy-now" type="button" data-buy-product="${esc(p.id)}">Buy Now <span>↗</span></button>`
    : `<a class="product-inquire" href="mailto:Olivejewelvintage@gmail.com?subject=${inquirySubject}">Inquire <span>↗</span></a>`;
  return `
    <article class="${cardClass}" data-product-id="${esc(p.id || "")}">
      ${image ? `<button class="product-image live-product-image product-gallery-trigger" type="button" data-gallery-product="${esc(p.id)}" aria-label="View ${p.images?.length > 1 ? `all ${p.images.length} photos` : "larger photo"} of ${esc(p.title)}">
        <div class="live-product-stage"><img src="${esc(image)}" alt="${esc(p.title)}" loading="${index === 0 ? "eager" : "lazy"}" decoding="async" ${index === 0 ? 'fetchpriority="high"' : ""}></div>
        <div class="product-image-topline">
          <span>${isSold ? "Gallery Archive" : "Available"}</span>
          ${p.status === "reserved" ? `<span class="product-badge">Reserved</span>` : ""}
        </div>
        <div class="product-image-number">${p.images?.length > 1 ? `${p.images.length} PHOTOS · ` : ""}${String(index + 1).padStart(2, "0")}</div>
      </button>` : `<div class="product-image live-product-image awaiting-product-image"><div class="awaiting-product-art" aria-hidden="true"><span class="awaiting-product-ring"></span><span class="awaiting-product-mark">OV</span></div><div class="product-image-topline"><span>Photos being added</span></div><div class="awaiting-product-copy"><strong>Original imagery in recovery</strong><small>Exact marketplace photos only</small></div><div class="product-image-number">${String(index + 1).padStart(2, "0")}</div></div>`}
      <div class="product-info">
        <div class="product-meta-line">
          <p class="eyebrow">${esc(p.category || "ART GLASS")}</p>
          ${!isSold && needsPriceInquiry(p)
            ? `<a class="product-price price-inquiry-button" href="${inquiryHref(p)}">Price on request <span aria-hidden="true">↗</span></a>`
            : `<span class="product-price">${esc(price)}</span>`}
        </div>
        <h3>${esc(p.title)}</h3>
        <div class="product-detail-row">
          <p>${esc(makerLine)}</p>
          <div class="product-card-actions">${action}<button class="collector-save" type="button" data-save-product="${esc(p.id || "")}" aria-pressed="${collectorTrayIds.has(String(p.id))}">${collectorTrayIds.has(String(p.id)) ? "♥ Saved" : "♡ Save"}</button></div>
        </div>
      </div>
    </article>`;
}

function updateHomeCategoryRepresentatives(){
  document.querySelectorAll("[data-home-category-image]").forEach(image=>{
    const category=image.dataset.homeCategoryImage;
    const categoryRows=homeInventoryRows.filter(p=>p.category===category);
    const representative=categoryRows.find(p=>p.status==="available"&&(p.gallery_cover_image||p.images?.[0]))||categoryRows.find(p=>p.gallery_cover_image||p.images?.[0]);
    if(!representative)return;
    image.src=representative.gallery_cover_image||representative.images[0];
    image.alt=`Representative listing: ${representative.title}`;
    const button=image.closest("[data-home-category]");
    button?.setAttribute("aria-label",`Browse ${category}, represented by ${representative.title}`);
  });
}

function renderHomeCollection(){
  const grid=document.getElementById("productGrid");
  const count=document.getElementById("homeCollectionCount");
  if(!grid)return;
  const statusRows=homeActiveStatus==="all"?homeInventoryRows:homeInventoryRows.filter(p=>p.status===homeActiveStatus);
  const visible=homeActiveCategory?statusRows.filter(p=>p.category===homeActiveCategory):statusRows;
  const photoFirst=[...visible.filter(p=>p.gallery_cover_image||p.images?.length),...visible.filter(p=>!p.gallery_cover_image&&!p.images?.length)];
  const renderedRows=photoFirst.slice(0,homeVisibleLimit);
  grid.innerHTML=renderedRows.length?renderedRows.map((p,index)=>productCard(p,index)).join(""):`<div class="collection-empty">No products in this view.</div>`;
  if(count){const suffix=homeActiveCategory?` in ${homeActiveCategory}`:"";const label=homeActiveStatus==="all"?"public records":homeActiveStatus==="sold"?"sold works":"available works";count.textContent=visible.length>renderedRows.length?`Showing ${renderedRows.length} of ${visible.length} ${label}${suffix}`:`${visible.length} ${label}${suffix}`;}
  const loadMore=document.getElementById("homeLoadMore");
  if(loadMore){const remaining=Math.max(0,photoFirst.length-renderedRows.length);loadMore.hidden=remaining===0;loadMore.textContent=remaining?`Show ${Math.min(HOME_PAGE_SIZE,remaining)} more works`:"";}
  document.querySelectorAll("[data-home-category-count]").forEach(el=>{const category=el.dataset.homeCategoryCount;const total=category?statusRows.filter(p=>p.category===category).length:statusRows.length;el.textContent=`${total} ${total===1?"work":"works"}`;});
  bindBuyNowButtons();
  bindCollectorButtons();
  bindProductImageGalleries(renderedRows,grid);
}

document.querySelectorAll("[data-home-status]").forEach(btn=>btn.addEventListener("click",()=>{homeActiveStatus=btn.dataset.homeStatus;homeVisibleLimit=HOME_PAGE_SIZE;document.querySelectorAll("[data-home-status]").forEach(b=>b.classList.toggle("active",b===btn));renderHomeCollection();}));
document.querySelectorAll("[data-home-category]").forEach(btn=>btn.addEventListener("click",()=>{homeActiveCategory=btn.dataset.homeCategory||"";homeVisibleLimit=HOME_PAGE_SIZE;document.querySelectorAll("[data-home-category]").forEach(b=>{const selected=b===btn;b.classList.toggle("active",selected);b.setAttribute("aria-pressed",String(selected));});renderHomeCollection();document.getElementById("homeCollectionControls")?.scrollIntoView({behavior:"smooth",block:"start"});}));
document.getElementById("homeLoadMore")?.addEventListener("click",()=>{homeVisibleLimit+=HOME_PAGE_SIZE;renderHomeCollection();});

async function loadLiveInventory() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  try {
    const { getGalleryProducts } = await import("./gallery-data.js");
    // Pull the live public inventory, then prioritize products that already have
    // verified listing photos. Newness is preserved within each group because
    // getGalleryProducts() returns newest records first.
    const [rows, paymentsReady] = await Promise.all([
      getGalleryProducts({ status: null }),
      getCheckoutEnabled()
    ]);
    checkoutEnabled = paymentsReady;
    homeInventoryRows = rows.filter(p => ["available","reserved","sold"].includes(p.status));
    if(!homeInventoryRows.length)homeInventoryRows=fallbackProducts.map((p,index)=>({...p,id:`curated-${index+1}`}));
    updateHomeCategoryRepresentatives();
    const available=homeInventoryRows.filter(p=>p.status==="available").length;
    const sold=homeInventoryRows.filter(p=>p.status==="sold").length;
    const availableButton=document.querySelector('[data-home-status="available"]');
    const soldButton=document.querySelector('[data-home-status="sold"]');
    const allButton=document.querySelector('[data-home-status="all"]');
    if(availableButton)availableButton.textContent=`Available · ${available}`;
    if(soldButton){soldButton.textContent=`Sold Archive · ${sold}`;soldButton.hidden=sold===0;}
    if(allButton){allButton.textContent=`All Public · ${homeInventoryRows.length}`;allButton.hidden=sold===0;}
    renderObjectOfWeek();
    renderHomeCollection();
  } catch (error) {
    console.info("Live inventory is not configured yet. Showing curated local collection.", error);
    homeInventoryRows=fallbackProducts.map((p,index)=>({...p,id:`curated-${index+1}`}));
    renderObjectOfWeek();
    renderHomeCollection();
  }
}

function checkoutNotice(message, type = "") {
  let el = document.getElementById("checkoutNotice");
  if (!el) {
    el = document.createElement("div");
    el.id = "checkoutNotice";
    el.className = "checkout-notice";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.className = `checkout-notice show ${type}`.trim();
  el.textContent = message;
  clearTimeout(checkoutNotice.timer);
  checkoutNotice.timer = setTimeout(() => el.classList.remove("show"), 6500);
}

async function beginBuyNow(productId, button) {
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = "Opening secure checkout…";
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/square-checkout`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", product_id: productId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.approve_url) throw new Error(data.error || "Secure checkout is temporarily unavailable.");
    window.location.assign(data.approve_url);
  } catch (error) {
    checkoutNotice(error.message || "Secure checkout is temporarily unavailable.", "error");
    button.disabled = false;
    button.innerHTML = original;
  }
}

function bindBuyNowButtons() {
  document.querySelectorAll("[data-buy-product]").forEach(button => {
    button.addEventListener("click", () => beginBuyNow(button.dataset.buyProduct, button));
  });
}

function saveCollectorTray() {
  try { localStorage.setItem(TRAY_KEY, JSON.stringify([...collectorTrayIds])); } catch {}
  renderCollectorTray();
  document.querySelectorAll("[data-save-product]").forEach(button => {
    const saved = collectorTrayIds.has(String(button.dataset.saveProduct));
    button.setAttribute("aria-pressed", String(saved));
    button.textContent = saved ? "♥ Saved" : button.id === "objectWeekSave" ? "♡ Save to Collector’s Tray" : "♡ Save";
  });
}

function toggleCollectorItem(id) {
  const key = String(id || "");
  if (!key) return;
  if (collectorTrayIds.has(key)) collectorTrayIds.delete(key); else collectorTrayIds.add(key);
  saveCollectorTray();
}

function bindCollectorButtons() {
  document.querySelectorAll("[data-save-product]").forEach(button => {
    if (button.dataset.trayBound) return;
    button.dataset.trayBound = "true";
    button.addEventListener("click", event => { event.stopPropagation(); toggleCollectorItem(button.dataset.saveProduct); });
  });
}

function renderCollectorTray() {
  const count = document.getElementById("collectorTrayCount");
  const items = document.getElementById("collectorTrayItems");
  const inquiry = document.getElementById("collectorTrayInquiry");
  const saved = [...collectorTrayIds].map(id => homeInventoryRows.find(p => String(p.id) === id)).filter(Boolean);
  if (count) count.textContent = String(saved.length);
  if (!items) return;
  items.innerHTML = saved.length ? saved.map(p => {
    const image = p.gallery_cover_image || p.images?.[0] || "./assets/olive-brand.jpg";
    const trayPrice=p.status==="sold"
      ? "Sold"
      : needsPriceInquiry(p)
        ? `<a class="price-inquiry-button tray-price-inquiry" href="${inquiryHref(p)}">Price on request <span aria-hidden="true">↗</span></a>`
        : esc(money(p.price));
    return `<article><img src="${esc(image)}" alt=""><div><p class="eyebrow">${esc(p.category || "ART GLASS")}</p><h3>${esc(p.title)}</h3><p>${trayPrice}</p></div><button type="button" data-remove-tray="${esc(p.id)}" aria-label="Remove ${esc(p.title)}">Remove</button></article>`;
  }).join("") : `<div class="collector-tray-empty"><span>◇</span><h3>Your tray is ready.</h3><p>Tap “Save” on any listing to build a private edit.</p></div>`;
  items.querySelectorAll("[data-remove-tray]").forEach(button => button.addEventListener("click", () => toggleCollectorItem(button.dataset.removeTray)));
  const titles = saved.map(p => `• ${p.title}`).join("\n");
  if (inquiry) {
    inquiry.hidden = !saved.length;
    inquiry.href = `mailto:Olivejewelvintage@gmail.com?subject=${encodeURIComponent("Collector’s Tray inquiry")}&body=${encodeURIComponent(`Hello Olive Vintage Gallery,\n\nI’m interested in these pieces:\n${titles}\n\nPlease tell me more.`)}`;
  }
}

function renderObjectOfWeek() {
  const section = document.getElementById("object-of-week");
  const weeklyCandidates = homeInventoryRows.filter(p => p.status === "available" && (p.gallery_cover_image || p.images?.[0]));
  const featured = weeklyCandidates.find(p => p.featured);
  const weekNumber = Math.floor(Date.now() / 604800000);
  const product = featured || weeklyCandidates[weekNumber % weeklyCandidates.length];
  if (!section || !product) return;
  const image = product.gallery_cover_image || product.images[0];
  section.hidden = false;
  document.getElementById("objectWeekImage").src = image;
  document.getElementById("objectWeekImage").alt = product.title || "Featured art glass";
  document.getElementById("objectWeekTitle").textContent = product.title;
  document.getElementById("objectWeekMaker").textContent = [product.maker, product.date_period, product.category].filter(Boolean).join(" · ") || "Olive Vintage Gallery selection";
  document.getElementById("objectWeekDescription").textContent = product.description || "A singular gallery selection chosen for its form, color, craftsmanship and unmistakable presence.";
  const objectWeekPrice=document.getElementById("objectWeekPrice");
  if(needsPriceInquiry(product)){
    objectWeekPrice.innerHTML=`<a class="price-inquiry-button object-week-price-inquiry" href="${inquiryHref(product)}">Price on request <span aria-hidden="true">↗</span></a>`;
  }else{
    objectWeekPrice.textContent=money(product.price);
  }
  const gallery = document.getElementById("objectWeekGallery");
  gallery.dataset.galleryProduct = product.id;
  const save = document.getElementById("objectWeekSave");
  save.dataset.saveProduct = product.id;
  bindCollectorButtons();
  saveCollectorTray();
  bindProductImageGalleries(homeInventoryRows, section);
}

const tray = document.getElementById("collectorTray");
const trayButton = document.getElementById("collectorTrayButton");
const setPageInert = value => document.querySelectorAll("header,main,footer,#oliveMascot").forEach(el => { el.inert = value; });
const closeTray = () => { if (!tray) return; tray.hidden = true; document.body.classList.remove("collector-tray-open"); setPageInert(false); trayButton?.setAttribute("aria-expanded","false"); trayButton?.focus(); };
trayButton?.addEventListener("click", () => { tray.hidden = false; document.body.classList.add("collector-tray-open"); setPageInert(true); trayButton.setAttribute("aria-expanded","true"); renderCollectorTray(); document.getElementById("collectorTrayClose")?.focus(); });
document.getElementById("collectorTrayClose")?.addEventListener("click", closeTray);
document.getElementById("collectorTrayBackdrop")?.addEventListener("click", closeTray);
document.addEventListener("keydown", event => {
  if (!tray || tray.hidden) return;
  if (event.key === "Escape") { closeTray(); return; }
  if (event.key !== "Tab") return;
  const focusable = [...tray.querySelectorAll('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el => !el.hidden);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
renderCollectorTray();

const lightsToggle = document.getElementById("galleryLightsToggle");
let galleryLights = false;
try { galleryLights = localStorage.getItem(LIGHTS_KEY) === "on"; } catch {}
function updateGalleryLights() {
  document.body.classList.toggle("gallery-lights", galleryLights);
  lightsToggle?.setAttribute("aria-pressed", String(galleryLights));
  if (lightsToggle) lightsToggle.textContent = galleryLights ? "✦ Gallery Lights On" : "✦ Gallery Lights";
}
lightsToggle?.addEventListener("click", () => { galleryLights = !galleryLights; try { localStorage.setItem(LIGHTS_KEY, galleryLights ? "on" : "off"); } catch {} updateGalleryLights(); });
updateGalleryLights();

const tourButton = document.getElementById("oliveTourButton");
let tourRunning = false;
const tourWait = ms => new Promise(resolve => window.setTimeout(resolve, ms));
tourButton?.addEventListener("click", async () => {
  if (tourRunning) { tourRunning = false; tourButton.textContent = "Tour with Olive"; return; }
  tourRunning = true;
  tourButton.textContent = "End Olive’s Tour";
  const stops = [
    ["#collection", "These are our five collecting rooms. I alphabetized them emotionally.", "wave"],
    ["#new", "The live collection. Looking is encouraged; gasping is complimentary.", "inspect"],
    ["#object-of-week", "My weekly favorite. I remain professionally unbiased, obviously.", "bow"],
    ["#live-auctions", "The auction room. I practice my serious face here.", "hop"],
    ["#story", "And that is our point of view: extraordinary objects, no velvet rope required.", "wave"]
  ];
  for (const [selector, message, action] of stops) {
    if (!tourRunning) break;
    const target = document.querySelector(selector);
    if (!target || target.hidden) continue;
    target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    await tourWait(reducedMotion ? 150 : 850);
    window.dispatchEvent(new CustomEvent("olive:tour-stop", { detail: { message, action } }));
    await tourWait(reducedMotion ? 1200 : 3200);
  }
  tourRunning = false;
  tourButton.textContent = "Tour with Olive";
});

const checkoutState = new URLSearchParams(location.search).get("checkout");
if (checkoutState === "cancelled") {
  setTimeout(() => checkoutNotice("Checkout cancelled. The artwork will return to available inventory when the short reservation expires."), 500);
}

loadLiveInventory();


// Subtle gallery interactions. Disabled automatically for reduced-motion users.
if (!reducedMotion) {
  const heroArt = document.querySelector("[data-hero-art]");
  const heroImage = heroArt?.querySelector("[data-parallax-image]");
  heroArt?.addEventListener("pointermove", (e) => {
    const r = heroArt.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5;
    const y = (e.clientY - r.top) / r.height - .5;
    if (heroImage) heroImage.style.transform = `scale(.88) translate(${x * 9}px, ${y * 7}px)`;
  });
  heroArt?.addEventListener("pointerleave", () => {
    if (heroImage) heroImage.style.transform = "scale(.88)";
  });

  document.querySelectorAll(".product-card").forEach(card => {
    card.addEventListener("pointermove", e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });

  const signatureImage = document.querySelector(".signature-image [data-parallax-image]");
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking || !signatureImage) return;
    ticking = true;
    requestAnimationFrame(() => {
      const r = signatureImage.parentElement.getBoundingClientRect();
      const progress = Math.max(-1, Math.min(1, (window.innerHeight / 2 - (r.top + r.height / 2)) / window.innerHeight));
      signatureImage.style.transform = `scale(1.04) translateY(${progress * 14}px)`;
      ticking = false;
    });
  }, { passive: true });
}

async function loadHomeAuctionPreview(){
  const titleEl=document.getElementById("homeAuctionTitle");
  if(!titleEl)return;
  try{
    const { supabase }=await import("./supabase-client.js");
    const {data,error}=await supabase.from("auction_events").select("title,starts_at,status,published").eq("published",true).in("status",["live","scheduled"]).order("starts_at",{ascending:true,nullsFirst:false}).limit(5);
    if(error)throw error;
    const rows=data||[];
    const active=rows.find(x=>x.status==="live")||rows.find(x=>x.status==="scheduled");
    if(!active)return;
    document.getElementById("homeAuctionKicker").textContent=active.status==="live"?"LIVE NOW":"NEXT AUCTION";
    titleEl.textContent=active.title;
    document.getElementById("homeAuctionStatus").textContent=active.status==="live"?"The auction room is open. Join the live bidding.":"Preview the catalog and register your bidder paddle.";
    document.getElementById("homeAuctionDate").textContent=active.starts_at?new Intl.DateTimeFormat("en-US",{month:"long",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(active.starts_at)):"Date to be announced";
  }catch(error){console.info("Auction preview is not public yet.",error);}
}
loadHomeAuctionPreview();
