// D298: the partner's first words (what they offer, where they were read, 别再看了 / Stop
// looking) and the pasted-key card, the same as the Mac's (views/firstwords.go). A start fills
// the composer; it never sends. The key goes once in key_add and is never shown again.
// D327: nothing in the records is read before the person taps the look start; each offer from
// them says how I know (which agent, which folder, when, on which computer) and can leave its
// folder out; 别再看了 forgets what was read.
import { words, type FirstWords, type KeyResult } from "@ducter/protocol";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn, LinkBtn } from "./controls.tsx";
import { ago } from "./format.ts";
const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

const AGENTS: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", pi: "pi" };

/** Still at the very start: the first words, nothing said back yet. */
export const firstOpening = () => A.S.first?.visit === "first";

/** D327: a folder the person left out (这个文件夹别看了), or one inside it. */
export function leftOut(path: string | undefined, folders: readonly string[] | undefined): boolean {
  if (!path || !folders?.length) return false;
  return folders.some((f) => path === f || path.startsWith(f.endsWith("/") ? f : `${f}/`));
}

/** D327: which starts show: everyday ones always; the look start until it was answered; the
 *  records' own only while looking is on and their folder isn't left out. */
export function shownStarts(fw: FirstWords, first: { looks?: boolean; lookDone?: boolean; outsideFolders?: string[] } | undefined): FirstWords["starts"] {
  const looks = first ? first.looks !== false : true;
  return fw.starts.filter((s) => (s.from === "everyday" ? true : s.from === "look" ? looks && !first?.lookDone : looks && !fw.forgot && !leftOut(s.path, first?.outsideFolders)));
}

const howOpen = new Set<string>();

