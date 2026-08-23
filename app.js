const intro = document.getElementById("intro");
const dismissIntro = () => intro?.classList.add("done");
window.addEventListener("load", () => setTimeout(dismissIntro, 1250));
setTimeout(dismissIntro, 2500);

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


const fallbackProducts = [
  { title: "Purple Optic Vase", category: "STUDIO GLASS", images: ["./assets/products/black-optic-teardrop-vase.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "Lavender Studio Jug", category: "CERAMIC", images: ["./assets/products/lavender-studio-jug.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "Raspberry & Blossom Paperweight", category: "ART GLASS", images: ["./assets/products/raspberry-blossom-paperweight.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "Emerald & Violet Striped Vase", category: "STUDIO GLASS", images: ["./assets/products/emerald-violet-striped-vase.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "Blue Bird Glass Sculpture", category: "ART GLASS", images: ["./assets/products/blue-bird-glass-sculpture.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "Aqua Glass Boot Sculpture", category: "ART GLASS", images: ["./assets/products/aqua-glass-boot-sculpture.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "Pink Floral Paperweight", category: "ART GLASS", images: ["./assets/products/pink-floral-paperweight.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "White Blossom Paperweight", category: "ART GLASS", images: ["./assets/products/white-blossom-paperweight.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "Brushed Metal Table Object", category: "DESIGN OBJECT", images: ["./assets/products/brushed-metal-table-object.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true },
  { title: "Color Burst Studio Vase", category: "STUDIO GLASS", images: ["./assets/products/color-burst-studio-vase.webp"], price: null, status: "available", maker: "", date_period: "", inquire_only: true }
];

function productCard(p, index = 0) {
  const image = p.images?.[0];
  const price = p.inquire_only ? "Inquire to purchase" : money(p.price);
  const makerLine = [p.maker, p.date_period].filter(Boolean).join(" · ") || "Olive Vintage Gallery";
  const cardClass = index === 0 ? "product-card featured-product reveal visible" : "product-card reveal visible";
  const inquirySubject = encodeURIComponent(`Olive Vintage Gallery inquiry — ${p.title || "Artwork"}`);
  return `
    <article class="${cardClass}">
      <div class="product-image live-product-image">
        ${image
          ? `<div class="live-product-stage"><img src="${esc(image)}" alt="${esc(p.title)}" loading="${index === 0 ? "eager" : "lazy"}" ${index === 0 ? 'fetchpriority="high"' : ""}></div>`
          : `<div class="product-placeholder p1"></div>`}
        <div class="product-image-topline">
          <span>New Acquisition</span>
          ${p.status === "reserved" ? `<span class="product-badge">Reserved</span>` : ""}
        </div>
        <div class="product-image-number">${String(index + 1).padStart(2, "0")}</div>
      </div>
      <div class="product-info">
        <div class="product-meta-line">
          <p class="eyebrow">${esc(p.category || "ART GLASS")}</p>
          <span class="product-price">${esc(price)}</span>
        </div>
        <h3>${esc(p.title)}</h3>
        <div class="product-detail-row">
          <p>${esc(makerLine)}</p>
          <a class="product-inquire" href="mailto:hello@olivevintage.store?subject=${inquirySubject}">Inquire <span>↗</span></a>
        </div>
      </div>
    </article>`;
}

async function loadLiveInventory() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  try {
    const { getGalleryProducts } = await import("./gallery-data.js");
    // Show newest live acquisitions. Public RLS still determines which records are visible.
    const rows = await getGalleryProducts({ status: null, limit: 10 });
    const live = rows.filter(p => ["available","reserved"].includes(p.status));
    const products = live.length ? live : fallbackProducts;
    grid.innerHTML = products.map((p, index) => productCard(p, index)).join("");
  } catch (error) {
    console.info("Live inventory is not configured yet. Showing curated local collection.", error);
    grid.innerHTML = fallbackProducts.map((p, index) => productCard(p, index)).join("");
  }
}

loadLiveInventory();


// Subtle gallery interactions. Disabled automatically for reduced-motion users.
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
