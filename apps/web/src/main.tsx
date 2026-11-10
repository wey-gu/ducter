// Boot: pair if the page was opened from a `ducter pair` link (/pair#c=CODE), find out whether
// this browser may talk to core (local, or a paired device), then run the app.
import { render } from "preact";
import { useEffect, useReducer, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Api, baseUrl, codeFromHash, pair, storage, type Me, type PairError } from "./conn.ts";
import { kvSet } from "./idb.ts";
import { registerWorker } from "./push-client.ts";
import { inApp, tellApp } from "./native.ts";
import { startAutospace } from "./autospace.ts";
import { Avatar, Conversation, LiveView, OnHand, Sheets, TaskView, Toasts } from "./views.tsx";
import { escUp, useSplit, useWide } from "./wide.ts";

const base = baseUrl();
const token = () => storage.get()?.token;
const api = new Api(base, token);
const t = (k: string, ...a: unknown[]) => A.L.t(k, ...a);

function App() {
  const [, bump] = useReducer((n: number, _: void) => n + 1, 0);
  useEffect(() => {
    const off = A.onChange(() => bump());
    // Frames that landed between A.start() and this effect (a fast socket beats the first
    // paint) changed nothing on screen: catch up once now that we're listening.
    bump();
    return () => void off();
  }, []);
  useEffect(() => {
    document.documentElement.lang = A.L.lang === "zh" ? "zh-CN" : "en";
  });
  // The page's language settles after boot (it follows your first words): the app's own screens,
  // an update's card on Android (D181), follow it.
  const lang = A.L.lang;
  useEffect(() => {
    if (inApp()) tellApp({ base: base.href, locale: lang, personaName: A.S.personaName });
  }, [lang]);
  const r = A.route;
  // D176: wide enough for two (an iPad held across, a 13" iPad upright, a wide window): the
  // conversation stays on the left, and On hand, or the task opened from it, stands beside it.
  const wide = useWide();
  // D182: on a foldable the panes split at the fold, left and right (a book) or top and bottom
  // (tabletop); app.css places them from --fold-a and --fold-gap.
  const split = useSplit();
  return (
    <>
      {wide ? (
        <div class={split ? `panes ${split.kind}` : "panes"}>
          <section class="pane conv" aria-label={t("nav.conversation")}>
            <Conversation />
          </section>
          <section class="pane side" aria-label={r.name === "task" ? undefined : t("nav.onhand")}>
            {r.name === "task" ? <TaskView key={r.id} id={r.id} /> : <OnHand />}
          </section>
        </div>
      ) : (
        <>
          {r.name === "conv" && <Conversation />}
          {r.name === "onhand" && <OnHand />}
          {r.name === "task" && <TaskView id={r.id} />}
        </>
      )}
      <Sheets />
      <LiveView />
      <Toasts />
    </>
  );
}

type PairView = { busy: boolean; error?: PairError | "revoked"; code: string };

function Pairing({ initial, onPaired }: { initial: PairView; onPaired: () => void }) {
  const [v, setV] = useState<PairView>(initial);
  const submit = async (code: string) => {
    setV({ ...v, code, busy: true, error: undefined });
    const r = await pair(base, code);
    if ("error" in r) return setV({ code, busy: false, error: r.error });
    storage.set(r);
    await kvSet("token", r.token);
    onPaired();
  };
  useEffect(() => {
    if (initial.busy && initial.code) void submit(initial.code);
  }, []);
  const err =
    v.error === "revoked"
      ? t("connect.revoked")
      : v.error === "locked"
        ? t("connect.err.locked")
        : v.error === "unreachable"
          ? t("connect.err.unreachable", base.host)
          : v.error
            ? t("connect.err.code")
            : "";
  return (
    <div class="pairing">
      <div class="face">
        <Avatar size={140} state={v.busy ? "working" : "idle"} />
      </div>
      <h1>{v.busy ? t("connect.pairing") : t("connect.title")}</h1>
      {!v.busy && (
        <>
          <p>{t("connect.phone.body")}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (v.code.trim()) void submit(v.code.trim());
            }}
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <div class="field">
              <label for="code">{t("connect.code")}</label>
              <input
                id="code"
                autocomplete="one-time-code"
                autocapitalize="characters"
                spellcheck={false}
                placeholder={t("connect.code.placeholder")}
                value={v.code}
                onInput={(e) => setV({ ...v, code: (e.target as HTMLInputElement).value })}
              />
            </div>
            {err && (
              <div class="err" role="alert">
                {err}
              </div>
            )}
            <button class="btn primary lg" type="submit" disabled={!v.code.trim()}>
              {t("connect.go")}
            </button>
          </form>
          <p class="small">{t("connect.phone.safe")}</p>
          <p class="small">
            {t("connect.address")}{A.L.lang === "zh" ? "：" : ": "}<code>{base.host}</code>
          </p>
        </>
      )}
    </div>
  );
}

const root = document.getElementById("app")!;
startAutospace(document.body); // the CJK-Latin gap where the browser lacks text-autospace (D78)

async function boot(pairing?: PairView) {
  if (pairing) {
    render(<Pairing initial={pairing} onPaired={() => void boot()} />, root);
    return;
  }
  const had = token();
  const r = await api.call<Me>("api/me");
  if (r.status === 401) {
    if (had) storage.clear(), await kvSet("token", undefined);
    return boot({ busy: false, code: "", error: had ? "revoked" : undefined });
  }
  if (r.status === 0 && !had) return boot({ busy: false, code: "", error: "unreachable" });
  const me: Me = r.data ?? { via: had ? "device" : "local", personaName: storage.get()?.personaName ?? "Ducter", push: { supported: false } };
  if (had) await kvSet("token", had);
  tellApp({ token: had, base: base.href, locale: A.L.lang, personaName: me.personaName });
  if (!inApp()) void registerWorker(base); // the app's notifications are its own (APNs)
  A.start(base, api, me, token);
  A.fromHash();
  // The app's menus and hardware-keyboard shortcuts (⌘N, ⌘1…⌘4, ⌘, and ⌘K, as on the Mac; D176).
  (globalThis as { ducterCommand?: (c: string) => void }).ducterCommand = (c) => A.command(c);
  addEventListener("keydown", escUp);
  addEventListener("popstate", () => A.fromHash());
  addEventListener("hashchange", () => A.fromHash());
  navigator.serviceWorker?.addEventListener("message", (e: MessageEvent) => {
    if (e.data?.t === "open") location.href = e.data.url;
  });
  render(<App />, root);
}

// A pairing link carries its code in the fragment, which never reaches a server log. Take it,
// and drop it from the address bar and history at once.
const code = location.pathname.endsWith("/pair") ? codeFromHash(location.hash) : "";
if (location.pathname.endsWith("/pair")) history.replaceState(null, "", new URL("app", base).pathname);
void boot(code ? { busy: true, code } : undefined);
