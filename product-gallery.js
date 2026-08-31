let activeProducts = new Map();
let currentProduct = null;
let currentIndex = 0;
let touchStartX = null;
let rippleFrame = 0;
let rippleToken = 0;
let rippleRunning = false;
let rippleTargetIndex = null;
let queuedIndex = null;

const esc = (s = "") => String(s).replace(/[&<>"']/g, m => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[m]));

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

function ensureRippleStyles() {
  if (document.getElementById("oliveRippleStyles")) return;
  const style = document.createElement("style");
  style.id = "oliveRippleStyles";
  style.textContent = `
    .product-ripple-defs{
      position:absolute!important;
      width:0!important;
      height:0!important;
      overflow:hidden!important;
      pointer-events:none!important;
    }
    .product-lightbox-stage>img.olive-ripple-active{
      filter:url(#oliveProductRipple);
      transform:scale(var(--olive-ripple-scale,1));
      opacity:var(--olive-ripple-opacity,1);
      will-change:filter,transform,opacity;
      transition:none!important;
      backface-visibility:hidden;
      -webkit-backface-visibility:hidden;
    }
    @media (prefers-reduced-motion: reduce){
      .product-lightbox-stage>img.olive-ripple-active{
        filter:none!important;
        transform:none!important;
        transition:opacity .12s linear!important;
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureLightbox() {
  let box = document.getElementById("productLightbox");
  if (box) return box;

  ensureRippleStyles();

  box = document.createElement("div");
  box.id = "productLightbox";
  box.className = "product-lightbox";
  box.setAttribute("aria-hidden", "true");
  box.innerHTML = `
    <svg class="product-ripple-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter id="oliveProductRipple" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
          <feTurbulence id="oliveRippleNoise" type="fractalNoise" baseFrequency="0.009 0.032" numOctaves="1" seed="11" result="noise"/>
          <feDisplacementMap id="oliveRippleMap" in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </defs>
    </svg>
    <div class="product-lightbox-backdrop" data-lightbox-close></div>
    <section class="product-lightbox-dialog" role="dialog" aria-modal="true" aria-label="Product photo gallery">
      <div class="product-lightbox-bar">
        <div class="product-lightbox-heading">
          <p class="eyebrow">PRODUCT GALLERY</p>
          <div class="product-lightbox-title-row">
            <strong id="lightboxTitle"></strong>
            <span class="product-lightbox-count" id="lightboxCount" aria-live="polite"></span>
          </div>
        </div>
        <button class="product-lightbox-close" type="button" data-lightbox-close aria-label="Close photo gallery">×</button>
      </div>
      <div class="product-lightbox-stage" id="lightboxStage">
        <button class="product-lightbox-nav prev" type="button" data-lightbox-prev aria-label="Previous photo">‹</button>
        <img id="lightboxImage" alt="">
        <button class="product-lightbox-nav next" type="button" data-lightbox-next aria-label="Next photo">›</button>
      </div>
      <div class="product-lightbox-thumbs" id="lightboxThumbs" aria-label="Product photo thumbnails"></div>
    </section>`;
  document.body.appendChild(box);

  box.querySelectorAll("[data-lightbox-close]").forEach(el => el.addEventListener("click", closeLightbox));
  box.querySelector("[data-lightbox-prev]").addEventListener("click", () => changePhoto(-1));
  box.querySelector("[data-lightbox-next]").addEventListener("click", () => changePhoto(1));

  const stage = box.querySelector("#lightboxStage");
  stage.addEventListener("touchstart", e => {
    touchStartX = e.changedTouches?.[0]?.clientX ?? null;
  }, { passive: true });
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

function normalizeIndex(index, length) {
  return ((index % length) + length) % length;
}

function updateLightboxChrome() {
  const box = ensureLightbox();
  const images = currentProduct?.images || [];
  if (!images.length) return;

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

function preloadNeighbors() {
  const images = currentProduct?.images || [];
  if (images.length < 2) return;
  [-1, 1].forEach(offset => {
    const src = images[normalizeIndex(currentIndex + offset, images.length)];
    const preload = new Image();
    preload.decoding = "async";
    preload.src = src;
  });
}

function renderPhoto() {
  const box = ensureLightbox();
  const images = currentProduct?.images || [];
  if (!images.length) return;

  currentIndex = normalizeIndex(currentIndex, images.length);
  const img = box.querySelector("#lightboxImage");
  img.src = images[currentIndex];
  img.alt = `${currentProduct.title || "Artwork"} — photo ${currentIndex + 1} of ${images.length}`;

  updateLightboxChrome();
  preloadNeighbors();
}

function resetRippleVisuals() {
  cancelAnimationFrame(rippleFrame);
  rippleFrame = 0;

  const box = document.getElementById("productLightbox");
  if (!box) return;

  const img = box.querySelector("#lightboxImage");
  const map = box.querySelector("#oliveRippleMap");
  const noise = box.querySelector("#oliveRippleNoise");

  img?.classList.remove("olive-ripple-active");
  img?.style.removeProperty("--olive-ripple-scale");
  img?.style.removeProperty("--olive-ripple-opacity");
  map?.setAttribute("scale", "0");
  noise?.setAttribute("baseFrequency", "0.009 0.032");
}

function transitionToPhoto(index) {
  const images = currentProduct?.images || [];
  if (!images.length) return;

  const nextIndex = normalizeIndex(index, images.length);
  if (nextIndex === currentIndex && !rippleRunning) return;

  if (prefersReducedMotion()) {
    currentIndex = nextIndex;
    renderPhoto();
    return;
  }

  if (rippleRunning) {
    queuedIndex = nextIndex;
    rippleTargetIndex = nextIndex;
    return;
  }

  const box = ensureLightbox();
  const img = box.querySelector("#lightboxImage");
  const map = box.querySelector("#oliveRippleMap");
  const noise = box.querySelector("#oliveRippleNoise");
  if (!img || !map || !noise) {
    currentIndex = nextIndex;
    renderPhoto();
    return;
  }

  const productAtStart = currentProduct;
  const targetSrc = images[nextIndex];
  const targetAlt = `${currentProduct.title || "Artwork"} — photo ${nextIndex + 1} of ${images.length}`;
  const preload = new Image();
  preload.decoding = "async";
  preload.src = targetSrc;

  rippleRunning = true;
  rippleTargetIndex = nextIndex;
  queuedIndex = null;
  const token = ++rippleToken;

  const begin = () => {
    if (token !== rippleToken || currentProduct !== productAtStart || !box.classList.contains("open")) {
      rippleRunning = false;
      rippleTargetIndex = null;
      return;
    }

    const duration = 460;
    const maxDisplacement = 5.25;
    const maxScale = 0.0045;
    const maxFade = 0.085;
    const swapPoint = 0.49;
    let swapped = false;
    const start = performance.now();

    img.classList.add("olive-ripple-active");

    const finish = () => {
      resetRippleVisuals();
      rippleRunning = false;
      rippleTargetIndex = null;

      const nextQueued = queuedIndex;
      queuedIndex = null;
      if (nextQueued !== null && nextQueued !== currentIndex && currentProduct) {
        requestAnimationFrame(() => transitionToPhoto(nextQueued));
      }
    };

    const tick = now => {
      if (token !== rippleToken || currentProduct !== productAtStart || !box.classList.contains("open")) {
        finish();
        return;
      }

      const progress = Math.min((now - start) / duration, 1);
      const envelope = Math.sin(Math.PI * progress);
      const shimmer = Math.sin(progress * Math.PI * 2) * envelope;

      map.setAttribute("scale", String(maxDisplacement * envelope));
      noise.setAttribute(
        "baseFrequency",
        `${(0.009 + 0.0012 * shimmer).toFixed(4)} ${(0.032 + 0.007 * envelope).toFixed(4)}`
      );
      img.style.setProperty("--olive-ripple-scale", String(1 + maxScale * envelope));
      img.style.setProperty("--olive-ripple-opacity", String(1 - maxFade * envelope));

      if (!swapped && progress >= swapPoint) {
        swapped = true;
        currentIndex = nextIndex;
        img.src = targetSrc;
        img.alt = targetAlt;
        updateLightboxChrome();
      }

      if (progress < 1) {
        rippleFrame = requestAnimationFrame(tick);
      } else {
        if (!swapped) {
          currentIndex = nextIndex;
          img.src = targetSrc;
          img.alt = targetAlt;
          updateLightboxChrome();
        }
        preloadNeighbors();
        finish();
      }
    };

    rippleFrame = requestAnimationFrame(tick);
  };

  if (preload.complete) {
    begin();
  } else {
    preload.addEventListener("load", begin, { once: true });
    preload.addEventListener("error", () => {
      if (token !== rippleToken) return;
      rippleRunning = false;
      rippleTargetIndex = null;
      currentIndex = nextIndex;
      renderPhoto();
    }, { once: true });
  }
}

function changePhoto(delta) {
  const images = currentProduct?.images || [];
  if (!images.length) return;
  const baseIndex = rippleTargetIndex ?? currentIndex;
  transitionToPhoto(baseIndex + delta);
}

function openLightbox(productId) {
  const product = activeProducts.get(productId);
  if (!product?.images?.length) return;

  currentProduct = product;
  currentIndex = 0;
  rippleTargetIndex = null;
  queuedIndex = null;
  rippleRunning = false;
  resetRippleVisuals();

  const box = ensureLightbox();
  const thumbs = box.querySelector("#lightboxThumbs");
  thumbs.innerHTML = product.images.map((src, i) => `
    <button type="button" class="product-lightbox-thumb" data-lightbox-thumb="${i}" aria-label="View photo ${i + 1}">
      <img src="${esc(src)}" alt="">
    </button>`).join("");
  thumbs.hidden = product.images.length < 2;

  thumbs.querySelectorAll("[data-lightbox-thumb]").forEach(btn => {
    btn.addEventListener("click", () => transitionToPhoto(Number(btn.dataset.lightboxThumb)));
  });

  box.classList.add("open");
  box.setAttribute("aria-hidden", "false");
  document.body.classList.add("lightbox-open");
  renderPhoto();
  box.querySelector(".product-lightbox-close")?.focus();
}

function closeLightbox() {
  const box = ensureLightbox();
  rippleToken++;
  rippleRunning = false;
  rippleTargetIndex = null;
  queuedIndex = null;
  resetRippleVisuals();

  box.classList.remove("open");
  box.setAttribute("aria-hidden", "true");
  document.body.classList.remove("lightbox-open");
  currentProduct = null;
  currentIndex = 0;
}

export function bindProductImageGalleries(products, root = document) {
  (products || []).filter(p => p?.id).forEach(p => activeProducts.set(String(p.id), p));
  root.querySelectorAll("[data-gallery-product]").forEach(el => {
    el.addEventListener("click", () => openLightbox(el.dataset.galleryProduct));
  });
}
