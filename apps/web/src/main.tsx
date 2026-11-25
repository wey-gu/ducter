// Boot: pair if the page was opened from a `ducter pair` link (/pair#c=CODE), find out whether
// this browser may talk to core (local, or a paired device), then run the app.
import { PhoneInstallSheet, PhoneLiveSheet, phoneFrame } from "./phone-use.tsx";
import { HandsetGuideSheet, handsetFrame, handsetHello } from "./handset.tsx";
import { render, type ComponentChild } from "preact";
import { useEffect, useReducer, useState } from "preact/hooks";
import { A, savedPartner } from "./app.ts";
import { Api, baseUrl, codeFromHash, pair, storage, type Me, type PairError } from "./conn.ts";
import { kvSet } from "./idb.ts";
import { forgetGlance, loadGlance, type Glance } from "./glance.ts";
import { registerWorker } from "./push-client.ts";
import { deviceFromApp, inApp, tellApp } from "./native.ts";
import { startAutospace } from "./autospace.ts";
import { listenForCodeCopy } from "./conv-copy.ts";
import { Avatar, Conversation, OnHand, Places, Sheets, TaskView, Toasts } from "./views.tsx";
import { LiveView } from "./live.tsx";
import { Board, Rail } from "./board.tsx";
import { openKey, ROOMY, ROOMY_BENCH, useRoomy } from "./wide.ts";
import { PartnerList, partnerKey } from "./partners.tsx";
import { escUp, phoneNow, useFill, usePhone, useSplit, useWide } from "./wide.ts";
import { benchKey, benchOpen, benchShown, Workbench } from "./workbench.tsx";
import { liveInBench } from "./live.tsx";
import { nthKey, walkKey } from "./onhand.tsx";
import { keysKey } from "./keymap.tsx";
import { markSeen } from "./seen.ts";
import { edgeSwipe, navBusy, popMove } from "./nav.ts";
import { wideNow } from "./fold.ts";
import { applyDensity, applyPaper, densityKey } from "./settings-more.tsx";
import { keepAboveKeyboard } from "./keyboard.ts";
import { watchTextSize } from "./text-scale.ts";
import { BOOT_TIMEOUT_MS, BootWait, Guard, within, type BootState } from "./boot-wait.tsx";
import { BackRow, Notice } from "./controls.tsx";
import { createLinkWatch } from "./link.ts";
import { askStandingWeb } from "@ducter/protocol/src/reach-verify-web.ts";

applyPaper(); // D307: this device's own light or dark, before the first paint
applyDensity(); // D457: and its own density
keepAboveKeyboard(); // D404: iOS lays the keyboard over a sheet; the sheet stands on it

