(() => {
  const mascot = document.getElementById("oliveMascot");
  if (!mascot || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const actions = ["is-peeking", "is-waving", "is-bowing", "is-hopping", "is-inspecting"];
  let actionTimer = 0;
  let lastAction = -1;

  function clearActions() {
    mascot.classList.remove(...actions);
  }

  function chooseAction() {
    clearActions();
    let next = Math.floor(Math.random() * actions.length);
    if (next === lastAction) next = (next + 1) % actions.length;
    lastAction = next;
    mascot.classList.add(actions[next]);
    window.setTimeout(clearActions, actions[next] === "is-peeking" ? 3400 : 2400);
    actionTimer = window.setTimeout(chooseAction, 7000 + Math.random() * 6000);
  }

  function updateVisibility() {
    const shouldShow = window.scrollY > Math.min(520, window.innerHeight * .62);
    mascot.classList.toggle("is-visible", shouldShow);
    if (shouldShow && !actionTimer) actionTimer = window.setTimeout(chooseAction, 1800);
    if (!shouldShow && actionTimer) {
      window.clearTimeout(actionTimer);
      actionTimer = 0;
      clearActions();
    }
  }

  window.addEventListener("scroll", updateVisibility, { passive:true });
  window.addEventListener("resize", updateVisibility, { passive:true });
  updateVisibility();
})();
