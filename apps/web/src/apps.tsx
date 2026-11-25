// D405: 小应用 / Apps (design/apps.md). An app the partner made for the person: its card under the
// partner's words, and its sheet (the whole screen on a phone) running the app in a sandboxed
// iframe with no network: the home composes the document (policy, Pebble's tokens, the bridge),
// this file carries the bridge's messages (a key written goes to the home and every device; an ask
// goes into the conversation and its answer comes back), and a line under the app asks the
// partner to change it. Facts are separate elements (D291), never joined.
import { useEffect, useRef, useState } from "preact/hooks";
import { APP_GLYPH_STROKE, APP_GLYPHS, APP_SANDBOX, appIcon, appState, appShowRef, appTint, type AppCard, type AppIcon, type AppIdea, type AppMeta, type AppOpen, type Bodies, type LogEvent, type ServerFrame } from "@ducter/protocol";
import { A } from "./app.ts";
import { ComposerBox } from "./composer.tsx";
import { Btn } from "./controls.tsx";
import { keepClauses, stamp, when } from "./format.ts";
import { url } from "./media.tsx";
import { Menu, MenuItem, MenuSep } from "./menu.tsx";

/** D407: the draft sheet, set by pile.tsx (imported there, not here: app.ts loads this file early). */
export const appHooks: { showDraft?: (ref: string, back: () => void) => void } = {};

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** What the web holds of the person's apps, and the one open now. */
export const AP = {
  list: [] as AppMeta[],
  /** D410: while there are none, what the person could say for a first one (the home's). */
  ideas: [] as AppIdea[],
  /** D410: the list has come from the home at least once (an empty shelf is really empty). */
  seen: false,
  // first (D410): the partner's line of what it filled in, shown the first time it is opened.
  // focus: the line to change it is focused (the shelf's 「让…改」).
  open: undefined as undefined | { id: string; app?: AppOpen; gone?: boolean; asks: Set<string>; sent: Map<string, string>; frame?: HTMLIFrameElement; changed?: { version: number; note?: string; undone?: boolean }; first?: string; focus?: boolean; undoing?: boolean; home?: boolean },
};

/** The app mark, drawn (never an emoji): a small window with a title bar and two rows. */
export const APP_GLYPH = (size = 22) => (
  <svg class="app-glyph" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
    <rect x="3.5" y="4" width="13" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" />
    <path d="M3.5 7.6h13M6.5 10.6h4M6.5 13h7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  </svg>
);

/**
 * D410, D422: each app's own mark, chosen by what it is about (APP_GLYPHS, shared with the Mac), drawn
 * pressed into its clay: a light edge above, the tint's ledge below, the ink between. Never an emoji.
 */
export function AppIconGlyph({ icon, size = 22, flat }: { icon: AppIcon; size?: number; flat?: boolean }) {
  const d = APP_GLYPHS[icon] ?? APP_GLYPHS.window;
  const p = { d, fill: "none", "stroke-width": APP_GLYPH_STROKE, "stroke-linecap": "round" as const, "stroke-linejoin": "round" as const };
  return (
    <svg class="app-glyph" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      {!flat && <path {...p} class="app-glyph-ledge" transform="translate(0 .7)" />}
      {!flat && <path {...p} class="app-glyph-hi" transform="translate(0 -.45)" />}
      <path {...p} stroke="currentColor" />
    </svg>
  );
}

/** D410: the app's clay tile: its mark on its own tint (the person's muted clays, never a state's colour). */
export function AppFace({ m, size = 48, gone }: { m?: Pick<AppMeta, "id" | "icon" | "tint" | "kind"> & { name?: string; ask?: string }; size?: number; gone?: boolean }) {
  const sm = size < 40;
  return (
    <span class={`app-face${sm ? " sm" : ""}${m && !gone ? ` tinted tint-${appTint(m)}` : ""}`} style={size !== 48 && size !== 34 ? { width: size, height: size, borderRadius: Math.round(size * 0.3) } : undefined}>
      {m ? <AppIconGlyph icon={appIcon(m)} size={Math.round(size * 0.54)} /> : APP_GLYPH(Math.round(size * 0.54))}
    </span>
  );
}

