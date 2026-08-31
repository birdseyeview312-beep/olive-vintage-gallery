(() => {
  const mascot = document.getElementById("oliveMascot");
  const sprite = mascot?.querySelector(".olive-mascot-sprite");
  const bubble = mascot?.querySelector(".olive-mascot-bubble");
  const prop = mascot?.querySelector(".olive-mascot-prop");
  if (!mascot || !sprite || !bubble || !prop || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const FRAME_COUNT = 14;
  const WALK = [0, 1, 2, 3, 4, 5];
  const ACTIONS = {
    wave: { className: "is-waving", frames: [6, 7, 6, 7, 6], speed: 235 },
    bow: { className: "is-bowing", frames: [8, 9, 9, 8], speed: 330 },
    hop: { className: "is-hopping", frames: [10, 11, 10], speed: 270, hop: true },
    peek: { className: "is-peeking", frames: [12, 12, 12], speed: 480 },
    inspect: { className: "is-inspecting", frames: [13, 13, 13, 13], speed: 420 }
  };
  const compliments = ["Exceptional craftsmanship.", "A remarkable piece.", "Look at that color.", "Beautifully chosen."];
  const categoryReplies = ["A fine choice.", "This way, please.", "An excellent collection."];
  const props = ["🔍", "🧤", "📋", "✨"];
  const queue = [];
  const seenSections = new Set();
  let visible = false;
  let busy = false;
  let timer = 0;
  let inactivityTimer = 0;
  let bubbleTimer = 0;
  let propTimer = 0;
  let x = Math.max(8, window.innerWidth - mascot.offsetWidth - 20);
  let lastIdle = -1;

  const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const clampX = value => Math.max(8, Math.min(value, window.innerWidth - mascot.offsetWidth - 8));

  function setFrame(frame) {
    sprite.style.backgroundPosition = `${(frame / (FRAME_COUNT - 1)) * 100}% 0`;
    sprite.style.setProperty("--mascot-clip-right", frame < 12 ? "14%" : "0%");
  }

  function setPosition(nextX, y = 0) {
    x = clampX(nextX);
    mascot.classList.toggle("bubble-left", x < window.innerWidth / 2);
    mascot.style.setProperty("--mascot-x", `${Math.round(x)}px`);
    mascot.style.setProperty("--mascot-y", `${Math.round(y)}px`);
  }

  function clearActionClasses() {
    mascot.classList.remove("is-walking", "is-waving", "is-bowing", "is-hopping", "is-peeking", "is-inspecting", "is-tripping", "is-straightening", "is-sleeping", "is-celebrating");
  }

  function say(message, duration = 2300) {
    window.clearTimeout(bubbleTimer);
    bubble.textContent = message;
    mascot.classList.add("has-message");
    bubbleTimer = window.setTimeout(() => mascot.classList.remove("has-message"), duration);
  }

  function holdProp(item, duration = 2300) {
    window.clearTimeout(propTimer);
    prop.textContent = item;
    mascot.classList.add("has-prop");
    propTimer = window.setTimeout(() => mascot.classList.remove("has-prop"), duration);
  }

  async function playFrames(frames, speed, hop) {
    for (let i = 0; i < frames.length && visible; i += 1) {
      setFrame(frames[i]);
      if (hop) setPosition(x, i === 1 ? -28 : 0);
      await wait(speed);
    }
    setPosition(x, 0);
  }

  async function action(name) {
    const selected = ACTIONS[name];
    if (!selected) return;
    clearActionClasses();
    mascot.classList.add(selected.className);
    await playFrames(selected.frames, selected.speed, selected.hop);
    clearActionClasses();
    setFrame(0);
  }

  async function walkTo(target) {
    if (!visible) return;
    clearActionClasses();
    mascot.classList.add("is-walking");
    const start = x;
    const distance = clampX(target) - start;
    mascot.style.setProperty("--mascot-facing", distance < 0 ? "1" : "-1");
    const duration = Math.max(900, Math.min(4300, Math.abs(distance) * 8));
    const started = performance.now();
    let previousFrame = -1;
    await new Promise(resolve => {
      function step(now) {
        if (!visible) return resolve();
        const progress = Math.min(1, (now - started) / duration);
        const eased = progress < .5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        setPosition(start + distance * eased);
        const frame = WALK[Math.floor((now - started) / 115) % WALK.length];
        if (frame !== previousFrame) { setFrame(frame); previousFrame = frame; }
        if (progress < 1) requestAnimationFrame(step); else resolve();
      }
      requestAnimationFrame(step);
    });
    mascot.classList.remove("is-walking");
  }

  function nearestVisibleCard() {
    return [...document.querySelectorAll(".product-card")].find(card => {
      const rect = card.getBoundingClientRect();
      return rect.bottom > 80 && rect.top < window.innerHeight - 80;
    });
  }

  async function perform(name, payload = {}) {
    if (name === "welcome") { say("Welcome to the gallery."); await action("wave"); return; }
    if (name === "goodbye") { say("Thank you for visiting."); await action("wave"); return; }
    if (name === "category") { say(pick(categoryReplies)); await action("hop"); return; }
    if (name === "inspect") {
      const card = payload.card || nearestVisibleCard();
      if (card) await walkTo(card.getBoundingClientRect().left - mascot.offsetWidth * .2);
      holdProp("🔍"); say(pick(compliments)); await action("inspect"); return;
    }
    if (name === "prop") { holdProp(pick(props)); say("Gallery duties call."); await action("bow"); return; }
    if (name === "auction") { holdProp("①", 3000); say("Going once…", 2800); mascot.classList.add("is-celebrating"); await action("hop"); return; }
    if (name === "peek") { await walkTo(x < window.innerWidth / 2 ? 8 : window.innerWidth - mascot.offsetWidth - 8); say("Just looking."); await action("peek"); return; }
    if (name === "straighten") { say("There. Just so."); mascot.classList.add("is-straightening"); await action("bow"); return; }
    if (name === "trip") { say("I meant to do that."); clearActionClasses(); mascot.classList.add("is-tripping"); await playFrames([10, 11, 8, 0], 260, false); clearActionClasses(); return; }
    if (name === "sleep") { say("Just resting my eyes…", 3100); clearActionClasses(); mascot.classList.add("is-sleeping"); setFrame(9); await wait(3100); clearActionClasses(); setFrame(0); return; }
    if (name === "tap") {
      const choice = pick(["wave", "bow", "hop", "straighten", "trip"]);
      if (choice === "straighten" || choice === "trip") await perform(choice);
      else { say(choice === "wave" ? "Hello there!" : choice === "hop" ? "You found me!" : "At your service."); await action(choice); }
    }
  }

  function scheduleRoutine() {
    window.clearTimeout(timer);
    if (visible) timer = window.setTimeout(routine, 7500 + Math.random() * 6500);
  }

  async function drainQueue() {
    if (!visible || busy || !queue.length) return;
    window.clearTimeout(timer);
    busy = true;
    const next = queue.shift();
    await perform(next.name, next.payload);
    busy = false;
    if (queue.length) window.setTimeout(drainQueue, 250); else scheduleRoutine();
  }

  function enqueue(name, payload = {}, priority = false) {
    if (!visible || queue.some(item => item.name === name)) return;
    if (queue.length >= 3) queue.pop();
    if (priority) queue.unshift({ name, payload }); else queue.push({ name, payload });
    drainQueue();
  }

  async function routine() {
    if (!visible || busy) return;
    busy = true;
    const margin = window.innerWidth < 720 ? 8 : 18;
    const choices = ["wave", "bow", "hop", "peek", "inspect", "prop", "straighten", "trip"];
    let next = Math.floor(Math.random() * choices.length);
    if (next === lastIdle) next = (next + 1) % choices.length;
    lastIdle = next;
    if (Math.random() < .55) await walkTo(x > window.innerWidth / 2 ? margin : window.innerWidth - mascot.offsetWidth - margin);
    if (visible) await perform(choices[next]);
    busy = false;
    if (queue.length) drainQueue(); else scheduleRoutine();
  }

  function resetInactivity() {
    window.clearTimeout(inactivityTimer);
    inactivityTimer = window.setTimeout(() => enqueue("sleep"), 28000);
  }

  function updateVisibility() {
    const shouldShow = window.scrollY > Math.min(420, window.innerHeight * .5);
    if (shouldShow === visible) return;
    visible = shouldShow;
    mascot.classList.toggle("is-visible", visible);
    if (visible) {
      setPosition(Math.max(8, window.innerWidth - mascot.offsetWidth - 20));
      setFrame(0);
      if (!sessionStorage.getItem("olive-mascot-welcomed")) {
        sessionStorage.setItem("olive-mascot-welcomed", "true");
        window.setTimeout(() => enqueue("welcome", {}, true), 500);
      } else scheduleRoutine();
      resetInactivity();
    } else {
      window.clearTimeout(timer);
      window.clearTimeout(inactivityTimer);
      queue.length = 0;
      clearActionClasses();
    }
  }

  mascot.addEventListener("click", event => { event.stopPropagation(); resetInactivity(); enqueue("tap", {}, true); });
  mascot.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault(); resetInactivity(); enqueue("tap", {}, true);
  });
  document.addEventListener("click", event => {
    resetInactivity();
    const category = event.target.closest("[data-home-category], [data-category-filter]");
    if (category) enqueue("category", { label: category.querySelector("strong")?.textContent?.trim() || category.textContent.trim() });
    const card = event.target.closest(".product-card");
    if (card) enqueue("inspect", { card });
  });
  ["scroll", "pointermove", "keydown"].forEach(type => window.addEventListener(type, resetInactivity, { passive: true }));
  window.addEventListener("scroll", updateVisibility, { passive: true });
  window.addEventListener("resize", () => setPosition(Math.min(x, window.innerWidth - mascot.offsetWidth - 8)), { passive: true });

  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!visible || !entry.isIntersecting || entry.intersectionRatio < .35 || seenSections.has(entry.target)) return;
    seenSections.add(entry.target);
    enqueue(entry.target.matches("footer") ? "goodbye" : "auction");
  }), { threshold: [.35] });
  const auction = document.getElementById("live-auctions");
  const footer = document.querySelector("footer");
  if (auction) observer.observe(auction);
  if (footer) observer.observe(footer);
  updateVisibility();
})();
