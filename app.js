const intro = document.getElementById("intro");
const dismissIntro = () => intro?.classList.add("done");
window.addEventListener("load", () => setTimeout(dismissIntro, 850));
setTimeout(dismissIntro, 1800);

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

const STATIC_PRODUCTS = [
  {
    "title": "Bryan Rubino Signed Art Glass Vessel",
    "maker": "Bryan Rubino",
    "price": 7900,
    "category": "Studio Art Glass",
    "images": [
      "./assets/products/bryan-rubino-vessel.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "Vintage Barcroft Zippo Table Lighter",
    "maker": "Barcroft / Zippo",
    "price": 175,
    "category": "Vintage Objects",
    "images": [
      "./assets/products/barcroft-zippo-lighter.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "Black Clay Vase, Signed Rigoberto Mateos",
    "maker": "Rigoberto Mateos",
    "price": 245,
    "category": "Ceramics",
    "images": [
      "./assets/products/rigoberto-mateos-vase.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "William Manson Snr Paperweight, Limited Edition 4 of 5",
    "maker": "Caithness / William Manson",
    "price": 1450,
    "category": "Art Glass",
    "images": [
      "./assets/products/caithness-manson-paperweight.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "Ceramic Pitcher, 2004",
    "maker": "Kristina Simanis",
    "price": 90,
    "category": "Ceramics",
    "images": [
      "./assets/products/kristina-simanis-pitcher.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "Frederick Carder Gold Aurene Art Glass Vase",
    "maker": "Steuben / Frederick Carder",
    "price": 600,
    "category": "American Art Glass",
    "images": [
      "./assets/products/steuben-carder-aurene.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "Signed Art Glass Vessel",
    "maker": "Anthony Gelpiart",
    "price": 3995,
    "category": "Studio Art Glass",
    "images": [
      "./assets/products/anthony-gelpiart-purple.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "Signed Pinch Vessel",
    "maker": "Peter Bramhall",
    "price": 1250,
    "category": "Studio Art Glass",
    "images": [
      "./assets/products/peter-bramhall-vessel.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "Signed Multi-Color Blown Art Glass Sculpture, 8 in.",
    "maker": "Rollin Karg",
    "price": 500,
    "category": "Studio Art Glass",
    "images": [
      "./assets/products/rollin-karg-sculpture.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "Paperweight 64/75",
    "maker": "Paul Stankard",
    "price": 980,
    "category": "Art Glass",
    "images": [
      "./assets/products/paul-stankard-paperweight.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "Studio & Gallery Angel Fish",
    "maker": "Kai Pua Artists",
    "price": 355,
    "category": "Studio Art Glass",
    "images": [
      "./assets/products/kai-pua-angel-fish.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "Large Hand Blown Vessel, Original XL",
    "maker": "Joan Nemtoi",
    "price": 2499,
    "category": "Studio Art Glass",
    "images": [
      "./assets/products/joan-nemtoi-vessel.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "Vintage Murano Penguin, 10 1/2 in.",
    "maker": "Licio Zanetti",
    "price": 1450,
    "category": "Murano Glass",
    "images": [
      "./assets/products/licio-zanetti-penguin.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "Signed Art Glass Vessel",
    "maker": "Anthony Gelpiart",
    "price": 4400,
    "category": "Studio Art Glass",
    "images": [
      "./assets/products/anthony-gelpiart-green.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "Neptune Hot Glass Berry Davis Pyramid Ocean",
    "maker": "Neptune Hot Glass",
    "price": 850,
    "category": "Studio Art Glass",
    "images": [
      "./assets/products/neptune-hot-glass.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "Art Deco Bronze Dancers on Marble Bookends, 1930s",
    "maker": "Art Deco",
    "price": 595,
    "category": "Vintage Objects",
    "images": [
      "./assets/products/art-deco-bookends.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  },
  {
    "title": "Signed Murano Aquarium Boot",
    "maker": "Carlo Colizza",
    "price": 1950,
    "category": "Murano Glass",
    "images": [
      "./assets/products/carlo-colizza-aquarium-boot.jpg"
    ],
    "status": "available",
    "marketplace": "eBay",
    "source_url": "https://www.ebay.com/usr/olivevintagechicago"
  }
];

function productCard(p) {
  const image = p.images?.[0];
  const price = p.inquire_only ? "Inquire to purchase" : money(p.price);
  const makerLine = [p.maker, p.date_period].filter(Boolean).join(" · ") || "Olive Vintage Gallery";
  return `
    <article class="product-card reveal visible">
      <div class="product-image live-product-image">
        ${image
          ? `<img src="${esc(image)}" alt="${esc(p.title)}" loading="lazy">`
          : `<div class="product-placeholder p1"></div>`}
        ${p.status === "reserved" ? `<span class="product-badge">Reserved</span>` : ""}
      </div>
      <div class="product-info">
        <p class="eyebrow">${esc(p.category || "ART GLASS")}</p>
        <h3>${esc(p.title)}</h3>
        <p>${esc(makerLine)}</p>
        <span>${esc(price)}</span>
        ${p.source_url ? `<a class="product-source" href="${esc(p.source_url)}" target="_blank" rel="noopener">Shop on ${esc(p.marketplace || "eBay")} ↗</a>` : ""}
      </div>
    </article>`;
}

async function loadLiveInventory() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  try {
    const { getGalleryProducts } = await import("./gallery-data.js");
    // Show newest live acquisitions. Public RLS still determines which records are visible.
    const rows = await getGalleryProducts({ status: null, limit: 9 });
    const live = rows.filter(p => ["available","reserved"].includes(p.status));

    if (live.length) {
      grid.innerHTML = live.map(productCard).join("");
    } else {
      grid.innerHTML = STATIC_PRODUCTS.map(productCard).join("");
    }
  } catch (error) {
    console.info("Live inventory is not configured yet; using curated marketplace inventory.", error);
    grid.innerHTML = STATIC_PRODUCTS.map(productCard).join("");
  }
}

loadLiveInventory();