/** D562: a line over a message about an app names it as it is now (its mark, its name after a rename). */
export function appNameNow(a: { id: string; name: string }): string {
  return AP.list.find((m) => m.id === a.id)?.name ?? a.name;
}
export function AppRefGlyph({ id }: { id: string }) {
  const m = AP.list.find((x) => x.id === id);
  return m ? <AppIconGlyph icon={appIcon(m)} size={14} flat /> : APP_GLYPH(14);
}

/** D562: 改回去 / Undo the change; the open app then says it changed back, not that it changed. */
export function undoApp(id: string) {
  if (AP.open?.id === id) AP.open.undoing = true;
  A.send({ t: "app_back", id });
}

const dark = () => {
  const th = document.documentElement.dataset.theme;
  return th ? th === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};

function ask(id: string) {
  A.send({ t: "app_open", id, transport: "message", dark: dark(), lang: A.L.lang });
}

export function openApp(id: string, o: { focus?: boolean; home?: boolean } = {}) {
  const meta = AP.list.find((a) => a.id === id);
  if (AP.open?.id === id && A.sheet?.kind === "app") {
    // Already open (its own 「⋯」): only what was asked for changes.
    if (o.focus) AP.open.focus = true;
    if (o.home) AP.open.home = true;
    return A.changed();
  }
  // D410: the first time it opens, the partner's line of what it already filled in.
  AP.open = { id, asks: new Set(), sent: new Map(), ...(meta && !meta.opened && meta.note ? { first: meta.note } : {}), ...(o.focus ? { focus: true } : {}), ...(o.home ? { home: true } : {}) };
  A.sheet = { kind: "app", id };
  ask(id);
  A.changed();
}

function close() {
  AP.open = undefined;
  A.sheet = null;
  A.changed();
}

const post = (m: object) => {
  const o = AP.open;
  o?.frame?.contentWindow?.postMessage({ ...m, ducterApp: o.id }, "*");
};

/** Frames about apps (app.ts hands them here). True when it was one. */
export function onAppsFrame(f: ServerFrame): boolean {
  if (f.t === "apps") {
    AP.list = f.apps;
    AP.ideas = f.ideas ?? [];
    AP.seen = true;
    const o = AP.open;
    const now = o && f.apps.find((a) => a.id === o.id);
    // The partner changed the open app: it runs again as it is now, with a word of what changed.
    if (o?.app && now && now.version !== o.app.version) {
      o.changed = o.undoing ? { version: now.version, undone: true } : { version: now.version, ...(now.note ? { note: now.note } : {}) };
      o.undoing = false;
      ask(o.id);
    } else if (o?.app && !now) o.gone = true;
    // Opened before the socket was up (a link): ask again now that it is.
    else if (o && !o.app && !o.gone) ask(o.id);
    A.changed();
    return true;
  }
  if (f.t === "app_open") {
    const o = AP.open;
    if (!o || o.id !== f.id) return true;
    o.app = f.app;
    o.gone = !!f.gone;
    A.changed();
    return true;
  }
  if (f.t === "app_data") {
    const o = AP.open;
    if (!o || o.id !== f.id) return true;
    const s = JSON.stringify(f.value ?? null);
    // Its own write coming back: not news to the app.
    if (o.sent.get(f.key) === s) return void o.sent.delete(f.key), true;
    post({ t: "data", key: f.key, value: f.value, by: f.by });
    return true;
  }
  if (f.t === "app_ask_refused") {
    const o = AP.open;
    if (o?.id === f.id && o.asks.delete(f.ref)) post({ t: "refused", ref: f.ref, why: f.why });
    if (f.why === "limit" || f.why === "busy") A.toast(t(`app.ask.${f.why}`));
    return true;
  }
  if (f.t === "events") {
    // An answer to the open app's ask: the app gets the partner's words.
    for (const e of f.events as LogEvent[]) {
      // An outward ask put on a Go card: the app is told it waits for the person's Go.
      const fa = e.kind === "decision" ? (e.body as Bodies["decision"]).forApp : undefined;
      if (fa && AP.open?.id === fa.id && AP.open.asks.delete(fa.ask)) post({ t: "answer", ref: fa.ask, text: t("app.ask.go", A.defaultName() || "Ducter") });
      if (e.kind !== "ai_msg") continue;
      const b = e.body as Bodies["ai_msg"];
      const o = AP.open;
      if (b.appAnswer && o?.id === b.appAnswer.id && o.asks.delete(b.appAnswer.ask)) post({ t: "answer", ref: b.appAnswer.ask, text: b.text });
    }
  }
  return false;
}

