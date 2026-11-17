// D218: 用你自己的号码打 / Call from your own number, in Settings › Accounts (phone, iPad,
// Android, the web). One card, five steps that tick themselves off as the home sees them: the
// phone, its SIM, the cable, the live voice, a test call. Only the first open step is unfolded,
// so the card always says one next thing. Words from i18n-phone.ts (own.*); the Mac has the same
// card (apps/desktop/internal/views/ownphone.go).
// D278: a server home (a VPS) is never the place for the phone: the card there shows no steps, says
// what works today (你来打 / You call: the sheet and one tap to dial) and plainly why a live call on
// the person's own number needs a computer beside the phone. Install lines are only ever the home's
// own system's, and 再找一次 always answers: a short busy state, then 看过了 · 20:14 with what it saw.
import type { OwnPhoneView } from "@ducter/protocol";
import { prettyNumber } from "@ducter/protocol";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { Fragment } from "preact";
import { Btn, DangerButton, Facts, OpenRow, Seg, Toggle } from "./controls.tsx";
import { GBlock, GConfirm, GFoot, GHead, GRow, Group, Tag, Tile } from "./set-grid.tsx";
import { clock, shownDeviceName } from "./format.ts";
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

/** D278: the one install line for the home's own system; none where Ducter can't say it rightly. */
export function installLine(os: OwnPhoneView["os"], tool: "adb" | "ffmpeg"): string | undefined {
  if (os === "mac") return tool === "adb" ? "brew install android-platform-tools" : "brew install ffmpeg";
  if (os === "linux") return tool === "adb" ? "sudo apt install adb" : "sudo apt install ffmpeg";
  return undefined;
}

/** D278: what the last look saw, said with when and on which computer ("MacBook 上还没看到手机", and 20:14 as its own fact; D291). */
export function lookedLine(v: OwnPhoneView): { saw: string; at: string } | undefined {
  if (!v.lookedAt) return undefined;
  const saw = !v.adb ? t("own.saw.noadb", v.where) : !v.phone ? t("own.saw.none", v.where) : v.phone.state === "unauthorized" ? t("own.saw.allow") : t("own.saw.phone", v.phone.model);
  return { saw, at: clock(v.lookedAt) };
}

function Cmd({ text }: { text: string }) {
  return <code class="own-cmd">{text}</code>;
}

/** The install line for this home's system, with the note for other Linux systems. */
function Install({ v, tool }: { v: OwnPhoneView; tool: "adb" | "ffmpeg" }) {
  const line = installLine(v.os, tool);
  if (!line) return null;
  return (
    <>
      <Cmd text={line} />
      {v.os === "linux" && <div class="small sub">{t("own.cmd.distro", tool)}</div>}
    </>
  );
}

/** 再找一次 / Look again: busy while it looks, then when it looked and what it saw. */
function Look({ v }: { v: OwnPhoneView }) {
  const line = lookedLine(v);
  return (
    <div class="own-look" aria-live="polite">
      <Btn kind="text" size="sm" label={t(v.looking ? "own.looking" : "own.scan")} disabled={!!v.looking} onClick={() => A.ownPhoneAct({ action: "scan" })} />
      {!v.looking && line && <Facts class="small sub own-looked" items={[line.saw, <time class="own-looked-at">{t("own.looked.at", line.at)}</time>]} />}
    </div>
  );
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
            <Install v={v} tool="adb" />
            <Look v={v} />
          </div>
        );
      return (
        <div class="own-body" aria-live="polite">
          <div class="small">{!v.phone ? t("own.phone.none", v.where) : v.phone.state === "unauthorized" ? t("own.phone.allow") : t("own.phone.offline")}</div>
          <Look v={v} />
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
              <Install v={v} tool="ffmpeg" />
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
          <Look v={v} />
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
      // D291: a phrase, never facts joined with " · ".
      return v.sim?.carrier && v.number ? t("own.sim.line", v.sim.carrier, prettyNumber(v.number)) : v.number ? prettyNumber(v.number) : (v.sim?.carrier ?? "");
    case "cable":
      return v.audio.input === v.audio.output ? (v.audio.input ?? "") : t("own.cable.both", v.audio.input, v.audio.output);
    case "voice":
      return t("own.voice.set", t(`own.voice.${v.voice.engine}`), v.voice.model, money(v.voice.perMinUsd));
    case "test":
      return t("own.test.passed");
  }
}