const base = baseUrl();
const token = () => storage.get()?.token;
/** D293: what the iPhone and Android apps keep so a page at another of the home's addresses is the same device. */
const recordForApp = () => {
  const r = storage.get();
  return r ? { deviceId: r.deviceId, name: r.name } : {};
};
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
    document.documentElement.lang = A.L.style.intl;
  });
  // The page's language settles after boot (it follows your first words): the app's own screens,
  // an update's card on Android (D181), follow it.
  const lang = A.L.lang;
  useEffect(() => {
    if (inApp()) tellApp({ base: base.href, locale: lang, personaName: A.S.personaName });
  }, [lang]);
  const r = A.route;
  // D497: the page's clay figure is in the shown partner's own clay (app.css --clay); one partner: as drawn.
  const clay = (A.partners?.length ? A.speakerFor().wear.look : undefined) ?? ""; // D568
  if (typeof document !== "undefined" && (document.documentElement.dataset.clay ?? "") !== clay) document.documentElement.dataset.clay = clay;
  // D176: wide enough for two (an iPad held across, a 13" iPad upright, a wide window): the
  // conversation stays on the left, and On hand, or the task opened from it, stands beside it.
  const wide = useWide();
  // D541: under 700 the list of partners is the level above the conversation; from 700 it stands beside.
  const phone = usePhone();
  // D182: on a foldable the panes split at the fold, left and right (a book) or top and bottom
  // (tabletop); app.css places them from --fold-a and --fold-gap.
  const split = useSplit();
  // D184: On hand, or an opened task, can take the whole screen as the Mac shows it; the two
  // panes stay the default and come back in one move (⌘2, the header's button, Esc).
  const fill = useFill();
  // D214: the opened task's workbench: wide, a column at the whole screen's right; else a sheet.
  const benchTask = r.name === "task" ? A.S.tasks.get(r.id) : undefined;
  const benched = benchOpen(benchTask) && (fill || !wide);
  liveInBench.taskId = benchShown.taskId = benched && benchTask ? benchTask.id : "";
  // D216: a task at the whole screen keeps On hand beside it as a rail when there is room (more
  // room when its workbench is open beside it too).
  const roomy = useRoomy(ROOMY);
  const roomyBench = useRoomy(ROOMY_BENCH);
  // D244: from 1120 the rail; all three from 1560, and under it an open workbench takes the rail's
  // place (two slots). On a book fold, a task opened from the whole-screen On hand stands in the
  // second half with the rail in the first, nothing across the fold.
  const book = split?.kind === "book";
  const rail = r.name === "task" && (book ? fill : !split && (benched ? roomyBench : roomy));
  // D244: a task open on this device is seen, whatever it says now (seen.ts: 新结果 / New result).
  if (benchTask) markSeen(benchTask.id, benchTask.card?.updatedAt);
  // D262: a first open settles on the calm ground (at most 1.5 s) instead of flashing the system's
  // language before the person's. After every hook, so their order never changes.
  if (A.settling()) return <main class="boot" aria-busy="true" />;
  return (
    <>
      {fill ? (
        <div class={`${split ? `full ${split.kind}` : "full"}${benched && !book ? " benched" : ""}`}>
          {r.name === "task" ? (
            rail ? (
              <div class="with-rail">
                <Rail />
                <div class="beside-rail">
                  <TaskView key={r.id} id={r.id} full />
                </div>
              </div>
            ) : (
              <TaskView key={r.id} id={r.id} full />
            )
          ) : (
            <Board />
          )}
          {benched && benchTask && <Workbench key={benchTask.id} task={benchTask} sheet={book} />}
        </div>
      ) : wide ? (
        <div class={split ? `panes ${split.kind}` : "panes"}>
          {/* D513: with more than one partner, the list of them at the conversation's left; D541: on a
              fold the conversation's bar holds the others' faces instead, and the list opens over it. */}
          {!split && A.railMode !== "hidden" && <PartnerList at="side" thin={A.railMode === "thin"} />}
          {/* D541: picking a partner shows its conversation in place, in this frame (held, or peeked);
              the list, the bar and the composer stay still. */}
          <section class="pane conv" aria-label={t("nav.conversation")}>
            {split && A.partnersOpen && A.manyPartners() ? <PartnerList at="home" /> : <Conversation />}
          </section>
          <section class="pane side" aria-label={r.name === "task" ? undefined : t("nav.onhand")}>
            {r.name === "task" ? <TaskView key={r.id} id={r.id} /> : <OnHand />}
          </section>
        </div>
      ) : (
        <>
          {/* D513: a phone's list of partners is the level above the conversation. */}
          {r.name === "conv" &&
            (A.partnersOpen && A.manyPartners() ? (
              <PartnerList at="home" places={<Places onHand />} />
            ) : A.manyPartners() && !phone && A.railMode !== "hidden" ? (
              // D541: between a phone and two panes (700–999: an iPad upright, a foldable open), the
              // slim list of faces and numbers at the conversation's left, as from 1000.
              <div class="panes mid">
                <PartnerList at="side" slim thin={A.railMode === "thin"} />
                <section class="pane conv" aria-label={t("nav.conversation")}>
                  <Conversation />
                </section>
              </div>
            ) : (
              <Conversation />
            ))}
          {r.name === "onhand" && <OnHand />}
          {r.name === "task" && <TaskView id={r.id} />}
          {benched && benchTask && <Workbench key={benchTask.id} task={benchTask} sheet />}
        </>
      )}
      <Sheets />
      <LiveView />
      <PhoneLiveSheet />
      <PhoneInstallSheet />
      <HandsetGuideSheet />
      <Toasts />
    </>
  );
}