/** The bridge: what the open app's frame posts. Only from that frame, only for its id. */
function onMessage(e: MessageEvent) {
  const o = AP.open;
  const m = e.data as { ducterApp?: string; t?: string; key?: string; value?: unknown; text?: string; ref?: string };
  if (!o?.frame || e.source !== o.frame.contentWindow || !m || m.ducterApp !== o.id) return;
  if (m.t === "put" && typeof m.key === "string") {
    o.sent.set(m.key, JSON.stringify(m.value ?? null));
    A.send({ t: "app_put", id: o.id, key: m.key, value: m.value ?? null });
  } else if (m.t === "ask" && typeof m.ref === "string") {
    o.asks.add(m.ref);
    A.send({ t: "app_ask", id: o.id, text: String(m.text ?? ""), ref: m.ref });
  } else if (m.t === "summary") {
    // D410: ducter.summary: the line its shelf tile shows.
    A.send({ t: "app_summary", id: o.id, text: String(m.text ?? "").slice(0, 200) });
  } else if (m.t === "show") {
    // D407: ducter.open({ draft }): that PR's draft sheet over the app; closing it comes back here.
    const ref = appShowRef(m);
    const now = Date.now();
    if (!ref || now - lastShow < 800) return;
    lastShow = now;
    const back = o.id;
    appHooks.showDraft?.(ref, () => openApp(back));
  } else if (m.t === "error" && o.app) {
    // D422: its page threw: the home keeps it on this version, and the tile and the window say so with a fix.
    A.send({ t: "app_error", id: o.id, version: o.app.version, text: String(m.text ?? "").slice(0, 300) });
  }
}
let lastShow = 0;

/** D422: words about one app, said as the person's own (its fix, its new look): the partner answers in the conversation. */
function sayAbout(m: AppMeta, text: string) {
  A.send({ t: "send", text, clientId: `p${Date.now().toString(36)}app`, app: m.id });
}

/** D422: the one thing to do about an app's state, when there is one. */
export function stateAction(m: AppMeta): { label: string; run: () => void } | undefined {
  const partner = A.defaultName() || "Ducter";
  const k = m.live?.kept;
  switch (appState(m)) {
    case "broke":
      return { label: t("app.live.fix", partner), run: () => sayAbout(m, t("app.live.fix.say", m.name, m.live?.broke?.text ?? "")) };
    case "old":
      return { label: t("app.live.renew"), run: () => sayAbout(m, t("app.live.renew.say", m.name)) };
    case "kept_failed":
      return k ? { label: t("app.kept.retry"), run: () => A.send({ t: "ongoing_action", kind: k.of.kind, id: k.of.id, action: "run_now" }) } : undefined;
    case "kept_paused":
      return k ? { label: t("app.kept.resume"), run: () => A.send({ t: "ongoing_action", kind: k.of.kind, id: k.of.id, action: "resume" }) } : undefined;
    default:
      return undefined;
  }
}

/**
 * D422: what an app is doing, in one line of the partner's voice (each fact its own element, D291):
 * being changed, broken, kept current by a task (running, failed, paused, next), the old look; else
 * when it last changed. The tile and the window say the same.
 */
export function StateLine({ m }: { m: AppMeta }) {
  const partner = A.defaultName() || "Ducter";
  const k = m.live?.kept;
  const s = appState(m);
  const words =
    s === "changing" ? t("app.live.changing", partner)
    : s === "broke" ? t("app.live.broke")
    : s === "kept_failed" ? t("app.kept.failed", k!.title)
    : s === "kept_paused" ? t("app.kept.paused", k!.title)
    : s === "kept_running" ? t("app.kept.running", k!.title)
    : s === "old" ? t("app.live.old")
    : s === "kept_next" ? (k!.next ? t("app.kept.next", k!.title, when(A.L, k!.next)) : t("app.kept", k!.title))
    : m.task ? t("app.kept", m.task.title) : ""; // a home from before D422 sends no state: a task still keeps it
  return (
    <span class={`app-state s-${s}`}>
      {s === "changing" && <span class="app-state-track" aria-hidden="true" />}
      {words && <span class="app-state-words">{words}</span>}
      {(s === "plain" || s === "kept_next" || s === "old") && <span class="app-state-when">{t("app.updated", stamp(A.L, k?.last ?? m.updated))}</span>}
    </span>
  );
}

