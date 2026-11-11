// The live view of Ducter's browser (D151, D154, D190): the page as the browser on that computer
// paints it. Three ways in, one view:
//   - a sign-in card (去登录 / Sign in) and 试一下 / Try it: the user's turn from the start;
//   - 看它上网 / Watch it browse (a task's tab, from the device card or the opened task): the
//     task's turn, with a calm line of what it is doing; 换我来 / My turn makes it the user's
//     (the task waits, blind), 还给它 / Hand it back gives it back.
// In the user's turn taps, drags-as-scroll, keys and IME text go straight in. Nothing here is
// kept: frames are shown and dropped, and an out-of-sight view asks for none.
import type { LiveDoing, LiveKey } from "@ducter/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn } from "./controls.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** The size the page is shown at in the live view (CSS pixels): this screen, less the two bars. */
export const liveSize = () => ({ width: Math.min(innerWidth, 1280), height: Math.max(360, Math.min(innerHeight, 1600) - 128), scale: devicePixelRatio || 1 });

/** A closed eye: what it can't see while it's your turn. */
export const EyeShut = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M2 6.5c1.6 2 3.6 3 6 3s4.4-1 6-3M4.2 8.9 3 10.6M8 9.6v2M11.8 8.9l1.2 1.7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
  </svg>
);
const Chevron = ({ flip }: { flip?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={flip ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M11 4L6 9l5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
const Keys = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <rect x="1.5" y="4.5" width="15" height="9.5" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.6" />
    <path d="M4.5 7.5h1M8.5 7.5h1M12.5 7.5h1M5.5 11h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  </svg>
);

/** Whose browser it is: what the server said when it opened, else (still opening) the home's. */
export function liveDevice(lv: NonNullable<typeof A.live>): string {
  return lv.browser?.device || A.homeName || t("live.where");
}

/** How long the line keeps a step before it goes quiet (silence means it's thinking or done). */
const DOING_MS = 6_000;

/** D190: what the task is doing, in a few calm words. */
export function doingWords(d: LiveDoing): string {
  switch (d.kind) {
    case "open":
      return d.host ? t("live.doing.open", d.host) : t("live.doing.read");
    case "click":
      return d.label ? t("live.doing.click", d.label) : t("live.doing.click.0");
    case "type":
      return d.label ? t("live.doing.type", d.label) : t("live.doing.type.0");
    case "press":
      return t("live.doing.press", d.key ?? "");
    default:
      return t(`live.doing.${d.kind}`);
  }
}

/** An address as typed: a bare host gets https://; only http(s) pages open (the home checks again). */
export function typedUrl(raw: string): string | undefined {
  let s = raw.trim();
  if (!s) return undefined;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

const SPECIAL: Record<string, LiveKey> = {
  Enter: "Enter", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Escape: "Escape", ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
};

const hostOf = (url: string | undefined, fallback: string) => {
  try {
    return new URL(url ?? "").hostname.replace(/^www\./, "") || fallback;
  } catch {
    return fallback;
  }
};

export function LiveView() {
  const lv = A.live;
  const img = useRef<HTMLImageElement>(null);
  const keys = useRef<HTMLInputElement>(null);
  const addr = useRef<HTMLInputElement>(null);
  const touch = useRef<{ x: number; y: number; lastY: number; moved: boolean } | undefined>(undefined);
  const composing = useRef(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);
  const touchedAt = useRef(0);
  const [editing, setEditing] = useState(false);
  /** D190: watching on a small screen, a double tap zooms into the page (2.5×) and pans; again, back. */
  const [zoom, setZoom] = useState(1);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!lv) return;
    // D190: out of sight, no frames (a phone in a pocket spends nothing); back, they come again.
    const onVis = () => A.livePause(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [!!lv]);
  // The page area's real size (it changes with the turn's band, rotation, a fold, the window): in the
  // user's turn the page takes it; watching, frames are made for it (sharper when zoomed in).
  useEffect(() => {
    const el = pageRef.current;
    if (!lv || !el || typeof ResizeObserver !== "function") return;
    let last = "";
    const send = () => {
      const w = Math.round(el.clientWidth * zoom), h = Math.round(el.clientHeight * zoom);
      const k = `${w}x${h}`;
      if (w < 50 || h < 50 || k === last) return;
      last = k;
      A.liveInput({ kind: "resize", width: w, height: h, scale: devicePixelRatio || 1 });
    };
    const ro = new ResizeObserver(send);
    ro.observe(el);
    send();
    return () => ro.disconnect();
  }, [!!lv, lv?.id, zoom]);
  useEffect(() => {
    if (lv?.turn === "you") setZoom(1);
  }, [lv?.turn]);
  // The step line goes quiet DOING_MS after the last step.
  useEffect(() => {
    if (!lv?.doingAt) return;
    const left = lv.doingAt + DOING_MS - Date.now();
    if (left <= 0) return;
    const id = setTimeout(() => tick((n) => n + 1), left + 30);
    return () => clearTimeout(id);
  }, [lv?.doingAt]);
  useEffect(() => {
    if (editing) addr.current?.focus(), addr.current?.select();
  }, [editing]);
  // IME text (Chinese, Japanese…) goes in once, as committed. Listened for directly: Preact's
  // onCompositionStart becomes a "CompositionStart" event (no oncompositionstart on inputs), which
  // never fires, so pinyin letters went in before the words (found by the D190 headless check).
  useEffect(() => {
    const el = keys.current;
    if (!el) return;
    const start = () => (composing.current = true);
    const end = () => {
      composing.current = false;
      if (el.value) A.liveInput({ kind: "text", text: el.value });
      el.value = "";
    };
    el.addEventListener("compositionstart", start);
    el.addEventListener("compositionend", end);
    return () => (el.removeEventListener("compositionstart", start), el.removeEventListener("compositionend", end));
  }, [!!lv]);
  if (!lv) return null;

  const mine = lv.turn === "you" ? lv.here !== false : !lv.watch; // a sign-in or Try it is the user's from the start
  const yours = lv.turn === "you" || !lv.watch;
  const elsewhere = lv.watch && lv.turn === "you" && lv.here === false;
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const host = hostOf(lv.url, lv.site || lv.task?.title || "");
  const doing = lv.watch && !yours && lv.doing && lv.doingAt && Date.now() - lv.doingAt < DOING_MS ? lv.doing : undefined;
  const label = lv.watch ? t("live.watch.title") : lv.try ? t("web.try") : t("signin.title", lv.site);

  const at = (e: { clientX: number; clientY: number }) => {
    const r = img.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const focusKeys = () => mine && keys.current?.focus({ preventScroll: true });
  const zoomAt = (e: { clientX: number; clientY: number }) => {
    const pg = pageRef.current;
    if (!pg || !img.current) return;
    const p = at(e);
    const next = zoom > 1 ? 1 : 2.5;
    setZoom(next);
    if (next > 1)
      requestAnimationFrame(() => {
        const el = img.current;
        if (!el) return;
        pg.scrollLeft = p.x * el.clientWidth - pg.clientWidth / 2;
        pg.scrollTop = p.y * el.clientHeight - pg.clientHeight / 2;
      });
  };
  const go = (raw: string) => {
    const u = typedUrl(raw);
    if (!u) return A.toast(t("live.badurl"));
    A.liveInput({ kind: "go", url: u });
    setEditing(false);
  };

  // The small line under the address: whose tab it is (a watch), or whose browser and whose turn.
  const sub = (() => {
    if (lv.try && lv.browser) return <span>{t("live.try.where", liveDevice(lv), `${lv.browser.name}${lv.browser.version ? ` ${lv.browser.version.split(".")[0]}` : ""}`)}</span>;
    if (lv.watch)
      return (
        <>
          <span class="live-task">{lv.task?.title ?? t("live.where")}</span>
        </>
      );
    return (
      <>
        <EyeShut />
        <span>{`${t("live.where")} · ${t("live.blind")}`}</span>
      </>
    );
  })();

  // Where the task just clicked or typed: a soft ring on the page.
  const ring = (() => {
    if (!doing || doing.x == null || doing.y == null || !img.current) return null;
    const el = img.current;
    return <span key={lv.doingAt} class="live-ring" aria-hidden="true" style={{ left: `${el.offsetLeft + doing.x * el.clientWidth}px`, top: `${el.offsetTop + doing.y * el.clientHeight}px` }} />;
  })();

  return (
    <div class={`live${yours && lv.watch && !elsewhere ? " yours" : ""}`} role="dialog" aria-modal="true" aria-label={label}>
      <div class="live-top">
        {mine ? (
          <span class="live-nav">
            <button class="btn text sm" aria-label={t("live.back")} onClick={() => A.liveInput({ kind: "nav", action: "back" })}>
              <Chevron />
            </button>
            {lv.watch && (
              <button class="btn text sm" aria-label={t("live.forward")} onClick={() => A.liveInput({ kind: "nav", action: "forward" })}>
                <Chevron flip />
              </button>
            )}
          </span>
        ) : (
          <span class="live-nav" />
        )}
        <div class="live-where">
          {editing && mine ? (
            <form class="live-addr" onSubmit={(e) => (e.preventDefault(), go(addr.current?.value ?? ""))}>
              <input
                ref={addr}
                type="url"
                inputMode="url"
                enterKeyHint="go"
                aria-label={t("live.address")}
                placeholder={t("live.address.hint")}
                defaultValue={lv.url ?? ""}
                autoComplete="off"
                autoCapitalize="off"
                spellcheck={false}
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => (e.key === "Escape" ? setEditing(false) : e.key === "Enter" && !e.isComposing && (e.preventDefault(), go(e.currentTarget.value)))}
              />
            </form>
          ) : mine ? (
            <button class="live-host as-btn" aria-label={`${t("live.address")}: ${lv.url ?? host}`} onClick={() => setEditing(true)}>
              {host}
            </button>
          ) : (
            <div class="live-host">{host || t("live.where")}</div>
          )}
          <div class="live-sub">{sub}</div>
        </div>
        {mine ? (
          <button class="btn text sm" onClick={() => A.liveInput({ kind: "nav", action: "reload" })}>
            <span class="lbl">{t("live.reload")}</span>
          </button>
        ) : (
          <button class="btn text sm" onClick={() => A.closeLive(false)}>
            <span class="lbl">{t("live.close")}</span>
          </button>
        )}
      </div>
      {/* D190: in the user's turn of a watch, said plainly, once, above the page. */}
      {lv.watch && mine && (
        <div class="live-band" role="status">
          <EyeShut />
          <span>{t("live.yourturn")}</span>
        </div>
      )}
      <div ref={pageRef} class={`live-page${mine ? "" : " watching"}${zoom > 1 ? " zoomed" : ""}`} onClick={focusKeys}>
        {lv.src ? (
          <img
            ref={img}
            src={lv.src}
            alt={lv.title ?? host}
            draggable={false}
            style={zoom > 1 ? { width: `${zoom * 100}%` } : undefined}
            onDblClick={(e) => !mine && Date.now() - touchedAt.current > 800 && zoomAt(e)}
            onLoad={() => lv.seq != null && A.liveShown(lv.seq)}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (!mine) return;
              e.preventDefault();
              if (e.pointerType === "touch") return void (touch.current = { x: e.clientX, y: e.clientY, lastY: e.clientY, moved: false });
              A.liveInput({ kind: "mouse", type: "down", ...at(e), button: e.button === 2 ? "right" : "left" });
              focusKeys();
            }}
            onPointerMove={(e) => {
              if (!mine) return;
              const tc = touch.current;
              if (tc) {
                if (Math.abs(e.clientY - tc.y) > 8 || Math.abs(e.clientX - tc.x) > 8) tc.moved = true;
                if (tc.moved) {
                  const r = img.current!.getBoundingClientRect();
                  const scale = (lv.h ?? r.height) / r.height;
                  A.liveInput({ kind: "wheel", ...at(e), dx: 0, dy: (tc.lastY - e.clientY) * scale });
                  tc.lastY = e.clientY;
                }
                return;
              }
              if (e.buttons) A.liveInput({ kind: "mouse", type: "move", ...at(e) });
            }}
            onPointerUp={(e) => {
              if (!mine) {
                // Watching: a double tap zooms in where it lands (a mouse has dblclick).
                if (e.pointerType !== "touch") return;
                const now = Date.now();
                touchedAt.current = now; // a touch double tap also fires dblclick: zoom once
                if (now - lastTap.current < 320) (lastTap.current = 0), zoomAt(e);
                else lastTap.current = now;
                return;
              }
              const tc = touch.current;
              touch.current = undefined;
              if (tc) {
                if (!tc.moved) {
                  A.liveInput({ kind: "mouse", type: "down", ...at(e) });
                  A.liveInput({ kind: "mouse", type: "up", ...at(e) });
                  focusKeys();
                }
                return;
              }
              A.liveInput({ kind: "mouse", type: "up", ...at(e), button: e.button === 2 ? "right" : "left" });
            }}
            onWheel={(e) => mine && (e.preventDefault(), A.liveInput({ kind: "wheel", ...at(e), dx: e.deltaX, dy: e.deltaY }))}
          />
        ) : (
          <div class="live-wait">
            {lv.stuck ? (
              <>
                <div>{t("live.stuck", liveDevice(lv))}</div>
                <Btn kind="secondary" size="sm" label={t("live.retry")} about={lv.site} onClick={() => A.retryLive()} />
              </>
            ) : lv.watch && lv.state === "open" ? (
              t("live.nopage")
            ) : (
              t("live.opening", lv.site || lv.task?.title || t("live.where"))
            )}
          </div>
        )}
        {ring}
        {/* What you type goes straight to the page, a key or a word at a time; nothing is kept here. */}
        <input
          ref={keys}
          class="live-keys"
          aria-label={t("live.keyboard")}
          autoComplete="off"
          autoCapitalize="off"
          spellcheck={false}
          disabled={!mine}
          onInput={(e) => {
            if (composing.current || (e as unknown as InputEvent).isComposing) return;
            const el = e.currentTarget as HTMLInputElement;
            if (el.value) A.liveInput({ kind: "text", text: el.value });
            el.value = "";
          }}
          onKeyDown={(e) => {
            if (composing.current || e.isComposing) return;
            const k = SPECIAL[e.key];
            if (k) {
              e.preventDefault();
              A.liveInput({ kind: "key", key: k, ...(e.shiftKey ? { shift: true } : {}) });
            }
          }}
        />
      </div>
      <div class="live-bottom">
        {mine && coarse && (
          <button class="btn secondary sm live-kbd" aria-label={t("live.keyboard")} onClick={() => keys.current?.focus()}>
            <Keys />
          </button>
        )}
        {lv.try && <div class="live-note">{t("live.try.note", liveDevice(lv))}</div>}
        {lv.watch && !mine && (
          <div class={`live-doing${doing ? " on" : ""}`} role="status" aria-live="polite">
            {doing ? (
              <>
                <span class="live-pulse" aria-hidden="true" />
                <span>{doingWords(doing)}</span>
              </>
            ) : elsewhere ? (
              <span>{t("live.elsewhere")}</span>
            ) : (
              <span>
                {t("live.where")} · {t("live.on", liveDevice(lv))}
              </span>
            )}
          </div>
        )}
        <div class="btns">
          {lv.watch ? (
            mine ? (
              <Btn kind="primary" label={t("live.handback")} onClick={() => A.liveTurn(false)} />
            ) : (
              <Btn kind="primary" label={t("live.myturn")} onClick={() => A.liveTurn(true)} />
            )
          ) : (
            <>
              {!lv.try && <Btn kind="secondary" label={t("live.notnow")} onClick={() => A.closeLive(false)} />}
              <Btn kind="primary" label={t("live.done")} onClick={() => A.closeLive(true)} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
