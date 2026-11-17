// Every moving part of the page. No libraries: the Web Animations API, CSS transitions and
// IntersectionObserver. Each scene only runs while it is on screen and the tab is visible.
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const CANCEL = Symbol("cancel");

type FaceName = "idle" | "working" | "done" | "needsyou" | "napping";
const faceAlt: Record<FaceName, string> = {
  idle: "Ducter, the clay partner, holding a phone and smiling",
  working: "Ducter reading, busy with a task",
  done: "Ducter beaming: something just finished",
  needsyou: "Ducter raising a little orange flag: something needs you",
  napping: "Ducter napping under a knitted blanket",
};
function setFace(el: HTMLElement | null, face: FaceName) {
  if (!el || el.dataset.face === face) return;
  el.dataset.face = face;
  el.setAttribute("aria-label", faceAlt[face]);
  if (!reduced) {
    el.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.06, 0.94)" }, { transform: "scale(0.98, 1.03)" }, { transform: "scale(1)" }],
      { duration: 460, easing: "ease-out" },
    );
  }
}

/** A scene clock: waits only count while the scene is visible, and a restart cancels the old run. */
function scene(root: HTMLElement, threshold = 0.35) {
  let visible = false;
  let gen = 0;
  const listeners: Array<(v: boolean) => void> = [];
  new IntersectionObserver(
    (es) => {
      for (const e of es) {
        visible = e.isIntersecting;
        listeners.forEach((f) => f(visible));
      }
    },
    { threshold },
  ).observe(root);
  const active = () => visible && !document.hidden;
  return {
    get gen() { return gen; },
    restart() { return ++gen; },
    active,
    onVisible(f: (v: boolean) => void) { listeners.push(f); },
    async wait(ms: number, g: number) {
      let left = ms;
      let last = performance.now();
      while (left > 0) {
        await new Promise((r) => setTimeout(r, Math.min(left, 80)));
        if (g !== gen) throw CANCEL;
        const now = performance.now();
        if (active()) left -= now - last;
        last = now;
      }
    },
    async until(pred: () => boolean, g: number) {
      while (!pred()) {
        await new Promise((r) => setTimeout(r, 80));
        if (g !== gen) throw CANCEL;
      }
    },
  };
}
const quiet = (p: Promise<unknown>) => p.catch((e) => { if (e !== CANCEL) console.error(e); });

/* ---------------------------------------------------------------- nav */
const nav = $("nav");
const onScroll = () => nav.classList.toggle("scrolled", scrollY > 8);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ---------------------------------------------------------------- reveal */
const revealer = new IntersectionObserver(
  (es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("seen"); revealer.unobserve(e.target); } }),
  { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
);
document.querySelectorAll(".reveal").forEach((el) => revealer.observe(el));

