// D664: one Nowledge Mem setup for Settings › 记忆 / Memory and › Agent 通信 / Agent messaging. The
// steps to get Mem working on this home as a checklist, each step's live state read from the facts
// core already sends (the settings frame's bridge view and Mem view), never guessed. Pure, so both
// panes, the phone and the tests read it the same way; the Mac's twin is memSetupOf in
// apps/desktop/internal/views/memsetup.go. The words for a Mem problem are D646's table
// (memStateView): a step that fails says what the table says, with the table's one action.
import type { BridgeView, MemView } from "@ducter/protocol";
import { MEM_MIN, memStateView, type MemWord } from "./mem-view.ts";

/** The steps, in order (the mailbox before the name, only where Agent messaging needs it). */
export type SetupStepId = "nmem" | "signin" | "space" | "name" | "mailbox";
/**
 * How a step stands: done (a fact says so), now (the next one, not yet), failed (the next one, and
 * why in words), busy (running, or being looked at again: the shared spinner), later (after the
 * next one: it claims nothing until the ones before it are done).
 */
export type SetupLook = "done" | "now" | "failed" | "busy" | "later";
/**
 * The next step's one action: Ducter installs or updates Mem, a line to copy (looked at again when
 * the person comes back), open the Mem app, the sign-in field in place, look again, connect.
 */
export type SetupAct = "install" | "copy" | "update" | "open_mem" | "sign_in" | "check_again" | "connect" | "none";
export type SetupStep = {
  id: SetupStepId;
  look: SetupLook;
  title: MemWord;
  line?: MemWord;
  act: SetupAct;
  /** The action's label key. */
  label?: string;
  /** copy: the line to run on the home. */
  cmd?: string;
  /** The installer's or Mem's own words, behind 细节 / Details (never the line itself). */
  detail?: string;
  /** failed sign-in: why the last link didn't take, in the person's words. */
  why?: MemWord;
  /** sign_in now: this step needs a Nowledge Mem account (the sign-up link beside it). */
  account?: true;
  /** A refusal's name to repeat to Mem's people, behind 详情 (D646's fact). */
  fact?: MemWord;
  /** One more quiet line under the step's own (a newer Mem out, D646). */
  also?: MemWord;
  /** The next step while a look again is under way: its mark is the spinner; its words and action stay. */
  checking?: true;
};
export type MemSetupView = {
  steps: SetupStep[];
  /** Every step done: the group is one calm line (head) with a way to reopen the steps. */
  done: boolean;
  /** The head's line: connected and where, or how many steps are left, or that one didn't go through. */
  head: MemWord;
  tone: "done" | "bad" | "muted";
};

export type MemSetupOpts = {
  /** The home's name (the computer Mem is on). */
  home: string;
  /** The partner's name, for the name step before Mem has bound it. */
  partner: string;
  /** Agent messaging: the mailbox step is part of the setup. */
  mailbox?: boolean;
  /** A look again is under way: the next step (if any) shows the spinner. */
  checking?: boolean;
  /** A failed connect's reason, already in the person's words (memory.tsx failedWhy). */
  why?: string;
};

const w = (key: string, ...args: string[]): MemWord => ({ key, args });

const WHERE: Record<string, string> = { cloud: "mem.app.kept.cloud", local: "mem.app.kept.local", server: "mem.app.kept.server" };

