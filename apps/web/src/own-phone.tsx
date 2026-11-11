// D218: 用你自己的号码打 / Call from your own number, in Settings › Accounts (phone, iPad,
// Android, the web). One card, five steps that tick themselves off as the home sees them: the
// phone, its SIM, the cable, the live voice, a test call. Only the first open step is unfolded,
// so the card always says one next thing. Words from i18n-phone.ts (own.*); the Mac has the same
// card (apps/desktop/internal/views/ownphone.go).
import type { OwnPhoneView } from "@ducter/protocol";
import { prettyNumber } from "@ducter/protocol";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn, DangerButton, Seg, Toggle } from "./controls.tsx";
import { CallArt } from "./phone.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const money = (n: number) => `$${n.toFixed(2)}`;

type Step = "phone" | "sim" | "cable" | "voice" | "test";

/** Which steps are done (each a fact the home read), and the first one that isn't. */
export function ownSteps(v: OwnPhoneView): { done: Record<Step, boolean>; next?: Step } {
  const done: Record<Step, boolean> = {
    phone: v.phone?.state === "ready",
    sim: v.phone?.state === "ready" && v.sim?.state !== "absent" && v.sim?.state !== "locked" && !!v.number,
    cable: !!v.audio.input && !!v.audio.output && v.headset !== "no",
    voice: v.voice.key,
    test: v.test.state === "passed",
  };
  const next = (["phone", "sim", "cable", "voice", "test"] as Step[]).find((s) => !done[s]);
  return { done, ...(next ? { next } : {}) };
}

/** The cable, drawn: phone → splitter → (attenuator) → USB sound card → computer. Clay-flat, tokens only. */
export function CableArt() {
  return (
    <svg class="own-cable" viewBox="0 0 320 120" role="img" aria-label={t("own.parts.art")}>
      <rect x="10" y="18" width="46" height="84" rx="10" fill="var(--surface)" stroke="var(--ink-soft)" stroke-width="2.5" />
      <rect x="18" y="28" width="30" height="56" rx="4" fill="var(--working-surface)" />
      <circle cx="33" cy="92" r="3" fill="var(--ink-soft)" />
      <path d="M33 102 C33 112 70 112 82 100" fill="none" stroke="var(--ink-soft)" stroke-width="3" stroke-linecap="round" />
      <circle cx="88" cy="96" r="7" fill="var(--accent)" stroke="var(--ink-soft)" stroke-width="2" />
      <path d="M95 92 C120 70 140 54 168 50" fill="none" stroke="var(--done-dot)" stroke-width="3" stroke-linecap="round" />
      <path d="M95 100 C125 104 140 92 150 84" fill="none" stroke="var(--working-dot)" stroke-width="3" stroke-linecap="round" />
      <rect x="148" y="74" width="26" height="16" rx="5" fill="var(--waiting-surface)" stroke="var(--ink-soft)" stroke-width="2" />
      <path d="M174 82 C186 82 190 70 198 66" fill="none" stroke="var(--working-dot)" stroke-width="3" stroke-linecap="round" />
      <path d="M168 50 C182 50 190 56 198 58" fill="none" stroke="var(--done-dot)" stroke-width="3" stroke-linecap="round" />
      <rect x="198" y="48" width="40" height="26" rx="7" fill="var(--surface)" stroke="var(--ink-soft)" stroke-width="2.5" />
      <circle cx="210" cy="61" r="3" fill="var(--done-dot)" />
      <circle cx="226" cy="61" r="3" fill="var(--working-dot)" />
      <path d="M238 61 L258 61" stroke="var(--ink-soft)" stroke-width="3" stroke-linecap="round" />
      <rect x="258" y="30" width="54" height="40" rx="6" fill="var(--surface)" stroke="var(--ink-soft)" stroke-width="2.5" />
      <rect x="250" y="72" width="70" height="8" rx="4" fill="var(--sunken)" stroke="var(--ink-soft)" stroke-width="2" />
    </svg>
  );
}

