let activeProducts = new Map();
let currentProduct = null;
let currentIndex = 0;
let touchStartX = null;

const esc = (s = "") => String(s).replace(/[&<>"']/g, m => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[m]));

function ensureLightbox() {
  let box = document.getElementById("productLightbox");
  if (box) return box;
  box = document.createElement("div");
  box.id = "productLightbox";
  box.className = "product-lightbox";
  box.setAttribute("aria-hidden", "true");
  box.innerHTML = `
    <div class="product-lightbox-backdrop" data-lightbox-close></div>
    <section class="product-lightbox-dialog" role="dialog" aria-modal="true" aria-label="Product photo gallery">
      <div class="product-lightbox-bar">
        <div>
          <p class="eyebrow">PRODUCT GALLERY</p>
          <strong id="lightboxTitle"></strong>
        </div>
        <button class="product-lightbox-close" type="button" data-lightbox-close aria-label="Close photo gallery">×</button>
      </div>
      <div class="product-lightbox-stage" id="lightboxStage">
        <button class="product-lightbox-nav prev" type="button" data-lightbox-prev aria-label="Previous photo">‹</button>
        <img id="lightboxImage" alt="">
        <button class="product-lightbox-nav next" type="button" data-lightbox-next aria-label="Next photo">›</button>
        <span class="product-lightbox-count" id="lightboxCount"></span>
      </div>
      <div class="product-lightbox-thumbs" id="lightboxThumbs" aria-label="Product photo thumbnails"></div>
    </section>`;
  document.body.appendChild(box);

  box.querySelectorAll("[data-lightbox-close]").forEach(el => el.addEventListener("click", closeLightbox));
  box.querySelector("[data-lightbox-prev]").addEventListener("click", () => changePhoto(-1));
  box.querySelector("[data-lightbox-next]").addEventListener("click", () => changePhoto(1));
  const stage = box.querySelector("#lightboxStage");
  stage.addEventListener("touchstart", e => { touchStartX = e.changedTouches?.[0]?.clientX ?? null; }, { passive: true });
  stage.addEventListener("touchend", e => {
    if (touchStartX === null) return;
    const endX = e.changedTouches?.[0]?.clientX ?? touchStartX;
    const delta = endX - touchStartX;
    touchStartX = null;
    if (Math.abs(delta) > 45) changePhoto(delta < 0 ? 1 : -1);
  }, { passive: true });
  document.addEventListener("keydown", e => {
    if (!box.classList.contains("open")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") changePhoto(-1);
    if (e.key === "ArrowRight") changePhoto(1);
  });
  return box;
}

function renderPhoto() {
  const box = ensureLightbox();
  const images = currentProduct?.images || [];
  if (!images.length) return;
  currentIndex = (currentIndex + images.length) % images.length;
  const img = box.querySelector("#lightboxImage");
  img.src = images[currentIndex];
  img.alt = `${currentProduct.title || "Artwork"} — photo ${currentIndex + 1} of ${images.length}`;
  box.querySelector("#lightboxTitle").textContent = currentProduct.title || "Artwork";
  box.querySelector("#lightboxCount").textContent = `${currentIndex + 1} / ${images.length}`;
  const prev = box.querySelector("[data-lightbox-prev]");
  const next = box.querySelector("[data-lightbox-next]");
  prev.hidden = images.length < 2;
  next.hidden = images.length < 2;
  box.querySelectorAll("[data-lightbox-thumb]").forEach((thumb, i) => {
    thumb.classList.toggle("active", i === currentIndex);
    thumb.setAttribute("aria-current", i === currentIndex ? "true" : "false");
  });
}

function changePhoto(delta) {
  if (!currentProduct?.images?.length) return;
  currentIndex += delta;
  renderPhoto();
}

function openLightbox(productId) {
  const product = activeProducts.get(productId);
  if (!product?.images?.length) return;
  currentProduct = product;
  currentIndex = 0;
  const box = ensureLightbox();
  const thumbs = box.querySelector("#lightboxThumbs");
  thumbs.innerHTML = product.images.map((src, i) => `
    <button type="button" class="product-lightbox-thumb" data-lightbox-thumb="${i}" aria-label="View photo ${i + 1}">
      <img src="${esc(src)}" alt="">
    </button>`).join("");
  thumbs.hidden = product.images.length < 2;
  thumbs.querySelectorAll("[data-lightbox-thumb]").forEach(btn => {
    btn.addEventListener("click", () => { currentIndex = Number(btn.dataset.lightboxThumb); renderPhoto(); });
  });
  box.classList.add("open");
  box.setAttribute("aria-hidden", "false");
  document.body.classList.add("lightbox-open");
  renderPhoto();
  box.querySelector(".product-lightbox-close")?.focus();
}

function closeLightbox() {
  const box = ensureLightbox();
  box.classList.remove("open");
  box.setAttribute("aria-hidden", "true");
  document.body.classList.remove("lightbox-open");
  currentProduct = null;
  currentIndex = 0;
}

export function bindProductImageGalleries(products, root = document) {
  activeProducts = new Map((products || []).filter(p => p?.id).map(p => [String(p.id), p]));
  root.querySelectorAll("[data-gallery-product]").forEach(el => {
    el.addEventListener("click", () => openLightbox(el.dataset.galleryProduct));
  });
}
