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
const VALUED = new Set(["--agent-context", "--body", "--body-file", "--cursor", "--to", "--query", "--wait", "--api-url", "--api", "--host", "--session-id", "--space-id"]);
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
    const id = verb === "open" ? positional[1] : positional.at(-1);
    const file = process.env.BRIDGE_GUARD_ALLOW;
    const allowed = file && existsSync(file) ? readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean) : [];
    if (!id || !allowed.includes(id))
      refuse(`Message ${id ?? "(none)"} is not from this run's Ducter: leave it unopened (opening marks it read in the person's own mailbox). Page with \`bridge inbox --cursor <next>\` and look for a message whose sender.agent_id is this run's Ducter.`);
  }
  const agent = process.env.BRIDGE_GUARD_TO;
  if (verb === "send" && agent) {
    const i = rest.indexOf("--to");
    const to = i >= 0 ? rest[i + 1] : rest.find((x) => x.startsWith("--to="))?.slice(5);
    const c = argv.indexOf("--agent-context");
    const ctx = c >= 0 ? argv[c + 1] : undefined;
    // Read-only: the cards Mem gives for this run's Ducter, the only ones the peer may send to.
    const q = Bun.spawnSync([real!, "--json", ...(ctx ? ["--agent-context", ctx] : []), "bridge", "contacts", "--query", agent], { env: process.env });
    let cards: string[] = [];
    try {
      const j = JSON.parse(q.stdout.toString());
      cards = [...(j?.contacts ?? []), ...(j?.cards ?? [])].filter((x: any) => !x?.agent_id || x.agent_id === agent).map((x: any) => String(x?.contact ?? ""));
    } catch {
      /* no answer: refused below */
    }
    if (!to || !cards.includes(to)) refuse(`Send only to this run's Ducter (\`bridge contacts --query ${agent}\`), never to another agent.`);
  }
}
note(false);
const p = Bun.spawn([real!, ...argv], { stdin: "inherit", stdout: "inherit", stderr: "inherit", env: process.env });
process.exit(await p.exited);