function Mark({ state, n }: { state: "done" | "next" | "later"; n: number }) {
  if (state === "done")
    return (
      <svg class="own-mark done" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="10" fill="var(--done-surface)" />
        <path d="M6.5 11.4l3 3 6-6.6" fill="none" stroke="var(--done-ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    );
  return (
    <span class={`own-mark ${state}`} aria-hidden="true">
      {n}
    </span>
  );
}

function Cmd({ text }: { text: string }) {
  return <code class="own-cmd">{text}</code>;
}

function NumberField({ v }: { v: OwnPhoneView }) {
  const [n, setN] = useState(v.number ? prettyNumber(v.number) : "");
  return (
    <div class="own-row">
      <label class="acct-field" for="own-number">
        <span class="small">{t("own.number")}</span>
        <input id="own-number" type="tel" inputMode="tel" autoComplete="off" placeholder={t("own.number.hint")} value={n} class={A.ownAnswer === "number" ? "wrong" : undefined} onInput={(e) => setN((e.target as HTMLInputElement).value)} />
      </label>
      <Btn kind="secondary" size="sm" label={t("own.number.save")} disabled={!n.trim()} onClick={() => A.ownPhoneAct({ action: "number", number: n })} />
      {A.ownAnswer === "number" && <div class="small warn">{t("own.number.bad")}</div>}
    </div>
  );
}

function Picker({ label, list, value, on }: { label: string; list: string[]; value?: string; on: (v: string) => void }) {
  return (
    <label class="acct-field own-pick">
      <span class="small">{label}</span>
      <select value={value ?? ""} onChange={(e) => on((e.target as HTMLSelectElement).value)}>
        {!value && <option value="">{t("own.audio.pick")}</option>}
        {list.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </label>
  );
}

function Parts() {
  const [open, setOpen] = useState(false);
  return (
    <div class="own-parts">
      <Btn kind="text" size="sm" chev expanded={open} label={t("own.parts")} onClick={() => setOpen(!open)} />
      {open && (
        <>
          <CableArt />
          <ol class="small">
            {[1, 2, 3, 4].map((i) => (
              <li key={i}>{t(`own.parts.${i}`)}</li>
            ))}
          </ol>
          <div class="small sub">{t("own.parts.how")}</div>
        </>
      )}
    </div>
  );
}

function VoiceStep({ v }: { v: OwnPhoneView }) {
  const [engine, setEngine] = useState<"openai" | "qwen">(v.voice.engine);
  const [key, setKey] = useState("");
  if (v.voice.key)
    return (
      <div class="own-body">
        <div class="small">{t("own.voice.set", t(`own.voice.${v.voice.engine}`), v.voice.model, money(v.voice.perMinUsd))}</div>
        <div class="small sub">{t("own.voice.kept", v.where)}</div>
        <Btn kind="text" size="sm" label={t("own.voice.remove")} onClick={() => A.ownPhoneAct({ action: "key_remove" })} />
      </div>
    );
  return (
    <div class="own-body">
      <div class="small">{t("own.voice.why")}</div>
      <Seg<"openai" | "qwen"> label={t("own.step.voice")} value={engine} options={[{ v: "openai", label: t("own.voice.openai") }, { v: "qwen", label: t("own.voice.qwen") }]} onPick={setEngine} />
      <div class="small sub">{t(`own.voice.${engine}.help`)}</div>
      <div class="own-row">
        <label class="acct-field" for="own-key">
          <span class="small">{t("own.voice.key")}</span>
          <input id="own-key" type="password" autoComplete="off" autoCapitalize="off" spellcheck={false} value={key} class={A.ownAnswer === "key" ? "wrong" : undefined} onInput={(e) => setKey((e.target as HTMLInputElement).value)} />
        </label>
        <Btn kind="primary" size="sm" label={t("own.voice.save")} disabled={!key.trim()} onClick={() => (A.ownPhoneAct({ action: "key", engine, key }), setKey(""))} />
      </div>
      {A.ownAnswer === "key" && <div class="small warn">{t("own.voice.bad")}</div>}
      <div class="small sub">{t("own.voice.kept", v.where)}</div>
    </div>
  );
}

function TestStep({ v }: { v: OwnPhoneView }) {
  const [to, setTo] = useState(v.test.to ? prettyNumber(v.test.to) : "");
  const s = v.test.state;
  if (s === "calling" || s === "playing")
    return (
      <div class="own-body" aria-live="polite">
        <div class="small">{s === "calling" ? t("own.test.calling", prettyNumber(v.test.to ?? "")) : t("own.test.playing")}</div>
      </div>
    );
  if (s === "asking")
    return (
      <div class="own-body" aria-live="polite">
        <div class="small">{t("own.test.ask")}</div>
        <div class="phone-acts left">
          <Btn kind="primary" size="sm" label={t("own.test.yes")} onClick={() => A.ownPhoneAct({ action: "heard", heard: true })} />
          <Btn kind="secondary" size="sm" label={t("own.test.no")} onClick={() => A.ownPhoneAct({ action: "heard", heard: false })} />
        </div>
        {v.test.heardLine === false && <div class="small sub">{t("own.test.noline")}</div>}
      </div>
    );
  return (
    <div class="own-body">
      {s === "failed" && v.test.detail && <div class="small warn">{t(`own.test.fail.${v.test.detail}`)}</div>}
      {s === "never" && <div class="small">{t("own.test.why")}</div>}
      <div class="own-row">
        <label class="acct-field" for="own-test">
          <span class="small">{t("own.test.to")}</span>
          <input id="own-test" type="tel" inputMode="tel" autoComplete="off" placeholder={t("own.number.hint")} value={to} class={A.ownAnswer === "number" ? "wrong" : undefined} onInput={(e) => setTo((e.target as HTMLInputElement).value)} />
        </label>
        <Btn kind="primary" size="sm" label={t(s === "never" ? "own.test.go" : "own.test.again")} disabled={!to.trim()} onClick={() => A.ownPhoneAct({ action: "test", to })} />
      </div>
      {A.ownAnswer === "number" && <div class="small warn">{t("own.test.fail.number")}</div>}
    </div>
  );
}

function body(step: Step, v: OwnPhoneView) {
  switch (step) {
    case "phone":
      if (!v.adb)
        return (
          <div class="own-body">
            <div class="small">{t("own.adb")}</div>
            <Cmd text="brew install android-platform-tools" />
            <Btn kind="text" size="sm" label={t("own.scan")} onClick={() => A.ownPhoneAct({ action: "scan" })} />
          </div>
        );
      return (
        <div class="own-body" aria-live="polite">
          <div class="small">{!v.phone ? t("own.phone.none", v.where) : v.phone.state === "unauthorized" ? t("own.phone.allow") : t("own.phone.offline")}</div>
          <Btn kind="text" size="sm" label={t("own.scan")} onClick={() => A.ownPhoneAct({ action: "scan" })} />
        </div>
      );
    case "sim":
      return (
        <div class="own-body">
          {v.sim && v.sim.state !== "ready" && <div class="small warn">{t(`own.sim.${v.sim.state}`)}</div>}
          <NumberField v={v} />
        </div>
      );
    case "cable":
      return (
        <div class="own-body">
          <div class={`small${v.headset === "no" ? " warn" : ""}`}>{t(`own.headset.${v.headset}`)}</div>
          {!v.audio.tool ? (
            <>
              <div class="small">{t("own.audio.tool")}</div>
              <Cmd text="brew install ffmpeg" />
            </>
          ) : !v.audio.inputs.length ? (
            <div class="small">{t("own.audio.none")}</div>
          ) : (
            <div class="own-row">
              <Picker label={t("own.audio.in")} list={v.audio.inputs} value={v.audio.input} on={(input) => A.ownPhoneAct({ action: "audio", input })} />
              <Picker label={t("own.audio.out")} list={v.audio.outputs} value={v.audio.output} on={(output) => A.ownPhoneAct({ action: "audio", output })} />
            </div>
          )}
          <Parts />
          <Btn kind="text" size="sm" label={t("own.scan")} onClick={() => A.ownPhoneAct({ action: "scan" })} />
        </div>
      );
    case "voice":
      return <VoiceStep v={v} />;
    case "test":
      return <TestStep v={v} />;
  }
}

/** One done step's line: what the home saw. */
function doneLine(step: Step, v: OwnPhoneView): string {
  switch (step) {
    case "phone":
      return t("own.phone.ok", v.phone?.model ?? "Android", v.phone?.android ?? "");
    case "sim":
      return [v.sim?.carrier, v.number ? prettyNumber(v.number) : ""].filter(Boolean).join(" · ");
    case "cable":
      return v.audio.input === v.audio.output ? (v.audio.input ?? "") : `${v.audio.input} · ${v.audio.output}`;
    case "voice":
      return t("own.voice.set", t(`own.voice.${v.voice.engine}`), v.voice.model, money(v.voice.perMinUsd));
    case "test":
      return t("own.test.passed");
  }
}

export function OwnPhoneCard() {
  const v = A.ownPhone;
  const [forgetting, setForgetting] = useState(false);
  const [open, setOpen] = useState<Step | undefined>(undefined);
  if (!v) return null;
  const { done, next } = ownSteps(v);
  const steps: Step[] = ["phone", "sim", "cable", "voice", "test"];
  const shown = open ?? next;
  return (
    <section id="acct-own-phone" class="src-card phone-card own-card" aria-label={t("own.title")}>
      <div class="src-who">
        <CallArt off={!v.ready} size={96} />
        <h3>{t("own.title")}</h3>
        <div class="small sub">{v.ready ? t("own.ready") : t("own.lede")}</div>
      </div>
      {v.live && (
        <div class="own-live" role="status">
          <span class="dot" aria-hidden="true" />
          <span class="small grow">{t("own.live", v.live.name)}</span>
          <Btn kind="secondary" size="sm" label={t("call.hangup")} about={v.live.name} onClick={() => A.callCancel(v.live!.callId)} />
        </div>
      )}
      {v.busy && !v.live && <div class="small sub own-busy">{t("own.busy")}</div>}
      <ol class="own-steps">
        {steps.map((s, i) => {
          const isOpen = shown === s;
          const state = done[s] ? "done" : s === next ? "next" : "later";
          return (
            <li key={s} class={`own-step ${state}${isOpen ? " open" : ""}`}>
              <button class="own-step-top" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? (next === s ? s : undefined) : s)}>
                <Mark state={state} n={i + 1} />
                <span class="grow">
                  <span class="t">{t(`own.step.${s}`)}</span>
                  {done[s] && !isOpen && <span class="s">{doneLine(s, v)}</span>}
                </span>
              </button>
              {isOpen && body(s, v)}
            </li>
          );
        })}
      </ol>
      {v.ready && <Toggle label={t("own.prefer")} help={t("own.prefer.help")} checked={v.prefer} onChange={(on) => A.ownPhoneAct({ action: "prefer", on })} />}
      {v.ready && <div class="small sub center">{t("own.today", v.today, v.perDay)}</div>}
      <div class="small sub center">{t("own.where", v.where)}</div>
      <div class="small sub center">{t("own.rails")}</div>
      {(v.phone || v.voice.key) && (
        <div class="src-foot">
          {!forgetting ? (
            <DangerButton label={t("own.forget")} onClick={() => setForgetting(true)} />
          ) : (
            <div class="stop-ask" role="group">
              <div class="small">{t("own.forget.ask")}</div>
              <div class="acts">
                <Btn kind="text" size="sm" label={t("card.stop.keep")} onClick={() => setForgetting(false)} />
                <DangerButton label={t("own.forget.go")} onClick={() => (setForgetting(false), A.ownPhoneAct({ action: "forget" }))} />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
