// Boot: pair if the page was opened from a `ducter pair` link (/pair#c=CODE), find out whether
// this browser may talk to core (local, or a paired device), then run the app.
import { render } from "preact";
import { useEffect, useReducer, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Api, baseUrl, codeFromHash, pair, storage, type Me, type PairError } from "./conn.ts";
import { kvSet } from "./idb.ts";
import { registerWorker } from "./push-client.ts";
import { inApp, tellApp } from "./native.ts";
import { Avatar, Conversation, OnHand, Sheets, TaskView, Toasts } from "./views.tsx";

const base = baseUrl();
const token = () => storage.get()?.token;
const api = new Api(base, token);
const t = (k: string, ...a: unknown[]) => A.L.t(k, ...a);

function App() {
  const [, bump] = useReducer((n: number, _: void) => n + 1, 0);
  useEffect(() => {
    const off = A.onChange(() => bump());
    return () => void off();
  }, []);
  useEffect(() => {
    document.documentElement.lang = A.L.lang === "zh" ? "zh-CN" : "en";
  });
  const r = A.route;
  return (
    <>
      {r.name === "conv" && <Conversation />}
      {r.name === "onhand" && <OnHand />}
      {r.name === "task" && <TaskView id={r.id} />}
      <Sheets />
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
        <Avatar size={140} state={v.busy ? "working" : "idle"} big={!v.busy} />
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
            <button class="btn primary" type="submit" disabled={!v.code.trim()}>
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