/** D407: the board offer's few words: what goes in it (its own card's body, under the question). */
export function BoardOfferFacts({ b }: { b: NonNullable<Bodies["decision"]["board"]> }) {
  return (
    <div class="board-offer">
      <span class="app-face sm">{APP_GLYPH(18)}</span>
      <span class="board-offer-words">
        <span class="dl">{t("board.offer.what", b.title)}</span>
        {b.kind === "reviews" && <small class="muted">{t("board.offer.reviews")}</small>}
      </span>
    </div>
  );
}

/** The card under the partner's words: the app's mark, its name, what happened, 打开 / Open. */
export function AppCardView({ c }: { c: AppCard }) {
  const now = AP.list.find((a) => a.id === c.id);
  // D410: deleted on the person's word: the card says so, with 撤销 / Undo while it can come back.
  if (c.change === "removed") {
    const back = !!now;
    return (
      <div class={`app-card${back ? "" : " gone"}`} role="group" aria-label={c.name}>
        <AppFace m={now ?? { id: c.id }} gone={!back} />
        <span class="app-body">
          <span class="app-name">{now?.name ?? c.name}</span>
          <span class="app-what">{back ? t("app.made", A.defaultName() || "Ducter") : t("app.removed")}</span>
        </span>
        {back ? (
          <button type="button" class="btn sm app-open" onClick={() => openApp(c.id)}>
            <span class="lbl">{t("app.open")}</span>
          </button>
        ) : (
          <button type="button" class="btn sm app-open" onClick={() => A.send({ t: "app_restore", id: c.id })}>
            <span class="lbl">{t("apps.undo")}</span>
          </button>
        )}
      </div>
    );
  }
  const gone = AP.seen && !now ? true : false;
  return (
    <div class={`app-card${gone ? " gone" : ""}`} role="group" aria-label={c.name}>
      <AppFace m={now ?? { id: c.id }} gone={gone} />
      <span class="app-body">
        <span class="app-name">{now?.name ?? c.name}</span>
        <span class="app-what">{gone ? t("app.gone") : c.change === "made" ? t("app.made", A.defaultName() || "Ducter") : c.change === "data" ? t("app.filled") : t("app.changed")}</span>
      </span>
      {!gone && (
        <button type="button" class="btn sm app-open" onClick={() => openApp(c.id)}>
          <span class="lbl">{t("app.open")}</span>
        </button>
      )}
    </div>
  );
}

/** D410: under "我的小应用在哪": the shelf, one tap away: up to three tiles, how many, 打开「小应用」. */
export function ShelfCard() {
  const list = shelfOrder(AP.list);
  const n = list.length;
  return (
    <div class="app-card shelf-card" role="group" aria-label={t("apps.place")}>
      <span class="shelf-stack" aria-hidden="true">
        {n ? list.slice(0, 3).map((m) => <AppFace key={m.id} m={m} size={34} />) : <AppFace size={34} />}
      </span>
      <span class="app-body">
        <span class="app-name">{t("apps.place")}</span>
        <span class="app-what">{n === 0 ? t("apps.card.none") : n === 1 ? t("apps.card.one") : t("apps.card.n", n)}</span>
      </span>
      <button type="button" class="btn sm app-open" onClick={() => openShelf()}>
        <span class="lbl">{t("apps.card.open")}</span>
      </button>
    </div>
  );
}

/** D410: the shelf's order: pinned first, then the newest change or open. */
export function shelfOrder(list: readonly AppMeta[]): AppMeta[] {
  const at = (m: AppMeta) => Math.max(Date.parse(m.updated), m.opened ? Date.parse(m.opened) : 0);
  return [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || at(b) - at(a));
}

/** D410: 小应用 / Apps, the shelf (apps-shelf.tsx draws it). */
export function openShelf() {
  A.sheet = { kind: "apps" };
  A.send({ t: "apps" });
  A.changed();
}

/**
 * D410: an app's 「⋯」, the same on its tile and in its sheet's head: 改名, 让{name}改…, 改回去,
 * 置顶, 不再让「task」更新它, 删掉 (asked first; its data goes, 撤销 for a while after).
 */
