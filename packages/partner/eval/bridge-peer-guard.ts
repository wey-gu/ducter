#!/usr/bin/env bun
// D367: the `nmem` the live trial's peer (a real `claude -p`) runs. The peer's native Claude Code
// session reads the person's REAL Claude Code mailbox, which holds older mail from other days. In
// the 2026-11-18 trial the peer opened 20 of those older messages (each open marks it read in the
// person's mailbox) and answered an old one, from the person's own Ducter, instead of this run's
// question (research/137). So:
//   - `bridge open` and `bridge reply` only on a message this run's Ducter sent (the ids the trial
//     writes to BRIDGE_GUARD_ALLOW, one per line, before each peer turn);
//   - `bridge send` only to a card that `contacts --query <this run's Ducter>` gives (BRIDGE_GUARD_TO);
//   - only the verbs the scenarios need (contacts, send, inbox, open, reply): never one that could
//     acknowledge, archive or delete the person's own mail;
//   - anything else passes to the real CLI (BRIDGE_GUARD_REAL, the trial's recording tee).
// A refusal answers like Mem's own (JSON on stdout, exit 1) and says what to do instead.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { refMessage } from "./bridge-trial.ts";

const argv = process.argv.slice(2);
const real = process.env.BRIDGE_GUARD_REAL;
if (!real) {
  console.error("BRIDGE_GUARD_REAL is not set");
  process.exit(2);
}
// Every call is logged (bodies left out), refused or not: the trial checks the peer's calls came through here.
const note = (refused: boolean) => {
  if (process.env.BRIDGE_GUARD_LOG) appendFileSync(process.env.BRIDGE_GUARD_LOG, JSON.stringify({ refused, argv: argv.filter((_, i) => argv[i - 1] !== "--body") }) + "\n");
};
const refuse = (detail: string) => {
  note(true);
  console.log(JSON.stringify({ error_code: "trial_guard_refused", detail, outcome_unknown: false }));
  process.exit(1);
};

// Flags that take a value: their value is never the message id.
const VALUED = new Set(["--agent-context", "--body", "--body-file", "--cursor", "--to", "--query", "--wait", "--api-url", "--api", "--host", "--session-id", "--space-id", "--space", "--resolved-space-id"]);
// A flag's value, as `--flag value` or `--flag=value` (Mem's `send_args_prefix` uses the second, D369).
const flagIn = (list: string[], flag: string): string | undefined => {
  const i = list.indexOf(flag);
  if (i >= 0) return list[i + 1];
  return list.find((x) => x.startsWith(`${flag}=`))?.slice(flag.length + 1);
};
// D369: the cards Mem gives for this run's Ducter (read-only), asked as the peer's own context. Mem's
// side sometimes answers 503 `feature_policy_unavailable` (2026-11-18): asked up to three times.
const cardsFor = (agent: string, ctx: string | undefined): string[] => {
  for (let n = 0; n < 3; n++) {
    const q = Bun.spawnSync([real!, "--json", ...(ctx ? ["--agent-context", ctx] : []), "bridge", "contacts", "--query", agent], { env: process.env });
    try {
      const j = JSON.parse(q.stdout.toString());
      const list = [...(Array.isArray(j?.contacts) ? j.contacts : []), ...(Array.isArray(j?.cards) ? j.cards : [])];
      if (list.length || q.exitCode === 0) return list.filter((x: any) => !x?.agent_id || x.agent_id === agent).map((x: any) => String(x?.contact ?? ""));
    } catch {
      /* not JSON: asked again */
    }
    Bun.sleepSync(500 * (n + 1));
  }
  return [];
};
const at = argv.indexOf("bridge");
if (at >= 0) {
  const rest = argv.slice(at + 1);
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (VALUED.has(a)) i++;
    else if (!a.startsWith("-")) positional.push(a);
  }
  const verb = positional[0];
  if (verb && !["contacts", "send", "inbox", "open", "reply", "setup", "session", "--help"].includes(verb)) refuse(`The trial allows only contacts, send, inbox, open and reply; \`${verb}\` would change the person's own mailbox.`);
  if (verb === "open" || verb === "reply") {
    // D411: Mem's own argv names the message by its `bm1:` reference; the allow list holds ids.
    const id = refMessage(verb === "open" ? positional[1] : positional.at(-1));
    const file = process.env.BRIDGE_GUARD_ALLOW;
    const allowed = file && existsSync(file) ? readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean) : [];
    if (!id || !allowed.includes(id))
      refuse(`Message ${id ?? "(none)"} is not from this run's Ducter: leave it unopened (opening marks it read in the person's own mailbox). Page with \`bridge inbox --cursor <next>\` and look for a message whose sender.agent_id is this run's Ducter.`);
  }
  const agent = process.env.BRIDGE_GUARD_TO;
  if (verb === "send" && agent) {
    const to = flagIn(rest, "--to");
    // 2026-11-18: the peer sent with the card's own `send_args_prefix` (`--agent-context=<ctx>`), the
    // guard asked contacts with no context, Mem asked which Space, and a right send was refused.
    const ctx = flagIn(argv, "--agent-context") ?? process.env.NMEM_AGENT_CONTEXT;
    const cards = cardsFor(agent, ctx);
    if (!to || !cards.includes(to)) refuse(`Send only to this run's Ducter (\`bridge contacts --query ${agent}\`), never to another agent.`);
  }
}
note(false);
const p = Bun.spawn([real!, ...argv], { stdin: "inherit", stdout: "inherit", stderr: "inherit", env: process.env });
process.exit(await p.exited);
