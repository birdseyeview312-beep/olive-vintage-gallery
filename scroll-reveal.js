(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = window.matchMedia("(max-width: 700px)");
  const tracked = new WeakSet();
  let observer = null;
  let mutationFrame = 0;

  const excluded = [
    ".product-lightbox",
    ".checkout-notice",
    ".intro",
    ".site-header",
    ".nav",
    ".pvr-shell"
  ].join(",");

  const rules = [
    // Homepage: keep the existing opening hero untouched, then alternate editorial blocks.
    [".manifesto-copy", "left"],
    [".curatorial-rail", "right"],
    ["#collection .section-head", "left"],
    [".category-card", "alternate"],
    [".signature-image", "left"],
    [".signature-copy", "right"],
    ["#new .section-head", "right"],
    ["#productGrid .product-card", "alternate"],
    [".live-auction-promo-copy", "left"],
    [".live-auction-promo-card", "right"],
    [".story-grid > :first-child", "left"],
    [".story-body", "right"],
    [".contact-inner", "left"],

    // Full Collection.
    [".collection-page-head > :first-child", "left"],
    [".collection-page-head > p", "right"],
    ["#collectionGrid .product-card", "alternate"],

    // Live Auctions.
    [".auction-hero-copy", "left"],
    [".auction-hero-status", "right"],
    [".auction-room-head", "left"],
    [".auction-empty-state", "right"],
    [".auction-experience .stream-panel", "left"],
    [".auction-experience .current-lot-panel", "right"],
    [".auction-account .section-head", "left"],
    [".bidder-card", "alternate"],
    [".auction-catalog .section-head", "right"],
    [".lot-grid > *", "alternate"],
    [".auction-how > .section-number", "left"],
    [".auction-how > :last-child", "right"],
    [".auction-steps article", "alternate"],

    // Private Viewing.
    [".pv-hero-copy", "left"],
    [".pv-hero-art", "right"],
    [".pv-section-head > :first-child", "left"],
    [".pv-section-head > p", "right"],
    [".pv-feature-grid article", "alternate"],
    [".pv-request-copy", "left"],
    [".pv-request-form", "right"],
    [".pv-private-note > img", "left"],
    [".pv-private-note > div", "right"]
  ];

  function directionFor(mode, index) {
    if (mode === "alternate") return index % 2 === 0 ? "left" : "right";
    return mode;
  }

  function revealImmediately(el) {
    el.classList.add("ovg-scroll-reveal", "ovg-in-view");
    el.dataset.ovgReveal = el.dataset.ovgReveal || "left";
    el.style.removeProperty("--ovg-reveal-delay");
  }

  function register(el, direction, delayIndex = 0) {
    if (!el || tracked.has(el)) return;
    if (el.matches(excluded) || el.closest(excluded)) return;
    tracked.add(el);

    el.classList.add("ovg-scroll-reveal");
    el.dataset.ovgReveal = direction;
    const delay = Math.min(delayIndex * (mobile.matches ? 42 : 62), mobile.matches ? 126 : 248);
    el.style.setProperty("--ovg-reveal-delay", `${delay}ms`);

    if (reduceMotion.matches || !observer) {
      revealImmediately(el);
      return;
    }
    observer.observe(el);
  }

  function scan() {
    rules.forEach(([selector, mode]) => {
      document.querySelectorAll(selector).forEach((el, index) => {
        register(el, directionFor(mode, index), mode === "alternate" ? index % 5 : 0);
      });
    });
  }

  function buildObserver() {
    if (observer) observer.disconnect();
    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      observer = null;
      scan();
      return;
    }

    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        requestAnimationFrame(() => el.classList.add("ovg-in-view"));
        observer.unobserve(el);
      });
    }, {
      threshold: mobile.matches ? 0.06 : 0.13,
      rootMargin: mobile.matches ? "0px 0px -3% 0px" : "0px 0px -8% 0px"
    });

    document.querySelectorAll(".ovg-scroll-reveal:not(.ovg-in-view)").forEach(el => observer.observe(el));
  }

  function scheduleScan() {
    cancelAnimationFrame(mutationFrame);
    mutationFrame = requestAnimationFrame(scan);
  }

  function start() {
    buildObserver();
    scan();

    const root = document.querySelector("main") || document.body;
    const mo = new MutationObserver(scheduleScan);
    mo.observe(root, { childList: true, subtree: true });

    reduceMotion.addEventListener?.("change", () => {
      if (reduceMotion.matches) {
        document.querySelectorAll(".ovg-scroll-reveal").forEach(revealImmediately);
        observer?.disconnect();
        observer = null;
      } else {
        buildObserver();
      }
    });

    mobile.addEventListener?.("change", buildObserver);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