/* ---------------------------------------------------------------- devices: the Isles (D81) */
(() => {
  const stage = $("stage");
  if (!stage) return;
  const slot = $("slot");
  const well = slot.querySelector<HTMLElement>(".well")!;
  const sticker = $<HTMLButtonElement>("sticker-web");
  const stickerImg = sticker.querySelector<HTMLElement>("picture")!;
  const btn = $<HTMLButtonElement>("equip");
  const toast = $("toast");
  const toastText = $("toast-text");
  const face = $("stage-face");
  const laptop = $("laptop");
  const small = $("web-small");
  let state: "idle" | "busy" | "done" = "idle";
  let touched = false;
  let ac: AudioContext | null = null;
  let toastTimer = 0;

  const tone = (f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0) => {
    try {
      ac ??= new AudioContext();
      const t = ac.currentTime + delay, o = ac.createOscillator(), gn = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(vol, t + 0.005);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn).connect(ac.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch { /* sound is a garnish */ }
  };

  /** One line at the top of the scene, on its own tag: a result (with a ✓), or what a token says. */
  function say(text: string, ok: boolean, ms = 0) {
    clearTimeout(toastTimer);
    toastText.textContent = text;
    toast.classList.toggle("plain", !ok);
    toast.classList.add("show");
    if (ms) toastTimer = window.setTimeout(() => toast.classList.remove("show"), ms);
  }

  /* --- the AI accounts: tapping one lifts every island where it's signed in --- */
  const tokens = [...stage.querySelectorAll<HTMLButtonElement>(".tok")];
  const names: Record<string, string> = {};
  const islesOf = (acc: string) => new Set(tokens.filter((t) => t.dataset.acc === acc).map((t) => t.dataset.isle!));
  let lit = "";
  function light(acc: string) {
    lit = lit === acc ? "" : acc;
    const on = lit ? islesOf(lit) : new Set<string>();
    stage.querySelectorAll<HTMLElement>(".p[data-isle]").forEach((el) => el.classList.toggle("lift", on.has(el.dataset.isle!)));
    tokens.forEach((t) => t.setAttribute("aria-pressed", String(!!lit && t.dataset.acc === lit)));
    if (!lit) { toast.classList.remove("show"); return; }
    const n = on.size;
    const where = n > 1 ? `${n} devices` : stage.querySelector(`.name[data-isle="${[...on][0]}"] b`)?.textContent?.replace(/^This /, "this ") ?? "this device";
    say(`${names[lit]} is signed in on ${where}`, false);
  }
  for (const t of tokens) {
    names[t.dataset.acc!] = t.querySelector(".mini-tag")!.textContent!;
    t.addEventListener("click", () => { touched = true; light(t.dataset.acc!); });
  }

  /* --- parcels cross cloud-1's bridge: a task really runs there --- */
  const SPEED = 40; // design units a second (theme.go ParcelSpeed)
  const rides = [...stage.querySelectorAll<SVGGElement>(".parcels")].map((g) => ({
    path: g.querySelector<SVGPathElement>(".ride")!,
    parcels: [...g.querySelectorAll<SVGGElement>(".parcel")],
    svg: g.ownerSVGElement!,
  }));
  let raf = 0;
  const tick = (now: number) => {
    for (const r of rides) {
      if (!r.svg.getBoundingClientRect().width) continue;
      let L = 0;
      try { L = r.path.getTotalLength(); } catch { continue; }
      r.parcels.forEach((p, i) => {
        const f = ((now / 1000) * (SPEED / L) + i / 3) % 1;
        const q = r.path.getPointAtLength(Math.min(Math.max(f * L, 10), L - 10));
        p.setAttribute("transform", `translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})`);
      });
    }
    raf = requestAnimationFrame(tick);
  };

  /* --- the equip: the object peels off its card, arcs over, and snaps into the well --- */
  function makeFlyer(from: DOMRect) {
    const fly = document.createElement("div");
    fly.className = "flyer";
    fly.innerHTML = stickerImg.outerHTML;
    Object.assign(fly.style, { left: from.left + "px", top: from.top + "px", width: from.width + "px", height: from.height + "px" });
    document.body.appendChild(fly);
    stickerImg.style.visibility = "hidden";
    return fly;
  }
  const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  // The object in the card has padding round it; the flyer lands on the well's own box.
  const target = () => well.getBoundingClientRect();

  function settle(fly: HTMLElement, sound: boolean) {
    fly.remove();
    stickerImg.style.visibility = "";
    slot.classList.remove("open");
    slot.classList.add("filled");
    slot.setAttribute("aria-label", "Browse the web, added to this Mac");
    slot.setAttribute("aria-disabled", "true");
    sticker.classList.add("used");
    sticker.setAttribute("aria-disabled", "true");
    small.textContent = "On this Mac";
    btn.textContent = "Remove from this Mac";
    state = "done";
    if (lit) light(lit);
    setTimeout(() => {
      say("This Mac can browse the web now", true);
      if (sound) { tone(660, 660, 0.35, "triangle", 0.08); tone(990, 990, 0.4, "triangle", 0.07, 0.09); }
    }, reduced ? 0 : 140);
    setTimeout(() => setFace(face, "working"), 2400);
  }

  function snapFx(sound: boolean) {
    if (sound) tone(900, 220, 0.11, "sine", 0.25);
    try { navigator.vibrate?.(10); } catch { /* not everywhere */ }
    setFace(face, "done");
    if (reduced) return;
    const c = center(target());
    const colors = ["#FF8A3D", "#FFC94D", "#4BA8F0", "#7FD99A"];
    for (let i = 0; i < 14; i++) {
      const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      s.setAttribute("viewBox", "0 0 10 10");
      s.setAttribute("class", "conf");
      s.innerHTML = `<path d="M5 0l1.3 3.4L10 5 6.3 6.6 5 10 3.7 6.6 0 5l3.7-1.6z" fill="${colors[i % 4]}"/>`;
      Object.assign(s.style, { left: c.x - 6 + "px", top: c.y - 6 + "px" });
      document.body.appendChild(s);
      const ang = (i / 14) * Math.PI * 2, d = 50 + Math.random() * 40;
      s.animate(
        [
          { transform: "translate(0,0) rotate(0) scale(1.2)", opacity: 1 },
          { transform: `translate(${Math.cos(ang) * d}px,${Math.sin(ang) * d - 10}px) rotate(${180 + Math.random() * 180}deg) scale(.3)`, opacity: 0 },
        ],
        { duration: 620, easing: "cubic-bezier(.2,.7,.3,1)" },
      ).onfinish = () => s.remove();
    }
    // the device it went onto takes the snap (the equip's squash)
    laptop.animate([{ scale: "1 1" }, { scale: "1.03 0.95" }, { scale: "0.99 1.03" }, { scale: "1 1" }], { duration: 420, easing: "ease-out" });
  }

  function equip(sound: boolean) {
    if (state !== "idle") return;
    state = "busy";
    const a = stickerImg.getBoundingClientRect();
    const b = target();
    const fly = makeFlyer(a);
    const ca = center(a), cb = center(b);
    const dx = cb.x - ca.x, dy = cb.y - ca.y, sc = b.width / a.width;
    const lift = Math.min(160, Math.abs(dx) * 0.35 + 90);
    const frames: Keyframe[] = reduced
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [
          { offset: 0, transform: "perspective(600px) rotateX(0) rotate(0) scale(1)", easing: "cubic-bezier(.2,.8,.3,1)" },
          { offset: 0.14, transform: "perspective(600px) rotateX(26deg) rotate(-9deg) translateY(-20px) scale(1.1)", easing: "cubic-bezier(.3,.1,.3,1)" },
          { offset: 0.5, transform: `translate(${dx * 0.55}px,${dy * 0.55 - lift}px) rotate(7deg) scale(${(1 + sc) / 2})`, easing: "cubic-bezier(.6,0,.9,.4)" },
          { offset: 0.62, transform: `translate(${dx}px,${dy}px) rotate(0) scale(${sc * 0.88})` },
          { offset: 0.69, transform: `translate(${dx}px,${dy}px) scale(${sc * 1.12})`, easing: "cubic-bezier(.34,1.8,.5,1)" },
          { offset: 1, transform: `translate(${dx}px,${dy}px) scale(${sc})` },
        ];
    setTimeout(() => slot.classList.add("open"), reduced ? 0 : 260);
    const anim = fly.animate(frames, { duration: reduced ? 200 : 820, fill: "forwards" });
    setTimeout(() => snapFx(sound), reduced ? 200 : 510);
    anim.onfinish = () => settle(fly, sound);
  }

  function unequip() {
    if (state !== "done") return;
    toast.classList.remove("show");
    slot.classList.remove("filled");
    slot.setAttribute("aria-label", "Browse the web: add it to this Mac");
    slot.removeAttribute("aria-disabled");
    sticker.classList.remove("used");
    sticker.removeAttribute("aria-disabled");
    small.textContent = "Drag onto this Mac, or tap";
    btn.textContent = "Add to this Mac";
    state = "idle";
  }

  btn.addEventListener("click", () => { touched = true; state === "done" ? unequip() : equip(true); });
  slot.addEventListener("click", () => { touched = true; if (state === "idle") equip(true); });
  slot.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && state === "idle") { e.preventDefault(); touched = true; equip(true); } });

  // drag: lift, follow with a little lag, feel the well's pull, snap or spring home
  let drag: null | { id: number; x0: number; y0: number; moved: boolean; fly?: HTMLElement; home?: DOMRect; x: number; y: number; cx: number; cy: number; raf: number } = null;
  sticker.addEventListener("pointerdown", (e) => {
    if (state !== "idle" || e.button !== 0) return;
    touched = true;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, x: e.clientX, y: e.clientY, cx: 0, cy: 0, raf: 0 };
    sticker.setPointerCapture(e.pointerId);
  });
  sticker.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) {
      drag.moved = true;
      state = "busy";
      const home = stickerImg.getBoundingClientRect();
      drag.home = home;
      drag.fly = makeFlyer(home);
      drag.fly.firstElementChild!.animate(
        [{ transform: "perspective(600px) rotateX(0) scale(1)" }, { transform: "perspective(600px) rotateX(22deg) rotate(-7deg) scale(1.12)" }],
        { duration: 180, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" },
      );
      const step = () => {
        if (!drag?.fly || !drag.home) return;
        const h = center(drag.home);
        const wr = target();
        const w = center(wr);
        let tx = drag.x - h.x, ty = drag.y - h.y;
        const near = Math.hypot(drag.x - w.x, drag.y - w.y) < wr.width * 1.1;
        slot.classList.toggle("open", near);
        if (near) { tx += (w.x - drag.x) * 0.45; ty += (w.y - drag.y) * 0.45; }
        drag.cx += (tx - drag.cx) * 0.28;
        drag.cy += (ty - drag.cy) * 0.28;
        drag.fly.style.transform = `translate(${drag.cx}px, ${drag.cy}px)`;
        drag.raf = requestAnimationFrame(step);
      };
      drag.raf = requestAnimationFrame(step);
    }
  });
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.raf);
    if (!d.moved) { equip(true); return; }
    const fly = d.fly!, home = d.home!;
    const w = target();
    const near = slot.classList.contains("open");
    const from = `translate(${d.cx}px, ${d.cy}px)`;
    if (near) {
      const dx = center(w).x - center(home).x, dy = center(w).y - center(home).y, sc = w.width / home.width;
      snapFx(true);
      fly.animate(
        [
          { transform: from },
          { transform: `translate(${dx}px,${dy}px) scale(${sc * 0.88})`, offset: 0.35 },
          { transform: `translate(${dx}px,${dy}px) scale(${sc * 1.12})`, offset: 0.6, easing: "cubic-bezier(.34,1.8,.5,1)" },
          { transform: `translate(${dx}px,${dy}px) scale(${sc})` },
        ],
        { duration: 380, fill: "forwards" },
      ).onfinish = () => settle(fly, true);
    } else {
      slot.classList.remove("open");
      fly.animate([{ transform: from }, { transform: "translate(0,0)" }], { duration: 420, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "forwards" }).onfinish = () => {
        fly.remove();
        stickerImg.style.visibility = "";
        state = "idle";
      };
    }
  };
  sticker.addEventListener("pointerup", end);
  sticker.addEventListener("pointercancel", end);
  sticker.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); touched = true; equip(true); } });
  sticker.addEventListener("click", (e) => e.preventDefault());

  // the parcels move only while the scene is on screen; if nobody plays with it, show the equip once
  const sc = scene(stage, 0.5);
  let shown = false;
  sc.onVisible((v) => {
    cancelAnimationFrame(raf);
    if (v && !reduced && rides.length) raf = requestAnimationFrame(tick);
    if (!v || shown || reduced) return;
    shown = true;
    const g = sc.restart();
    quiet(
      (async () => {
        await sc.wait(2600, g);
        const r = stickerImg.getBoundingClientRect();
        const t = target();
        if (!touched && state === "idle" && r.top > 0 && r.bottom < innerHeight && t.top > 0 && t.bottom < innerHeight) equip(false);
      })(),
    );
  });
})();

/* ---------------------------------------------------------------- final: it wakes up when you arrive */
(() => {
  const f = $("final-face");
  if (!f) return;
  const io = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    io.disconnect();
    setTimeout(() => setFace(f, "idle"), reduced ? 0 : 900);
  }, { threshold: 0.6 });
  io.observe(f);
})();

/* ---------------------------------------------------------------- install tabs + copy */
(() => {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const select = (t: HTMLButtonElement) => {
    tabs.forEach((x) => {
      const on = x === t;
      x.setAttribute("aria-selected", String(on));
      x.tabIndex = on ? 0 : -1;
      document.getElementById(x.getAttribute("aria-controls")!)!.hidden = !on;
    });
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      const n = tabs[(i + d + tabs.length) % tabs.length];
      select(n);
      n.focus();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((b) => {
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy!);
        b.textContent = "Copied";
      } catch {
        b.textContent = "Select and copy";
      }
      setTimeout(() => (b.textContent = "Copy"), 1600);
    });
  });
})();
