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
  const compliments = ["Exceptional craftsmanship.", "A remarkable piece.", "Look at that color.", "Beautifully chosen.", "I have excellent taste. Obviously.", "Very fancy. I approve."];
  const categoryReplies = ["A fine choice.", "This way, please.", "Excellent choice. I helped.", "Ah yes, my favorite. Again."];
  const comedyReplies = ["Act natural. The art is watching.", "No touching. That includes me.", "I call this professional wandering.", "Do I work here? Apparently.", "Very distinguished. Mostly.", "I meant to look busy."];
  const tapReplies = ["You rang?", "Oh! A visitor!", "I was posing.", "That tickles the garnish.", "At your service. Probably."];
  const props = ["🔍", "🧤", "📋", "✨"];
  const queue = [];
  const seenSections = new Set();
  let visible = false;
  let busy = false;
  let timer = 0;
  let bubbleTimer = 0;
  let propTimer = 0;
  let x = Math.max(8, window.innerWidth - mascot.offsetWidth - 20);
  let y = 0;
  let lastIdle = -1;

  const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const clampX = value => Math.max(8, Math.min(value, window.innerWidth - mascot.offsetWidth - 8));

  function setFrame(frame) {
    sprite.style.backgroundPosition = `${(frame / (FRAME_COUNT - 1)) * 100}% 0`;
    sprite.style.setProperty("--mascot-clip-right", frame < 12 ? "14%" : "0%");
  }

  function setPosition(nextX, nextY = 0) {
    x = clampX(nextX);
    y = nextY;
    mascot.classList.toggle("bubble-left", x < window.innerWidth / 2);
    mascot.style.setProperty("--mascot-x", `${Math.round(x)}px`);
    mascot.style.setProperty("--mascot-y", `${Math.round(y)}px`);
  }

  function clearActionClasses() {
    mascot.classList.remove("is-walking", "is-climbing", "is-waving", "is-bowing", "is-hopping", "is-peeking", "is-inspecting", "is-tripping", "is-straightening", "is-sleeping", "is-celebrating");
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
    const restingY = y;
    for (let i = 0; i < frames.length && visible; i += 1) {
      setFrame(frames[i]);
      if (hop) setPosition(x, i === 1 ? restingY - 28 : restingY);
      await wait(speed);
    }
    setPosition(x, restingY);
  }

  async function moveVertical(targetY, duration = 1600) {
    const startY = y;
    const started = performance.now();
    await new Promise(resolve => {
      function step(now) {
        if (!visible) return resolve();
        const progress = Math.min(1, (now - started) / duration);
        const eased = .5 - Math.cos(progress * Math.PI) / 2;
        setPosition(x, startY + (targetY - startY) * eased);
        setFrame(WALK[Math.floor((now - started) / 190) % WALK.length]);
        if (progress < 1) requestAnimationFrame(step); else resolve();
      }
      requestAnimationFrame(step);
    });
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
    const duration = Math.max(1350, Math.min(7400, Math.abs(distance) * 12));
    const started = performance.now();
    let previousFrame = -1;
    await new Promise(resolve => {
      function step(now) {
        if (!visible) return resolve();
        const progress = Math.min(1, (now - started) / duration);
        const eased = progress < .1
          ? 5 * progress * progress
          : progress > .9
            ? 1 - 5 * Math.pow(1 - progress, 2)
            : .05 + (progress - .1) * 1.125;
        setPosition(start + distance * eased);
        const frame = WALK[Math.floor((now - started) / 210) % WALK.length];
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
    if (name === "comedy") { holdProp(pick(props)); say(pick(comedyReplies), 2800); await action(pick(["bow", "hop", "peek"])); return; }
    if (name === "climb") {
      await walkTo(x < window.innerWidth / 2 ? 8 : window.innerWidth - mascot.offsetWidth - 8);
      clearActionClasses(); mascot.classList.add("is-climbing");
      await moveVertical(-Math.min(270, window.innerHeight * .34), 1900);
      say("A better view from up here."); await action("peek"); await wait(500);
      mascot.classList.add("is-climbing"); await moveVertical(0, 1500); clearActionClasses(); return;
    }
    if (name === "perch") {
      await walkTo(x < window.innerWidth / 2 ? 8 : window.innerWidth - mascot.offsetWidth - 8);
      await moveVertical(-Math.min(165, window.innerHeight * .22), 1100);
      say("I shall supervise from here."); await action("bow"); await wait(650); await moveVertical(0, 1000); return;
    }
    if (name === "popout") {
      await walkTo(x < window.innerWidth / 2 ? 8 : window.innerWidth - mascot.offsetWidth - 8);
      say("Be right back."); await moveVertical(mascot.offsetHeight * .82, 750); await wait(550);
      await moveVertical(0, 650); say("Miss me?"); await action("hop"); return;
    }
    if (name === "auction") { holdProp("①", 3000); say("Going once…", 2800); mascot.classList.add("is-celebrating"); await action("hop"); return; }
    if (name === "peek") { await walkTo(x < window.innerWidth / 2 ? 8 : window.innerWidth - mascot.offsetWidth - 8); say("Just looking."); await action("peek"); return; }
    if (name === "straighten") { say("There. Just so."); mascot.classList.add("is-straightening"); await action("bow"); return; }
    if (name === "trip") { say("I meant to do that."); clearActionClasses(); mascot.classList.add("is-tripping"); await playFrames([10, 11, 8, 0], 260, false); clearActionClasses(); return; }
    if (name === "sleep") { say("Just resting my eyes…", 3100); clearActionClasses(); mascot.classList.add("is-sleeping"); setFrame(9); await wait(3100); clearActionClasses(); setFrame(0); return; }
    if (name === "tap") {
      const choice = pick(["wave", "bow", "hop", "straighten", "trip"]);
      if (choice === "straighten" || choice === "trip") await perform(choice);
      else { say(pick(tapReplies)); await action(choice); }
    }
  }

  function scheduleRoutine() {
    window.clearTimeout(timer);
    if (visible) timer = window.setTimeout(routine, 450 + Math.random() * 650);
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
    const choices = ["wave", "bow", "hop", "peek", "inspect", "prop", "straighten", "trip", "comedy", "comedy", "climb", "perch", "popout"];
    let next = Math.floor(Math.random() * choices.length);
    if (next === lastIdle) next = (next + 1) % choices.length;
    lastIdle = next;
    await walkTo(x > window.innerWidth / 2 ? margin : window.innerWidth - mascot.offsetWidth - margin);
    if (visible) await perform(choices[next]);
    busy = false;
    if (queue.length) drainQueue(); else scheduleRoutine();
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
    } else {
      window.clearTimeout(timer);
      queue.length = 0;
      clearActionClasses();
    }
  }

  mascot.addEventListener("click", event => { event.stopPropagation(); enqueue("tap", {}, true); });
  mascot.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault(); enqueue("tap", {}, true);
  });
  document.addEventListener("click", event => {
    const category = event.target.closest("[data-home-category], [data-category-filter]");
    if (category) enqueue("category", { label: category.querySelector("strong")?.textContent?.trim() || category.textContent.trim() });
    const card = event.target.closest(".product-card");
    if (card) enqueue("inspect", { card });
  });
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