export function AppMenu({ m, rename, close, inSheet }: { m: AppMeta; rename: () => void; close: () => void; inSheet?: boolean }) {
  const partner = A.defaultName() || "Ducter";
  const [asking, setAsking] = useState(false);
  const shut = (fn: () => void) => () => (close(), fn());
  if (asking)
    return (
      <div class="pmenu app-del" role="alertdialog" aria-label={t("apps.del.q", m.name)}>
        <b class="app-del-q">{t("apps.del.q", m.name)}</b>
        <span class="app-del-body">{t("apps.del.body")}</span>
        <span class="app-del-acts">
          <button type="button" class="btn sm secondary" onClick={() => setAsking(false)}>
            <span class="lbl">{t("apps.del.no")}</span>
          </button>
          <button type="button" class="btn sm danger" onClick={shut(() => removeApp(m))}>
            <span class="lbl">{t("apps.del.go")}</span>
          </button>
        </span>
      </div>
    );
  return (
    <Menu class="pmenu app-menu" label={m.name} onClose={close}>
      <MenuItem onClick={shut(rename)}>
        {t("apps.m.rename")}
      </MenuItem>
      <MenuItem onClick={shut(() => openApp(m.id, { focus: true }))}>
        {inSheet ? t("apps.m.change", partner).replace(/[…]$/, "") : t("apps.m.change", partner)}
      </MenuItem>
      {m.back && (
        <MenuItem onClick={shut(() => undoApp(m.id))}>
          {t("app.back")}
        </MenuItem>
      )}
      <MenuItem onClick={shut(() => A.send({ t: "app_set", id: m.id, pinned: !m.pinned }))}>
        {m.pinned ? t("apps.m.unpin") : t("apps.m.pin")}
      </MenuItem>
      {canAddToHome() && m.home && (
        <MenuItem onClick={shut(() => openApp(m.id, { home: true }))}>
          {t("apps.m.home")}
        </MenuItem>
      )}
      {m.task && (
        <MenuItem onClick={shut(() => A.send({ t: "app_set", id: m.id, untask: true }))}>
          {t("apps.m.untask", m.task.title)}
        </MenuItem>
      )}
      <MenuSep />
      <MenuItem danger onClick={() => setAsking(true)}>
        {t("apps.m.delete")}
      </MenuItem>
    </Menu>
  );
}

/** D410: 删掉, then 撤销 for a while (the home keeps it APP_REMOVED_DAYS). */
export function removeApp(m: AppMeta) {
  if (AP.open?.id === m.id) {
    AP.open = undefined;
    if (A.sheet?.kind === "app") A.sheet = { kind: "apps" };
  }
  AP.list = AP.list.filter((x) => x.id !== m.id);
  A.send({ t: "app_remove", id: m.id });
  A.toast(t("apps.deleted", m.name), { label: t("apps.undo"), run: () => A.send({ t: "app_restore", id: m.id }) }, 8000);
  A.changed();
}

/** D422: over the app, when its state asks for something: the words and the one thing to do. */
function StateStrip({ m }: { m: AppMeta }) {
  const a = stateAction(m);
  return (
    <div class={`app-strip s-${appState(m)}`} role="status">
      <StateLine m={m} />
      {a && (
        <button type="button" class="btn sm secondary" onClick={a.run}>
          <span class="lbl">{a.label}</span>
        </button>
      )}
    </div>
  );
}