export function FirstAfter({ fw }: { fw: FirstWords }) {
  const first = A.S.first;
  const looks = first ? first.looks !== false : true;
  const starts = shownStarts(fw, first);
  const computer = fw.computer ?? first?.computer ?? t("first.here");
  const fromRecords = starts.some((s) => s.from !== "everyday" && s.from !== "look");
  const set = (on: boolean) => {
    A.send({ t: "local_agents", on });
    if (first) first.looks = on;
    A.changed();
  };
  const leave = (path: string) => {
    A.send({ t: "outside_folder", path, hidden: true });
    if (first) first.outsideFolders = [...(first.outsideFolders ?? []), path];
    A.toast(t("first.how.left", path));
    A.changed();
  };
  return (
    <div class="first-after">
      {starts.length > 0 && (
        <div class="first-starts">
          {starts.map((s) => {
            const mine = s.from !== "everyday" && s.from !== "look";
            const key = `${fw.starts.indexOf(s)}:${s.id}`;
            const open = mine && howOpen.has(key);
            return (
              <div key={s.id} class={`first-start${open ? " open" : ""}`}>
                <button
                  class="btn secondary suggest"
                  onClick={() => {
                    if (s.from === "look") {
                      // D327: the person's yes: the home looks now and answers with what it found.
                      A.send({ t: "local_agents_look", tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
                      if (first) first.lookDone = true;
                      A.changed();
                      return;
                    }
                    A.draft = s.draft; // fills the composer; never sends
                    A.changed();
                    document.getElementById("composer")?.focus();
                  }}
                >
                  {s.words}
                </button>
                {mine && (
                  <button class="first-how-btn linkish" aria-expanded={open} onClick={() => (open ? howOpen.delete(key) : howOpen.add(key), A.changed())}>
                    {t(open ? "first.how.close" : "first.how")}
                  </button>
                )}
                {open && (
                  <div class="first-how" role="group" aria-label={t("first.how")}>
                    <span class="facts">
                      <span class="chip quiet">{t("first.how.from", AGENTS[s.from] ?? s.from)}</span>
                      {s.path && <code>{s.path}</code>}
                      {s.at && <span>{ago(A.L, s.at)}</span>}
                      <span>{t("first.how.on", computer)}</span>
                    </span>
                    {s.path && <Btn kind="text" size="sm" label={t("first.how.leave")} onClick={() => leave(s.path!)} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {fw.looked?.length && (fromRecords || !looks) ? (
        <div class="first-from">
          {looks ? (
            <>
              <span>{t("first.from", computer)}</span>
              <Btn kind="text" size="sm" label={t("first.stop")} onClick={() => set(false)} />
            </>
          ) : (
            <>
              <span>{t("first.stopped")}</span>
              <Btn kind="text" size="sm" label={t("first.again")} onClick={() => set(true)} />
            </>
          )}
        </div>
      ) : null}
      {(A.S.first?.noBrain || keyJustAdded()) && <KeyCard />}
    </div>
  );
}

const SHOWN_MS = 10_000;
let pending = "";
let last: { r: KeyResult; at: number } | undefined;
/** D307: where the key was pasted. One from Settings is answered there, not again in the conversation. */
let from: "conv" | "settings" = "conv";
/** D443: what is in the field, kept beside the answer so a good key clears it (as the Mac's
 *  keyResultNow does): the masked dots of a key that already went in are never left behind. */
let typed = "";
export const keyTyped = () => typed;
export function typeKey(v: string) {
  typed = v;
}

/** Sends the key once (key_add) and returns its clientId; nothing while an answer is awaited. */
export function submitKey(raw: string, here: "conv" | "settings"): string | undefined {
  const v = raw.trim();
  if (!v || pending) return undefined;
  pending = `key-${Date.now()}`;
  last = undefined;
  from = here;
  A.send({ t: "key_add", key: v, clientId: pending });
  A.changed();
  return pending;
}

function pickUp() {
  if (!pending) return;
  const r = A.S.keyResults.get(pending);
  if (!r) return;
  A.S.keyResults.delete(pending);
  // D440: "works, putting pi in place" is shown while the final answer is still awaited.
  if (!r.preparing) pending = "";
  last = { r, at: Date.now() };
  if (r.ok) typed = "";
  if (r.ok) setTimeout(() => A.changed(), SHOWN_MS + 50);
}

export function keyJustAdded(): boolean {
  pickUp();
  return from === "conv" && !!last?.r.ok && Date.now() - last.at < SHOWN_MS;
}

const say = (r: KeyResult) => (r.say ? words(r.say, A.L.lang) : r.ok ? t("key.paste.title") : t("key.paste.failed", r.detail ?? r.reason ?? ""));

/** The card: what to paste and why it's safe, a masked field, 检查 / Check, the partner's words.
 *  In Settings (D307) the row above it already says what it is: no title, and its answer stays there. */
export function KeyCard({ inSettings = false }: { inSettings?: boolean } = {}) {
  const here = inSettings ? "settings" : "conv";
  const [, redraw] = useState(0);
  pickUp();
  const key = typed;
  const setKey = (v: string) => {
    typed = v;
    redraw((n) => n + 1);
  };
  const r = last?.r;
  const waiting = !!pending;
  const submit = (raw = key) => void submitKey(raw, here);
  const mine = from === here;
  if (mine && r?.ok && !r.needs && !r.preparing && last && Date.now() - last.at < SHOWN_MS)
    return (
      <div class="key-card done" role="status">
        <p class="key-say">{say(r)}</p>
      </div>
    );
  return (
    <div class={`key-card${inSettings ? " in-settings" : ""}`}>
      {!inSettings && <h3>{t("key.paste.title")}</h3>}
      <p>{t("key.paste.body")}</p>
      <form
        class="key-row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          type="password"
          autocomplete="off"
          spellcheck={false}
          aria-label={t("key.paste.field")}
          placeholder={t("key.paste.eg")}
          value={key}
          onInput={(e) => setKey((e.currentTarget as HTMLInputElement).value)}
          onPaste={(e) => {
            // D440: a key pasted whole checks by itself.
            const v = (e.clipboardData?.getData("text") ?? "").trim();
            if (v.length < 20 || /\s/.test(v)) return;
            e.preventDefault();
            setKey(v);
            submit(v);
          }}
        />
        <Btn kind="primary" label={waiting ? t(mine && r?.preparing ? "key.paste.preparing" : "key.paste.checking") : t("key.paste.check")} onClick={() => submit()} disabled={waiting} />
      </form>
      {mine && r?.preparing && waiting && (
        <p class="key-say ok" role="status">
          {say(r)}
        </p>
      )}
      {!waiting && !r && <KeyRoutes />}
      {mine && r && !waiting && (
        <p class={`key-say${r.ok ? " ok" : " bad"}`} role={r.ok ? "status" : "alert"}>
          {say(r)}
        </p>
      )}
      {mine && r?.ok && r.needs === "pi" && r.install && <code class="key-install">{r.install}</code>}
    </div>
  );
}

/** D440: which way to a key the person is looking at (0: the best for where the home is). */
let routeAt = 0;

/**
 * D440: 还没有密钥？/ No key yet?, under the field while nothing can think: one way at a time,
 * the provider, what it costs and needs, three steps, one honest note, its own key page opened in
 * the browser, and the other way as a quiet link. The person makes the key there; Ducter never does.
 */
export function KeyRoutes() {
  const routes = A.S.first?.noBrain ? (A.S.first.keyRoutes ?? []) : [];
  if (!routes.length) return null;
  const rt = routes[routeAt % routes.length]!;
  const other = routes.length > 1 ? routes[(routeAt + 1) % routes.length]! : undefined;
  return (
    <div class="key-routes">
      <h4>{t("key.route.none")}</h4>
      <div class="key-route-head">
        <b>{words(rt.name, A.L.lang)}</b>
        <span>{words(rt.line, A.L.lang)}</span>
      </div>
      <ol class="key-route-steps">
        {rt.steps.map((s, i) => (
          <li key={`${rt.id}:${i}`}>
            <span class="key-route-n" aria-hidden="true">
              {i + 1}
            </span>
            <span>{words(s, A.L.lang)}</span>
          </li>
        ))}
      </ol>
      {rt.note && <p class="key-route-note">{words(rt.note, A.L.lang)}</p>}
      <div class="key-route-acts">
        <LinkBtn kind="secondary" href={rt.url} label={t("key.route.go", words(rt.name, A.L.lang))} />
        {other && (
          <Btn
            kind="text"
            size="sm"
            label={t("key.route.other", words(other.name, A.L.lang))}
            onClick={() => {
              routeAt = (routeAt + 1) % routes.length;
              A.changed();
            }}
          />
        )}
      </div>
    </div>
  );
}