// ---------- D532: the link to the home, by D520's rule ----------

/** The home's name for the pair screen's line: its own name, else this address. */
const goneHome = () => A.homeName || A.linkMemo.get().home || base.host;

/**
 * Something refused this device's token. Only the home's verified word (or an old home's 401 held
 * over OLD_HOME_WINDOW_MS) clears it; anything else keeps the token, the screen and the retrying.
 */
const watch = createLinkWatch({
  deps: () => {
    const r = storage.get();
    return r?.token ? { base, token: r.token, fp: r.fp, memo: A.linkMemo } : undefined;
  },
  me: async () => (await api.call<Me>("api/me")).status,
  gone: async (why) => {
    // The home said this device is disconnected (or no longer known): nothing it showed stays here.
    A.conn?.stop();
    forgetGlance();
    // D543: what waited to be sent, and the tasks kept for reading, were this pairing's.
    A.outbox.clear();
    void A.taskWins.clear();
    storage.clear();
    await kvSet("token", undefined);
    return boot({ busy: false, code: "", error: why });
  },
});
const refused = (now = false) => watch.unauthorized(now);
const socketRefused = (now = false) => watch.refused(now);

/** Once a page, after a welcome: whether this home can say a standing at all (then no 401 is ever taken alone). */
let probed = false;
async function probeStanding() {
  const r = storage.get();
  if (probed || !r?.token || !r.fp || A.linkMemo.get().standing) return;
  probed = true;
  if ((await askStandingWeb(base, r.token, r.fp)) === "live") A.linkMemo.set({ ...A.linkMemo.get(), standing: true });
}

type PairView = { busy: boolean; error?: PairError | "revoked" | "unknown"; code: string };

