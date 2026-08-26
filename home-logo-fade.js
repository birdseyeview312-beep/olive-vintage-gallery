(() => {
  "use strict";

  /* Add a second collection link below the homepage listings */
  const productGrid = document.getElementById("productGrid");
  if (productGrid && !document.querySelector(".home-show-all-listings")) {
    const wrap = document.createElement("div");
    wrap.className = "home-show-all-listings";
    wrap.style.cssText = "display:flex;justify-content:center;margin-top:40px;";
    wrap.innerHTML = '<a class="button text" href="./collection.html">Show all listings</a>';
    productGrid.insertAdjacentElement("afterend", wrap);
  }

  /* Existing homepage Olive watermark fade */
  const mark = document.querySelector(".home-olive-watermark");
  if (!mark) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let raf = 0;

  function update() {
    raf = 0;
    const distance = Math.min(280, Math.max(0, window.scrollY));
    const progress = Math.min(1, distance / 280);
    mark.style.setProperty("--home-logo-progress", progress.toFixed(4));

    if (progress >= 0.985) {
      mark.style.visibility = "hidden";
    } else {
      mark.style.visibility = "visible";
    }
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(update);
  }

  update();
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule, { passive: true });

  reduceMotion.addEventListener?.("change", update);
})();
