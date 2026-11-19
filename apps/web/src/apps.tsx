// D405: 小应用 / Apps (design/apps.md). An app the partner made for the person: its card under the
// partner's words, and its sheet (the whole screen on a phone) running the app in a sandboxed
// iframe with no network: the home composes the document (policy, Pebble's tokens, the bridge),
// this file carries the bridge's messages (a key written goes to the home and every device; an ask
// goes into the conversation and its answer comes back), and a line under the app asks the
// partner to change it. Facts are separate elements (D291), never joined.
import { useEffect, useRef, useState } from "preact/hooks";
import { APP_SANDBOX, type AppCard, type AppMeta, type AppOpen, type Bodies, type LogEvent, type ServerFrame } from "@ducter/protocol";
import { A } from "./app.ts";
import { stamp } from "./format.ts";
import { url } from "./media.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** What the web holds of the person's apps, and the one open now. */
export const AP = {
  list: [] as AppMeta[],
  open: undefined as undefined | { id: string; app?: AppOpen; gone?: boolean; asks: Set<string>; sent: Map<string, string>; frame?: HTMLIFrameElement; changed?: { version: number; note?: string } },
};

/** The app mark, drawn (never an emoji): a small window with a title bar and two rows. */
export const APP_GLYPH = (size = 22) => (
  <svg class="app-glyph" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
    <rect x="3.5" y="4" width="13" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" />
    <path d="M3.5 7.6h13M6.5 10.6h4M6.5 13h7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  </svg>
);

const dark = () => {
  const th = document.documentElement.dataset.theme;
  return th ? th === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
};

function ask(id: string) {
  A.send({ t: "app_open", id, transport: "message", dark: dark(), lang: A.L.lang === "zh" ? "zh-CN" : "en" });
}

export function openApp(id: string) {
  AP.open = { id, asks: new Set(), sent: new Map() };
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
    const o = AP.open;
    const now = o && f.apps.find((a) => a.id === o.id);
    // The partner changed the open app: it runs again as it is now, with a word of what changed.
    if (o?.app && now && now.version !== o.app.version) {
      o.changed = { version: now.version, ...(now.note ? { note: now.note } : {}) };
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
  }
}

/** The card under the partner's words: the app's mark, its name, what happened, 打开 / Open. */
export function AppCardView({ c }: { c: AppCard }) {
  const now = AP.list.find((a) => a.id === c.id);
  const gone = AP.list.length > 0 && !now ? true : false;
  return (
    <div class={`app-card${gone ? " gone" : ""}`} role="group" aria-label={c.name}>
      <span class="app-face">{APP_GLYPH(26)}</span>
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

/** The app's sheet: its name, the app itself, a line to ask the partner to change it. */
export function AppSheet({ id }: { id: string }) {
  const o = AP.open;
  const meta = AP.list.find((a) => a.id === id);
  const frame = useRef<HTMLIFrameElement>(null);
  const [said, setSaid] = useState("");
  const [sent, setSent] = useState(false);
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
            <span class="app-face sm">{APP_GLYPH(20)}</span>
            <span class="app-title">{name}</span>
          </h2>
          {meta?.back && (
            <button type="button" class="btn text sm" onClick={() => A.send({ t: "app_back", id })}>
              <span class="lbl">{t("app.back")}</span>
            </button>
          )}
          <button class="past-x" aria-label={t("nav.back")} onClick={close}>
            ×
          </button>
        </div>
        {o?.changed && (
          <p class="app-changed" key={o.changed.version}>
            <span class="app-changed-word">{t("app.changed")}</span>
            {o.changed.note && <span class="app-changed-note">{o.changed.note}</span>}
          </p>
        )}
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
          <input
            class="app-ask"
            dir="auto"
            value={said}
            placeholder={t("app.ask.ph", partner)}
            aria-label={t("app.ask.ph", partner)}
            onInput={(e) => ((setSaid((e.currentTarget as HTMLInputElement).value), setSent(false)))}
            onKeyDown={(e) => e.key === "Enter" && !e.isComposing && (e.preventDefault(), send())}
          />
          <button type="button" class="btn sm primary" disabled={!said.trim()} onClick={send}>
            <span class="lbl">{t("app.ask.send")}</span>
          </button>
        </div>
        <p class="app-meta">
          {sent ? (
            <span>{t("app.ask.sent", partner)}</span>
          ) : (
            <>
              <span>{t("app.only", partner)}</span>
              {meta && <span class="app-when">{t("app.updated", stamp(A.L, meta.updated))}</span>}
            </>
          )}
        </p>
      </div>
    </>
  );
}