function Pairing({ initial, onPaired, onBack }: { initial: PairView; onPaired: () => void; onBack?: () => void }) {
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
      ? t("connect.revoked", goneHome())
      : v.error === "unknown"
        ? t("connect.unknown", goneHome())
      : v.error === "locked"
        ? t("connect.err.locked")
        : v.error === "unreachable"
          ? t("connect.err.unreachable", base.host)
          : v.error
            ? t("connect.err.code")
            : "";
  // D532: the home's own word that this device was disconnected leads the screen, in its words; a
  // wrong code stays under the field it is about.
  const gone = v.error === "revoked" || v.error === "unknown";
  return (
    <div class="pairing">
      {onBack && !v.busy && <BackRow label={t("connect.back")} onClick={onBack} />}
      <div class="face">
        <Avatar size={140} state={v.busy ? "working" : "idle"} />
      </div>
      <h1>{v.busy ? t("connect.pairing") : t("connect.title")}</h1>
      {!v.busy && (
        <>
          {gone && <Notice body={err} />}
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
            {err && !gone && (
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
            {t("connect.address")}{A.L.style.colon}<code>{base.host}</code>
          </p>
        </>
      )}
    </div>
  );
}

const root = document.getElementById("app")!;
watchTextSize(); // D452: rows that stack at the largest text sizes
startAutospace(document.body); // the CJK-Latin gap where the browser lacks text-autospace (D78)
// D254: every code block's own Copy, wherever a message draws one.
listenForCodeCopy(() => ({ copy: t("reply.copy"), copied: t("conv.copied"), failed: t("conv.copy.failed") }), (s) => A.toast(s));

/**
 * D543 (D535's leftover): every draw into the page goes through here. Preact's first render into a
 * root that already holds other DOM diffs against it instead of replacing it: it reuses an element
 * of the same tag and leaves the rest where they are. index.html's static boot ground is a <main>:
 * at a phone's width the app's own <main> took it over (so it seemed to go), at two panes (from
 * about 1000 wide) nothing matched and it stayed in #app beside the app, a full-height block over
 * it. D535 removed it only before the app's own render; any other first draw (and a cached older
 * bundle) left it. So the first draw, whichever it is, empties the root of what Preact didn't make.
 */
let painted = false;
function paint(vnode: ComponentChild) {
  if (!painted) {
    painted = true;
    root.replaceChildren();
  }
  render(vnode, root);
}

/** D474: the ground while the page can't show the app yet, or why it couldn't, with Try again. */
function wait(state: BootState) {
  paint(<BootWait t={t} state={state} onRetry={() => void boot()} />);
}

/** D474: whatever goes wrong while opening, the page says so with Try again; it never stays blank. */
async function boot(pairing?: PairView) {
  try {
    await opening(pairing);
  } catch (e) {
    console.error("[ducter] opening the page failed", e);
    paint(<BootWait t={t} state={{ kind: "broken" }} onRetry={() => location.reload()} />);
  }
}

async function opening(pairing?: PairView) {
  if (pairing) {
    paint(<Pairing initial={pairing} onPaired={() => void boot()} />);
    return;
  }
  // D293: the app opened the home at another of its addresses (another origin, empty storage):
  // it hands back the device record it kept, so nothing is paired again.
  if (!token() && inApp()) {
    const rec = await deviceFromApp();
    if (rec?.token && rec.deviceId) {
      storage.set({ token: rec.token, deviceId: rec.deviceId, name: rec.name ?? "", ...(rec.personaName ? { personaName: rec.personaName } : {}), pairedAt: new Date().toISOString() });
      await kvSet("token", rec.token);
    }
  }
  const had = token();
  // D209: a paired device, or this machine's page with a last screen kept, paints at once: the
  // last screen from the glance, the socket opening alongside, and who we are asked meanwhile.
  // Nothing waits on a round trip before the first frame.
  const device = storage.get()?.deviceId ?? (had ? "" : "local");
  const glance = device ? loadGlance(device, undefined, savedPartner()) : undefined;
  if (had || glance) {
    const me: Me = glance?.me ?? { via: had ? "device" : "local", personaName: storage.get()?.personaName ?? "Ducter", push: { supported: false } };
    // D543: what an earlier page sent and the home hasn't got shows again in the first frame.
    await within(A.outbox.load(device || "local"), 500, []);
    run(me, had, device, glance);
    void api.call<Me>("api/me").then(async (r) => {
      if (r.status === 401) {
        // D532: a paired device asks the home; a 401 alone (a proxy while the home restarts) keeps
        // the token and the screen. This machine's own page with no token has nothing to keep.
        if (had) return void refused(true);
        A.conn?.stop();
        forgetGlance();
        return boot({ busy: false, code: "", error: undefined });
      }
      if (r.status !== 200 || !r.data) return;
      A.me = r.data;
      if (r.data.personaName && !A.S.welcomed) A.S.personaName = r.data.personaName;
      if (r.data.personaName !== me.personaName) tellApp({ token: had, base: base.href, locale: A.L.lang, personaName: A.S.personaName, ...recordForApp() });
      A.changed();
    });
    return;
  }
  // A first open (nothing kept on this device) asks who it is before anything: the partner waits on
  // the page meanwhile, and a home that doesn't answer in time is said, with Try again (D474).
  wait({ kind: "waiting" });
  const r = await within(api.call<Me>("api/me"), BOOT_TIMEOUT_MS, { status: 0 });
  if (r.status === 401) return boot({ busy: false, code: "", error: undefined });
  if (r.status === 0) return wait({ kind: "unreachable", host: base.host });
  const me: Me = r.data ?? { via: "local", personaName: "Ducter", push: { supported: false } };
  await within(A.outbox.load("local"), 500, []);
  run(me, had, "local");
}

function run(me: Me, had: string | undefined, device: string, glance?: Glance) {
  if (had) void kvSet("token", had);
  tellApp({ token: had, base: base.href, locale: A.L.lang, personaName: me.personaName, ...recordForApp() });
  if (!inApp()) void registerWorker(base); // the app's notifications are its own (APNs)
  A.glanceDevice = device;
  A.onPhoneFrame = phoneFrame; // D217
  A.onHandsetFrame = handsetFrame; // D238
  A.onHandsetWelcome = () => void handsetHello();
  // D532: a refused socket, Try now and a welcome reach the link's judge; 再连一次 opens the pair
  // screen over the app (Back returns to it; the token stays until a new pairing replaces it).
  watch.reset();
  A.onLinkRefused = () => void socketRefused();
  A.onLinkRetry = () => void socketRefused(true);
  A.onLinkHeard = () => void probeStanding();
  A.onLinkAgain = () => paint(<Pairing initial={{ busy: false, code: "" }} onPaired={() => location.reload()} onBack={showApp} />);
  if (glance) A.restore(glance);
  A.restoreOutbox(); // D543
  A.start(base, api, me, token);
  A.fromHash();
  // The app's menus and hardware-keyboard shortcuts (⌘N, ⌘1…⌘4, ⌘, and ⌘K, as on the Mac; D176).
  (globalThis as { ducterCommand?: (c: string) => void }).ducterCommand = (c) => A.command(c);
  // D344: the Android app's own update card opened a version's notes (its 看看都改了什么).
  (globalThis as { ducterNotesSeen?: (v: string) => void }).ducterNotesSeen = (v) => A.notesSeen(String(v));
  addEventListener("keydown", (e) => void benchKey(e));
  addEventListener("keydown", escUp);
  addEventListener("keydown", openKey);
  addEventListener("keydown", walkKey);
  addEventListener("keydown", nthKey);
  addEventListener("keydown", partnerKey); // D497: ⌥⌘1–⌥⌘4
  addEventListener("keydown", keysKey);
  addEventListener("keydown", densityKey); // D457
  // D290: back and forward move as a level does (nav.ts), unless the browser drew its own; a
  // hashchange that follows a pop lands after the move has its old picture.
  addEventListener("popstate", (e) => popMove(e, A.route, () => A.fromHash()));
  addEventListener("hashchange", () => !navBusy() && A.fromHash());
  const page = document.getElementById("app");
  if (page)
    edgeSwipe(
      page,
      // D513: in a conversation with more than one partner, the swipe goes up to the list of them.
      // D545: and on any width, with the list hidden, it brings the list back.
      () => (!wideNow() || (A.route.name === "conv" && A.manyPartners() && A.railMode === "hidden")) && (A.route.name !== "conv" || (A.manyPartners() && !A.partnersOpen)) && !A.sheet && !A.viewer && !A.fileView,
      () => {
        if (A.route.name === "conv") return A.railMode === "hidden" && !phoneNow() ? A.setRail("") : A.showPartners();
        if (history.length > 1 && location.hash) return history.back();
        history.replaceState(null, "", location.pathname);
        A.applyRoute({ name: "conv" });
      },
      { inApp: inApp() },
    );
  navigator.serviceWorker?.addEventListener("message", (e: MessageEvent) => {
    if (e.data?.t === "open") location.href = e.data.url;
  });
  showApp();
}

function showApp() {
  // D535, D543: index.html's static boot ground never stays beside the app (paint empties the root
  // of what Preact didn't draw on the first draw, whichever draw that is).
  paint(
    <Guard t={t}>
      <App />
    </Guard>,
  );
}

// A pairing link carries its code in the fragment, which never reaches a server log. Take it,
// and drop it from the address bar and history at once.
const code = location.pathname.endsWith("/pair") ? codeFromHash(location.hash) : "";
if (location.pathname.endsWith("/pair")) history.replaceState(null, "", new URL("app", base).pathname);
void boot(code ? { busy: true, code } : undefined);