/** The app's sheet: its name, the app itself, a line to ask the partner to change it. */
export function AppSheet({ id }: { id: string }) {
  const o = AP.open;
  const meta = AP.list.find((a) => a.id === id);
  const frame = useRef<HTMLIFrameElement>(null);

  const [said, setSaid] = useState("");
  const [sent, setSent] = useState(false);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!o?.focus) return;
    o.focus = false;
    document.getElementById("app-ask")?.focus();
  });
  useEffect(() => {
    window.addEventListener("message", onMessage);
    // The theme follows Ducter's while it is open.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const tell = () => post({ t: "theme", dark: dark() });
    mq.addEventListener("change", tell);
    const mo = new MutationObserver(tell);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      window.removeEventListener("message", onMessage);
      mq.removeEventListener("change", tell);
      mo.disconnect();
    };
  }, []);
  useEffect(() => {
    if (o) o.frame = frame.current ?? undefined;
  });
  // D562: while an app is open, this page is that app: Add to Home Screen (and the browser's own
  // Install) take its name, its icon and a link straight into it.
  useEffect(() => (meta?.home ? homeLinks(meta) : undefined), [id, meta?.home, meta?.name]);
  // D431: the change landed (or the partner answered): its sent line gives way to what is true now.
  const landed = o?.changed?.version;
  useEffect(() => void (landed !== undefined && setSent(false)), [landed]);
  const busy = !!meta && appState(meta) === "changing";
  useEffect(() => void (!busy && setSent(false)), [busy]);
  const keys = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault(), e.stopPropagation();
    close();
  };
  const send = () => {
    const text = said.trim();
    if (!text) return;
    A.send({ t: "send", text, clientId: `p${Date.now().toString(36)}app`, app: id });
    setSaid("");
    setSent(true);
  };
  const name = meta?.name ?? o?.app?.name ?? "";
  const partner = A.defaultName() || "Ducter";
  return (
    <>
      <div class="scrim" onClick={close} />
      <div class="past-sheet app-sheet" role="dialog" aria-modal="true" aria-label={name} onKeyDown={keys}>
        <div class="past-head app-head">
          <h2>
            <AppFace m={meta ?? { id }} size={34} />
            {renaming !== undefined && meta ? (
              <input
                class="app-rename"
                value={renaming}
                aria-label={t("apps.m.rename")}
                ref={(el) => void (el && document.activeElement !== el && el.focus())}
                onInput={(e) => setRenaming((e.currentTarget as HTMLInputElement).value)}
                onBlur={() => setRenaming(undefined)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") return e.stopPropagation(), setRenaming(undefined);
                  if (e.key !== "Enter" || e.isComposing) return;
                  const v = renaming.trim();
                  if (v && v !== meta.name) A.send({ t: "app_set", id, name: v });
                  setRenaming(undefined);
                }}
              />
            ) : (
              <span class="app-title">{name}</span>
            )}
          </h2>
          {meta && (
            <span class="app-more">
              <button type="button" class={`more-btn${menu ? " open" : ""}`} aria-label={t("apps.more", name)} aria-expanded={menu} onClick={() => setMenu(!menu)}>
                ⋯
              </button>
              {menu && <AppMenu m={meta} inSheet close={() => setMenu(false)} rename={() => setRenaming(meta.name)} />}
            </span>
          )}
          <button class="past-x" aria-label={t("nav.back")} onClick={close}>
            ×
          </button>
        </div>
        {o?.first && !o.changed && (
          <p class="app-first">
            <span class="app-first-word">{t("app.first", partner)}</span>
            <span class="app-first-note">{o.first}</span>
          </p>
        )}
        {o?.changed && (
          // D562: the change is said where it landed, with its 改回去 beside it (the head keeps only 「⋯」,
          // so a long name is never cut); an Undo that landed says so, never 改好了.
          <div class="app-changed" key={o.changed.version} role="status">
            <span class="app-changed-words">
              <span class="app-changed-word">{t(o.changed.undone ? "app.undone" : "app.changed")}</span>
              {!o.changed.undone && o.changed.note && <span class="app-changed-note">{o.changed.note}</span>}
            </span>
            {!o.changed.undone && meta?.back && (
              <Btn kind="secondary" size="sm" label={t("app.back")} about={name} onClick={() => undoApp(id)} />
            )}
          </div>
        )}
        {meta && (stateAction(meta) || appState(meta) === "changing") && <StateStrip m={meta} />}
        <div class="app-stage">
          {o?.gone ? (
            <p class="past-none">{t("app.gone")}</p>
          ) : o?.app ? (
            <iframe key={o.app.version} ref={frame} class="app-frame" title={name} sandbox={APP_SANDBOX} src={url(o.app.src ?? "")} referrerpolicy="no-referrer" />
          ) : (
            <p class="past-none">{t("app.opening")}</p>
          )}
        </div>
        <div class="app-foot">
          {/* D519: asking from inside the app is the conversation's composer (composer.tsx). */}
          <ComposerBox id="app-ask" value={said} onInput={(v) => (setSaid(v), setSent(false))} onSend={send} label={t("app.ask.ph", partner)} placeholder={t("app.ask.ph", partner)} sendLabel={t("app.ask.send")} />
        </div>
        {o?.home && meta && <AppHomeSheet m={meta} close={() => ((o.home = false), A.changed())} />}
        <p class="app-meta">
          {sent && (!meta || appState(meta) !== "changing") ? (
            <span>{t("app.ask.sent", partner)}</span>
          ) : meta && appState(meta) === "plain" ? (
            <>
              <span>{t("app.private")}</span>
              <span class="app-when">{t("app.updated", stamp(A.L, meta.updated))}</span>
            </>
          ) : meta && !stateAction(meta) && appState(meta) !== "changing" ? (
            <StateLine m={meta} />
          ) : meta ? (
            <span>{t("app.private")}</span>
          ) : null}
        </p>
      </div>
    </>
  );
}