/** D278: the Ducter apps on the person's Android phones that can dial a call sheet now. */
export const dialers = () => (A.reach?.clients ?? []).filter((c) => c.connected && c.handset?.dial);

/**
 * D278, D289: the group on a home that can't be the computer beside the phone (a server): no steps,
 * never "plug it in here". What works today (you call) in its first row, which phone dials in the
 * next, and the last line: what speaking on your own number needs, with 即将推出 as a quiet tag.
 */
function AwayCard({ v }: { v: OwnPhoneView }) {
  const d = dialers()[0];
  return (
    <Group id="acct-own-phone" label={t("own.title")}>
      <GHead tile={<Tile faded><CallArt off size={40} /></Tile>} name={t("own.title")} line={t("own.away.lede")} />
      <GRow title={t("own.away.how")} line={d ? t("own.away.dial", shownDeviceName(d.name)) : t("own.away.nodial")} />
      <GFoot note={t("own.away.why", v.where)}>
        <Tag text={t("own.away.soon")} />
      </GFoot>
    </Group>
  );
}

export function OwnPhoneCard() {
  const v = A.ownPhone;
  const [forgetting, setForgetting] = useState(false);
  const [open, setOpen] = useState<Step | undefined>(undefined);
  if (!v) return null;
  if (v.station === false) return <AwayCard v={v} />;
  const { done, next } = ownSteps(v);
  const steps: Step[] = ["phone", "sim", "cable", "voice", "test"];
  const shown = open ?? next;
  // D289: one group: how it stands, a row per step (its mark in the tile column, the open one's body
  // on the text column), the switch once ready, and the last line with the quiet forget.
  return (
    <Group id="acct-own-phone" label={t("own.title")}>
      <GHead tile={<Tile faded={!v.ready}><CallArt off={!v.ready} size={40} /></Tile>} name={t("own.title")} line={v.ready ? t("own.ready") : t("own.lede")} tone={v.ready ? "done" : undefined} />
      {v.live && (
        <GRow tile={<Tile><span class="own-live-dot" /></Tile>} title={t("own.live", v.live.name)}>
          <Btn kind="secondary" size="sm" label={t("call.hangup")} about={v.live.name} onClick={() => A.callCancel(v.live!.callId)} />
        </GRow>
      )}
      {v.busy && !v.live && (
        <GBlock>
          <div class="small sub">{t("own.busy")}</div>
        </GBlock>
      )}
      {steps.map((s, i) => {
        const isOpen = shown === s;
        const state = done[s] ? "done" : s === next ? "next" : "later";
        return (
          <Fragment key={s}>
            <OpenRow tile={<Tile><Mark state={state} n={i + 1} /></Tile>} title={t(`own.step.${s}`)} line={done[s] && !isOpen ? doneLine(s, v) : undefined} open={isOpen} onClick={() => setOpen(isOpen ? (next === s ? s : undefined) : s)} />
            {isOpen && <GBlock>{body(s, v)}</GBlock>}
          </Fragment>
        );
      })}
      {v.ready && <Toggle label={t("own.prefer")} help={`${t("own.prefer.help")} ${t("own.today", v.today, v.perDay)}`} checked={v.prefer} onChange={(on) => A.ownPhoneAct({ action: "prefer", on })} />}
      {!forgetting ? (
        <GFoot note={t("own.foot", v.where)}>{(v.phone || v.voice.key) && <DangerButton quiet label={t("own.forget")} onClick={() => setForgetting(true)} />}</GFoot>
      ) : (
        <GConfirm ask={t("own.forget.ask")} keep={t("card.stop.keep")} go={t("own.forget.go")} onKeep={() => setForgetting(false)} onGo={() => (setForgetting(false), A.ownPhoneAct({ action: "forget" }))} />
      )}
    </Group>
  );
}
