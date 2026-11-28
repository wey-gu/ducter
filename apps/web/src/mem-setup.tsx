// D664: one Nowledge Mem setup, the same group on Settings › 记忆 / Memory and › Agent 通信 / Agent
// messaging (never two copies). The steps to get Mem working on this home as a checklist, each with
// its live state from the facts core reads (mem-setup-view.ts); the next step carries its one action
// and nothing after it pretends to be done. Done, it is one calm line with a way to reopen the steps.
// Live: looked at again when the pane opens, when the person comes back to it, and after an action,
// with the shared spinner while it looks; no polling loop. The Mac's twin is views/memsetup.go.
import type { BridgeView } from "@ducter/protocol";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { BrandTile } from "./brand.tsx";
import { Btn, Field, LinkBtn, SetupStep } from "./controls.tsx";
import { CopyLine } from "./lend.tsx";
import { memSetup, type MemSetupView, type SetupStep as Step } from "./mem-setup-view.ts";
import { GHead, Group } from "./set-grid.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const MEM_SITE = "https://mem.nowledge.co";
const word = (w: { key: string; args: string[] }) => t(w.key, ...w.args);

/** D404: the home's own words for a failed connect (bridge-link.ts), said in the person's language, never raw. */
export const FAILED_DETAILS: Record<string, string> = { "Mem answered with another identity or place": "bridge.failed.identity", "nmem didn't start": "bridge.failed.nostart" };
export const failedLine = (d?: string): string => (!d ? "" : FAILED_DETAILS[d] ? t(FAILED_DETAILS[d]!) : t("bridge.failed", d));
/** D646: a failed connect's reason alone, for the state table's line (the title already says 没连上). */
export const failedWhy = (d?: string): string => (!d ? "" : FAILED_DETAILS[d] ? t(FAILED_DETAILS[d]!) : d);

/** The setup as both panes read it, from what the client holds now. */
export function memSetupNow(mailbox: boolean): MemSetupView {
  const b = A.bridge;
  return memSetup(A.mem, b, { home: b?.home || A.homeName || "", partner: A.settings?.name ?? "", mailbox, checking: A.memChecking, why: failedWhy(b?.detail) });
}

/** A quiet disclosure under a step: the installer's or Mem's own words, never the line itself. */
function More({ label, text }: { label: string; text: string }) {
  return (
    <details class="mem-more">
      <summary>{label}</summary>
      <small>{text}</small>
    </details>
  );
}

/** The sign-in in place: the one-time link pasted, then 登录. */
function SignIn({ s, b }: { s: Step; b: BridgeView | undefined }) {
  const [link, setLink] = useState("");
  const home = b?.home || A.homeName || "";
  const go = () => {
    if (!link.trim()) return;
    A.signInBridgeMem(link.trim());
    setLink("");
  };
  return (
    <>
      {s.why && <small class="setup-why">{word(s.why)}</small>}
      <span class="setup-field">
        <Field value={link} label={t("bridge.mem.signin.link")} placeholder={t("bridge.mem.signin.ph")} onInput={setLink} onKeyDown={(e) => e.key === "Enter" && !e.isComposing && (e.preventDefault(), go())} />
        <Btn kind="primary" size="sm" disabled={!link.trim()} label={t(s.label ?? "bridge.mem.signin.go")} about={home} onClick={go} />
      </span>
      {s.account && (
        <>
          <small>{t("mem.step.account", home)}</small>
          <LinkBtn kind="text" size="sm" href={MEM_SITE} label={t("mem.step.account.go")} />
        </>
      )}
    </>
  );
}

/** The next step's one action. */
function Act({ s, b, onLook }: { s: Step; b: BridgeView | undefined; onLook: () => void }) {
  const home = b?.home || A.homeName || "Nowledge Mem";
  const label = s.label ? t(s.label) : "";
  switch (s.act) {
    case "install":
    case "update":
      return <Btn kind="primary" size="sm" label={label} about={home} onClick={() => A.installBridgeMem()} />;
    case "copy":
      return s.cmd ? <CopyLine text={s.cmd} kind="line" /> : null;
    case "open_mem":
      return <Btn kind="primary" size="sm" label={label} about={home} onClick={() => A.openBridgeMem()} />;
    case "connect":
      return <Btn kind="primary" size="sm" label={label} about={A.settings?.name ?? ""} onClick={() => A.connectBridge()} />;
    case "check_again":
      return <Btn kind="secondary" size="sm" label={label} about="Nowledge Mem" onClick={() => (onLook(), A.lookAtMemSetup(true))} />;
    case "sign_in":
      return <SignIn s={s} b={b} />;
  }
  return null;
}

/** The checklist: one SetupStep per step, the next one's action under its words. */
export function MemSetupSteps({ v }: { v: MemSetupView }) {
  const b = A.bridge;
  // D404: a look again that meets the same missing tool says so, instead of the same words coming back.
  const [tried, setTried] = useState<string>("");
  const key = (s: Step) => `${s.id}:${s.look}:${s.line?.key ?? ""}`;
  return (
    <ol class="setup-steps">
      {v.steps.map((s, i) => (
        <SetupStep key={s.id} n={i + 1} look={s.checking ? "busy" : s.look} title={word(s.title)} line={s.line ? word(s.line) : undefined} state={s.checking ? t("memsetup.checking") : t(`memsetup.look.${s.look}`)}>
          {s.also && <small>{word(s.also)}</small>}
          {tried === key(s) && s.id === "nmem" && s.look !== "busy" && <small class="mem-tried">{t("mem.retry.same")}</small>}
          {s.look !== "later" && s.look !== "busy" && s.look !== "done" && (
            <span class="setup-acts">
              <Act s={s} b={b} onLook={() => setTried(key(s))} />
            </span>
          )}
          {s.look === "later" && s.account && <LinkBtn kind="text" size="sm" href={MEM_SITE} label={t("mem.step.account.go")} />}
          {s.detail && <More label={t("bridge.mem.more")} text={s.detail} />}
          {s.fact && <More label={t("mem.details")} text={word(s.fact)} />}
        </SetupStep>
      ))}
    </ol>
  );
}

/**
 * D664: the Nowledge Mem group with its setup. Its head is Nowledge Mem's own (its mark, faded until
 * done), its line the setup's; the steps under it until all are done, then folded behind 每一步 /
 * Steps. intro: rows before the steps (what Nowledge Mem is, for someone who has never met it);
 * after: rows after them, told whether the steps are showing; foot: the group's last line.
 */
export function MemSetup(p: { mailbox?: boolean; intro?: ComponentChildren; after?: (stepsShown: boolean) => ComponentChildren; foot?: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  // Live: looked at again when the pane opens and whenever the person comes back to it.
  useEffect(() => {
    A.lookAtMemSetup();
    if (typeof addEventListener !== "function" || typeof document !== "object") return;
    const back = () => document.visibilityState === "visible" && A.lookAtMemSetup();
    addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
  }, []);
  const v = memSetupNow(!!p.mailbox);
  const shown = !v.done || open;
  return (
    <Group class="mem-g mem-setup" label="Nowledge Mem">
      <GHead tile={<BrandTile name="nowledge_mem" faded={!v.done} />} name="Nowledge Mem" line={word(v.head)} tone={v.tone === "muted" ? undefined : v.tone}>
        {v.done && <Btn kind="text" size="sm" chev expanded={open} label={t("memsetup.steps")} about="Nowledge Mem" onClick={() => setOpen(!open)} />}
      </GHead>
      {p.intro}
      {shown && <MemSetupSteps v={v} />}
      {p.after?.(shown)}
      {p.foot}
    </Group>
  );
}
