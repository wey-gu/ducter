// D298: the partner's first words (what they offer, where they were read, 别再看了 / Stop
// looking) and the pasted-key card, the same as the Mac's (views/firstwords.go). A start fills
// the composer; it never sends. The key goes once in key_add and is never shown again.
import { words, type FirstWords, type KeyResult } from "@ducter/protocol";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn } from "./controls.tsx";
const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

const AGENTS: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", pi: "pi" };

/** Still at the very start: the first words, nothing said back yet. */
export const firstOpening = () => A.S.first?.visit === "first";

export function FirstAfter({ fw }: { fw: FirstWords }) {
  const looks = A.S.first ? A.S.first.looks !== false : true;
  const starts = fw.starts.filter((s) => s.from === "everyday" || looks);
  const set = (on: boolean) => {
    A.send({ t: "local_agents", on });
    if (A.S.first) A.S.first.looks = on;
    A.changed();
  };
  return (
    <div class="first-after">
      {starts.length > 0 && (
        <div class="first-starts">
          {starts.map((s) => (
            <button
              key={s.id}
              class="btn secondary suggest"
              onClick={() => {
                A.draft = s.draft; // fills the composer; never sends
                A.changed();
                document.getElementById("composer")?.focus();
              }}
            >
              {s.words}
            </button>
          ))}
        </div>
      )}
      {fw.looked?.length ? (
        <div class="first-from">
          {looks ? (
            <>
              <span>{t("first.from", fw.looked.map((a) => AGENTS[a] ?? a).join(t("first.from.and")))}</span>
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

function pickUp() {
  if (!pending) return;
  const r = A.S.keyResults.get(pending);
  if (!r) return;
  A.S.keyResults.delete(pending);
  pending = "";
  last = { r, at: Date.now() };
  if (r.ok) setTimeout(() => A.changed(), SHOWN_MS + 50);
}

export function keyJustAdded(): boolean {
  pickUp();
  return !!last?.r.ok && Date.now() - last.at < SHOWN_MS;
}

const say = (r: KeyResult) => (r.say ? words(r.say, A.L.lang) : r.ok ? t("key.paste.title") : t("key.paste.failed", r.detail ?? r.reason ?? ""));

/** The card: what to paste and why it's safe, a masked field, 检查 / Check, the partner's words. */
export function KeyCard() {
  const [key, setKey] = useState("");
  pickUp();
  const r = last?.r;
  const waiting = !!pending;
  const submit = () => {
    const v = key.trim();
    if (!v || waiting) return;
    pending = `key-${Date.now()}`;
    last = undefined;
    A.send({ t: "key_add", key: v, clientId: pending });
    A.changed();
  };
  if (r?.ok && !r.needs && last && Date.now() - last.at < SHOWN_MS)
    return (
      <div class="key-card done" role="status">
        <p class="key-say">{say(r)}</p>
      </div>
    );
  return (
    <div class="key-card">
      <h3>{t("key.paste.title")}</h3>
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
        />
        <Btn kind="primary" label={waiting ? t("key.paste.checking") : t("key.paste.check")} onClick={submit} disabled={waiting} />
      </form>
      {r && !waiting && (
        <p class={`key-say${r.ok ? " ok" : " bad"}`} role={r.ok ? "status" : "alert"}>
          {say(r)}
        </p>
      )}
      {r?.ok && r.needs === "pi" && r.install && <code class="key-install">{r.install}</code>}
    </div>
  );
}