/** D562: a browser where a page can go on the Home Screen (never inside Ducter's own iPhone or Android app). */
export function canAddToHome(): boolean {
  return typeof window !== "undefined" && !(window as { ducterNative?: unknown }).ducterNative;
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Chrome's own install prompt, held for the app's 「添加」 (it comes once a page can be installed). */
let installPrompt: (Event & { prompt: () => Promise<void> }) | undefined;
if (typeof window !== "undefined")
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e as typeof installPrompt;
  });

/** Points the page's manifest, Home Screen icon, title and address at one app; gives back the way back. */
function homeLinks(m: AppMeta): () => void {
  const head = document.head;
  const point = (tag: "link" | "meta", key: "rel" | "name", value: string, attr: "href" | "content", to: string) => {
    let el = head.querySelector(`${tag}[${key}="${value}"]`);
    const made = !el;
    if (!el) {
      el = document.createElement(tag);
      el.setAttribute(key, value);
      head.appendChild(el);
    }
    const before = el.getAttribute(attr);
    el.setAttribute(attr, to);
    const node = el;
    return () => {
      if (made) head.removeChild(node);
      else if (before === null) node.removeAttribute(attr);
      else node.setAttribute(attr, before);
    };
  };
  const base = m.home!;
  const back = [
    point("link", "rel", "manifest", "href", `${base}manifest.webmanifest`),
    point("link", "rel", "apple-touch-icon", "href", `${base}icon-180.png`),
    point("meta", "name", "apple-mobile-web-app-title", "content", m.name),
  ];
  const path = location.pathname;
  const there = `${path}?app=${m.id}`;
  if (path + location.search !== there) history.replaceState(history.state, "", there);
  return () => {
    for (const b of back) b();
    if (location.search === `?app=${m.id}`) history.replaceState(history.state, "", path);
  };
}

/**
 * D562: 添加到主屏幕 / Add to Home Screen: the app's own icon at the size the Home Screen shows it, its
 * name under it, and the one step this browser takes (Safari's Share; Chrome's own Add; else its menu).
 */
function AppHomeSheet({ m, close }: { m: AppMeta; close: () => void }) {
  const partner = A.defaultName() || "Ducter";
  const prompt = isIOS() ? undefined : installPrompt;
  const how = isIOS() ? t("app.home.ios") : prompt ? t("app.home.prompt") : t("app.home.other");
  return (
    <div class="pmenu app-home" role="dialog" aria-label={t("app.home.h", m.name)} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), close())}>
      <span class="app-home-icon" aria-hidden="true">
        <img src={`${m.home}icon-180.png`} width={60} height={60} alt="" />
        <span class="app-home-name">{m.name}</span>
      </span>
      <span class="app-home-words">
        {/* D562: Chinese words kept whole (never 「放到主」 over 「屏幕」), and a date in the name never split at its dash or slash (「11/20–」 over 「21」). */}
        <b class="app-home-h">{keepClauses(t("app.home.h", m.name.replace(/\s*[–/-]\s*/g, (x) => `\u2060${x}\u2060`)))}</b>
        <span class="app-home-how">{keepClauses(how)}</span>
        <span class="app-home-after">{keepClauses(t("app.home.after", partner))}</span>
      </span>
      <span class="app-home-acts">
        {prompt && (
          <Btn
            kind="primary"
            size="sm"
            label={t("app.home.add")}
            about={m.name}
            onClick={() => {
              installPrompt = undefined;
              void prompt.prompt().finally(close);
            }}
          />
        )}
        <Btn kind={prompt ? "text" : "secondary"} size="sm" label={t("app.home.ok")} onClick={close} />
      </span>
    </div>
  );
}
