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
  window.addEventListener("load", () => setTimeout(dismissIntro, 850));
  setTimeout(dismissIntro, 1800);
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
  const price = isSold ? "Sold" : p.inquire_only ? "Inquire to purchase" : money(p.price);
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
        <div class="live-product-stage"><img src="${esc(image)}" alt="${esc(p.title)}" loading="${index === 0 ? "eager" : "lazy"}" ${index === 0 ? 'fetchpriority="high"' : ""}></div>
        <div class="product-image-topline">
          <span>${isSold ? "Gallery Archive" : "Available"}</span>
          ${p.status === "reserved" ? `<span class="product-badge">Reserved</span>` : ""}
        </div>
        <div class="product-image-number">${p.images?.length > 1 ? `${p.images.length} PHOTOS · ` : ""}${String(index + 1).padStart(2, "0")}</div>
      </button>` : `<div class="product-image live-product-image awaiting-product-image"><div class="awaiting-product-art" aria-hidden="true"><span class="awaiting-product-ring"></span><span class="awaiting-product-mark">OV</span></div><div class="product-image-topline"><span>Photos being added</span></div><div class="awaiting-product-copy"><strong>Original imagery in recovery</strong><small>Exact marketplace photos only</small></div><div class="product-image-number">${String(index + 1).padStart(2, "0")}</div></div>`}
      <div class="product-info">
        <div class="product-meta-line">
          <p class="eyebrow">${esc(p.category || "ART GLASS")}</p>
          <span class="product-price">${esc(price)}</span>
        </div>
        <h3>${esc(p.title)}</h3>
        <div class="product-detail-row">
          <p>${esc(makerLine)}</p>
          ${action}
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
  grid.innerHTML=photoFirst.length?photoFirst.map((p,index)=>productCard(p,index)).join(""):`<div class="collection-empty">No products in this view.</div>`;
  if(count){const suffix=homeActiveCategory?` in ${homeActiveCategory}`:"";count.textContent=`${visible.length} ${homeActiveStatus==="all"?"public records":homeActiveStatus==="sold"?"sold works":"available works"}${suffix}`;}
  document.querySelectorAll("[data-home-category-count]").forEach(el=>{const category=el.dataset.homeCategoryCount;const total=category?statusRows.filter(p=>p.category===category).length:statusRows.length;el.textContent=`${total} ${total===1?"work":"works"}`;});
  bindBuyNowButtons();
  bindProductImageGalleries(photoFirst,grid);
}

document.querySelectorAll("[data-home-status]").forEach(btn=>btn.addEventListener("click",()=>{homeActiveStatus=btn.dataset.homeStatus;document.querySelectorAll("[data-home-status]").forEach(b=>b.classList.toggle("active",b===btn));renderHomeCollection();}));
document.querySelectorAll("[data-home-category]").forEach(btn=>btn.addEventListener("click",()=>{homeActiveCategory=btn.dataset.homeCategory||"";document.querySelectorAll("[data-home-category]").forEach(b=>{const selected=b===btn;b.classList.toggle("active",selected);b.setAttribute("aria-pressed",String(selected));});renderHomeCollection();document.getElementById("homeCollectionControls")?.scrollIntoView({behavior:"smooth",block:"start"});}));

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
    if(!homeInventoryRows.length)homeInventoryRows=fallbackProducts;
    updateHomeCategoryRepresentatives();
    const available=homeInventoryRows.filter(p=>p.status==="available").length;
    const sold=homeInventoryRows.filter(p=>p.status==="sold").length;
    const availableButton=document.querySelector('[data-home-status="available"]');
    const soldButton=document.querySelector('[data-home-status="sold"]');
    const allButton=document.querySelector('[data-home-status="all"]');
    if(availableButton)availableButton.textContent=`Available · ${available}`;
    if(soldButton)soldButton.textContent=`Sold Archive · ${sold}`;
    if(allButton)allButton.textContent=`All Public · ${homeInventoryRows.length}`;
    renderHomeCollection();
  } catch (error) {
    console.info("Live inventory is not configured yet. Showing curated local collection.", error);
    homeInventoryRows=fallbackProducts;
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