/** Step 1: Nowledge Mem's command line on the home, and its version. */
function nmemStep(mem: MemView | undefined, b: BridgeView | undefined, home: string, why: string): SetupStep {
  const id = "nmem" as const;
  if (!b) {
    if (mem?.state === "connected") return { id, look: "done", title: w("mem.step.done"), line: w("memsetup.nmem.on", home), act: "none" };
    return { id, look: "now", title: w("mem.step.install"), line: w("memsetup.nmem.unseen", home), act: "check_again", label: "mem.health.again" };
  }
  switch (b.state) {
    case "install_mem": {
      if (b.detail) return { id, look: "failed", title: w("mem.step.install"), line: w("bridge.mem.install.failed"), act: b.canRun ? "install" : b.cmd ? "copy" : "check_again", label: b.canRun ? "bridge.retry" : b.cmd ? undefined : "mem.health.again", ...(b.cmd && !b.canRun ? { cmd: b.cmd } : {}), detail: b.detail };
      if (b.canRun) return { id, look: "now", title: w("mem.step.install"), line: w("bridge.mem.install", home), act: "install", label: "bridge.mem.install.go" };
      if (b.cmd) return { id, look: "now", title: w("mem.step.install"), line: w("memsetup.nmem.run", home), act: "copy", cmd: b.cmd };
      return { id, look: "now", title: w("mem.step.install"), line: w("memsetup.nmem.how", home), act: "check_again", label: "mem.health.again" };
    }
    case "installing":
      return { id, look: "busy", title: w("mem.step.install"), line: w("bridge.mem.installing", home), act: "none" };
    case "update_mem": {
      const v = b.version ?? "";
      const line = b.canRun ? w("bridge.mem.update", home, v, MEM_MIN) : b.need === "app" || !b.version ? w("bridge.update", home) : w("bridge.mem.update.other", home, v, MEM_MIN);
      return { id, look: "failed", title: w("mem.update.needed"), line, act: b.canRun ? "update" : "check_again", label: b.canRun ? (b.detail ? "bridge.retry" : "mem.health.old.go") : "mem.health.again", ...(b.detail ? { detail: b.detail } : {}) };
    }
    case "updating":
      return { id, look: "busy", title: w("mem.step.done"), line: w(b.upkeep?.kind === "move" ? "bridge.mem.moving" : "bridge.mem.updating", home), act: "none" };
    case "mem_closed":
      return b.canOpen
        ? { id, look: "failed", title: w("bridge.mem.closed"), line: w("bridge.mem.closed.open", home), act: "open_mem", label: "bridge.mem.open" }
        : { id, look: "failed", title: w("bridge.mem.closed"), line: w("bridge.mem.closed.there", home), act: "check_again", label: "mem.health.again" };
  }
  // Mem's own doctor says this nmem is too old to say how it is (D375): the table's line and action.
  const sv = memStateView(mem, b, home, why);
  if (sv && (sv.state === "old" || sv.state === "old_elsewhere"))
    return { id, look: "failed", title: sv.title, line: sv.line, act: sv.action === "update" ? "update" : "check_again", label: sv.action === "update" ? sv.act : "mem.health.again" };
  return { id, look: "done", title: w("mem.step.done"), line: b.version ? w("memsetup.nmem.version", home, b.version) : w("memsetup.nmem.on", home), act: "none" };
}

/** Step 2: signed in to the person's Nowledge Mem, and where it keeps things. */
function signinStep(mem: MemView | undefined, b: BridgeView | undefined, home: string, why: string): SetupStep {
  const id = "signin" as const;
  if (!b) return mem?.state === "connected" ? { id, look: "done", title: w("memsetup.signin.done"), act: "none" } : { id, look: "later", title: w("mem.step.signin"), act: "none" };
  if (b.state === "sign_in") {
    const said = b.signIn === "used" ? w("bridge.mem.signin.used") : b.signIn === "bad" ? w("bridge.mem.signin.bad") : b.signIn === "failed" ? w("bridge.mem.signin.failed", b.detail ?? "") : undefined;
    return said
      ? { id, look: "failed", title: w("mem.step.signin"), line: w("bridge.mem.signin", home), why: said, act: "sign_in", label: "bridge.mem.signin.go" }
      : { id, look: "now", title: w("mem.step.signin"), line: w("bridge.mem.signin", home), act: "sign_in", label: "bridge.mem.signin.go", account: true };
  }
  if (b.state === "signing_in") return { id, look: "busy", title: w("mem.step.signin"), line: w("bridge.mem.signin.busy"), act: "none" };
  const sv = memStateView(mem, b, home, why);
  // D375: a lapsed sign-in says where the new link comes from, under its line.
  if (sv?.state === "signed_out") return { id, look: "failed", title: sv.title, line: sv.line, also: w("mem.health.resign.how"), act: "sign_in", label: sv.act };
  if (sv?.state === "unreachable") return { id, look: "failed", title: w(sv.title.key, home), line: sv.line, act: "check_again", label: sv.act };
  const where = b.where ? WHERE[b.where] : b.state === "local_mem" ? WHERE.local : undefined;
  return { id, look: "done", title: w("memsetup.signin.done"), ...(where ? { line: where === WHERE.local ? w(where, home) : w(where) } : {}), act: "none" };
}

/**
 * Step 3: a place in Mem only the person can see (Mem's own word for it stays out of the copy). It is
 * a step Bridge needs (D269): on Agent messaging it can fail, with the table's one action; on Memory
 * it shows only as a fact once Mem names the place (memory itself writes without it).
 */
function spaceStep(mem: MemView | undefined, b: BridgeView | undefined, mailbox: boolean): SetupStep | undefined {
  const id = "space" as const;
  if (!b) return mailbox ? { id, look: mem?.state === "connected" ? "done" : "later", title: w(mem?.state === "connected" ? "memsetup.space.done" : "memsetup.space"), act: "none" } : undefined;
  if (b.space?.label) return { id, look: "done", title: w("memsetup.space.done"), line: w("memsetup.space.line", b.space.label), act: "none" };
  if (!mailbox) return undefined;
  if (b.state === "local_mem") return { id, look: "failed", title: w("bridge.mem.local.title"), line: w("bridge.mem.local", b.home ?? ""), act: "connect", label: "bridge.retry" };
  if (b.state === "no_space") return { id, look: "failed", title: w("bridge.no_space.title"), line: w("bridge.no_space"), act: "check_again", label: "mem.health.again" };
  // Core only reaches these states once Mem named the place (bridge-link.ts: no place is no_space).
  if (PAST_SPACE.includes(b.state)) return { id, look: "done", title: w("memsetup.space.done"), act: "none" };
  return { id, look: "now", title: w("memsetup.space"), line: w("memsetup.space.wait"), act: "check_again", label: "mem.health.again" };
}

const PAST_SPACE: readonly string[] = ["ready", "connecting", "connected", "disconnecting", "elsewhere", "refused", "failed", "unconfirmed"];

/** The last step: the partner's name in Mem (bound by Ducter the first time Mem answers, D141). */
function nameStep(mem: MemView | undefined, partner: string): SetupStep {
  const id = "name" as const;
  if (mem?.keptUnder) return { id, look: "done", title: w("memsetup.name.done", mem.keptUnder), line: w("memsetup.name.line"), act: "none" };
  return { id, look: "now", title: w("memsetup.name"), line: w("memsetup.name.wait", partner), act: "check_again", label: "mem.health.again" };
}

/** Step 4, Agent messaging only: the mailbox the person's agents reach the partner through. */
function mailboxStep(mem: MemView | undefined, b: BridgeView | undefined, home: string, why: string, partner: string): SetupStep {
  const id = "mailbox" as const;
  const title = w("memsetup.mailbox");
  switch (b?.state) {
    case "connected":
    case "disconnecting":
    case "elsewhere": // D324: the mailbox is there; another home reads it (its own row says where)
      return { id, look: "done", title: w("memsetup.mailbox.done"), act: "none" };
    case "connecting":
      return { id, look: "busy", title, line: w("peers.joining", partner), act: "none" };
    case "ready":
      return b.asks ? { id, look: "now", title, line: w("memsetup.mailbox.asks"), act: "connect", label: "memsetup.mailbox.go" } : { id, look: "busy", title, line: w("peers.joining", partner), act: "none" };
    case "refused":
    case "failed":
    case "unconfirmed": {
      const sv = memStateView(mem, b, home, why)!;
      // D646: a newer Mem adds one quiet line, never a second button (the update is Memory's).
      return { id, look: "failed", title: sv.title, line: sv.line, act: sv.action === "none" ? "none" : "connect", ...(sv.action === "none" ? {} : { label: sv.act }), ...(sv.fact ? { fact: sv.fact } : {}), ...(b.newer !== undefined ? { also: w("peers.mem.newer") } : {}) };
    }
  }
  return { id, look: "now", title, line: w("memsetup.mailbox.wait"), act: "none" };
}

/**
 * The setup, from the settings frame alone. The first step not done is the next one: it carries its
 * one action; every step after it is later and claims nothing. A look again under way turns the next
 * step's mark into the spinner. All done: one calm line, the home named.
 */
export function memSetup(mem: MemView | undefined, b: BridgeView | undefined, o: MemSetupOpts): MemSetupView {
  const why = o.why ?? "";
  // The name comes last: Ducter takes it by itself and nothing waits on it (D141).
  const space = spaceStep(mem, b, !!o.mailbox);
  const raw: SetupStep[] = [nmemStep(mem, b, o.home, why), signinStep(mem, b, o.home, why), ...(space ? [space] : []), ...(o.mailbox ? [mailboxStep(mem, b, o.home, why, o.partner)] : []), nameStep(mem, o.partner)];
  const steps: SetupStep[] = [];
  let next = -1;
  for (const s of raw) {
    if (next >= 0) {
      // After the next step: its own words as a title, no line that claims a state, no action.
      // D554: the sign-in says, even before its turn, that it needs a Nowledge Mem account.
      steps.push({ id: s.id, look: "later", title: laterTitle(s.id), act: "none", ...(s.id === "signin" ? { line: w("mem.step.account", o.home), account: true as const } : {}) });
      continue;
    }
    if (s.look === "done") {
      steps.push(s);
      continue;
    }
    next = steps.length;
    steps.push(o.checking && s.look !== "busy" ? { ...s, checking: true } : s);
  }
  const done = next < 0;
  const left = done ? 0 : steps.length - next;
  const failed = !done && raw[next]!.look === "failed";
  return {
    steps,
    done,
    head: done ? w("memsetup.done", o.home) : failed ? w("memsetup.head.failed") : left === 1 ? w("memsetup.head.one") : w("memsetup.head.left", String(left)),
    tone: done ? "done" : failed ? "bad" : "muted",
  };
}

/** A later step says only what it is, the same words whatever it will turn out to be. */
const LATER: Record<SetupStepId, string> = { nmem: "mem.step.install", signin: "mem.step.signin", space: "memsetup.space", name: "memsetup.name", mailbox: "memsetup.mailbox" };
const laterTitle = (id: SetupStepId): MemWord => w(LATER[id]);
