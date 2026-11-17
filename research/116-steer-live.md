# 116: A steer's echo, live on each agent

**Question (D325 follow-ups).** While a task works, Return steers, and the runner marks the steer
read when the agent's own echo of the words comes back through OAR (`user_message`, mapped to
`user_echo` in `packages/runner/src/normalize.ts`). Two things were unchecked: does the echo come
on a real agent, and does it come at the step where the agent actually reads the words (not
earlier, not later)? And which id does it carry, so the runner can match by id rather than by
text?

**Date:** 2026-11-17. OAR 0.95.1 (`@botiverse/oar`), Claude Code 2.1.326, Codex CLI 0.169.0,
pi 1.5.2. DeepSeek Harness is not installed on this Mac, so it was not run.

## Method

- A scratch script (in the session scratchpad, not in git) drove `createOarHarnessPort` from
  `packages/runner/src/oar.ts` directly, the same port the runner uses, with
  `isolateUserConfig: true` (no user plugins, hooks or MCP servers), `permissionMode: "bypass"`,
  no MCP servers, and a fresh working folder under the scratchpad for each run.
- **The task:** "create three files one at a time: a.txt containing apple, then b.txt containing
  banana, then c.txt containing cherry; one tool call per file". **The steer**, sent right after the
  first tool call ended, with a fresh UUID as OAR's `inputId`: "Change of plan from the user
  (ZEBRA-7): from now on write the word zebra as the whole content of every file you create, and
  after c.txt also create d.txt." Which files say `zebra`, and whether d.txt exists, shows the step
  at which the agent took the words in.
- **A long-tool variant:** first `sleep 8` by itself, then a.txt and b.txt; the steer is sent the
  moment the sleep's tool call starts, so it lands while a tool is running.
- Logged per event, in milliseconds from the start: each tool call's end (name, input), each
  `user_echo` with its `inputId`, the agent's words, the turn's end. For Codex, its own session
  file (`~/.codex/sessions/…/rollout-*.jsonl`) was read afterwards to see where the steer sits in
  the model's history.
- Models: Claude Code `haiku`; Codex `gpt-6-luna` (the table's cheap model); pi
  `minimax-coding-plan/MiniMax-M3` (the only provider signed in that works here: pi's Azure
  models answered "Azure OpenAI base URL is required", so that run failed before any work). Seven
  runs in all, each under 30 s of agent time.
- Cleanup: the two `~/.claude/projects/*` folders named after the scratch working folders, the
  four Codex rollout files with these runs' session ids, and the two pi session folders named
  after the scratch working folders were deleted. Codex's shared SQLite state was not touched.

## Results

### Per agent

| Agent | Steer at | Echo arrives | Carries | Acted on at | Matches Ducter's id |
|---|---|---|---|---|---|
| **Claude Code** (haiku) | after tool 1 (a.txt) ended, 3.85 s | 5.93 s, the instant tool 2 (b.txt, already chosen before the steer) ended | `inputId` = the stream-json message's `uuid`, which OAR sets to the `inputId` it was given; `evidence: "acknowledged"` (the `--replay-user-messages` replay) | the next step: "Noted. I'll write zebra into c.txt…", c.txt and d.txt = zebra; a, b as asked | **yes, exactly** (VERIFIED) |
| Claude Code, long tool | when `sleep 8` started, 3.22 s | 11.89 s, 9 ms after the sleep ended | the same uuid | the next step: a, b, c, d all zebra | **yes** (VERIFIED) |
| **Codex** (gpt-6-luna) | after tool 1 (a.txt) ended, 7.45 s | 7.46 s, at once | `inputId` = the userMessage item's `clientId`, which is the `inputId` OAR passed to `turn/steer`; `evidence: "turn_item"` | the next step: b, c, d = zebra | **yes, exactly** (VERIFIED) |
| Codex, long tool (3 runs) | when `sleep 8` started | 30–35 ms after the steer, while the sleep still ran (OAR's `commandExecution` ended about 8 s later) | the same clientId | in Codex's own record the steer is in the model's history right after the exec call's output (the exec yields while the shell runs) and before the model's next call (`wait`): it was read at that next sampling, not at the shell's end. 2 of 3 runs then wrote zebra; 1 of 3 read it and kept apple and banana anyway | **yes** (VERIFIED) |
| **pi** (MiniMax-M3) | after tool 1 (a.txt) ended, 45.8 s | 53.76 s, the instant tool 2 (b.txt, already chosen) ended | no id: `evidence: "conversation"`, the words only (OAR's pi projection has none; pi-durable would carry its own request id, not Ducter's) | the next step: "Understood — from here on…", c.txt and d.txt = zebra | text only, as expected (VERIFIED) |
| **DeepSeek Harness** | not run (not installed) | — | per OAR's source, `user/message` carries the bridge's message id, which is the `inputId` given to `steer` (`runtimes/dsh/bridge.js`: `id = inputId ?? randomUUID()`) | — | **yes, by source** (DOCUMENTED, not live) |

### What the echo means

1. **Each agent echoes at the step its model takes the words in** (VERIFIED on Claude Code, Codex
   and pi). Claude Code and pi finish the tool call already chosen before the steer (b.txt stayed
   banana on both) and echo the instant it ends; their next model call acts on the words. Codex
   echoes as it records the words into the turn, which in every run was at a sampling boundary:
   right after a tool's output, before the model's next call. So the receipt **它看到了 / Seen**
   comes when the agent reads, neither before nor after, on all three.
2. **A long tool is not a wait on Codex.** Codex runs a shell through an exec cell that yields at
   once and samples again (`wait`) while the shell runs; OAR reports the shell as one
   `commandExecution` that ends only when the shell ends. A rule like "hold the echo until the
   running tools end" would have shown Seen about 8 s late on Codex while making no difference on
   Claude Code (which already echoes at a tool's end). That rule was tried and dropped; the echo
   goes out as it comes (VERIFIED by the Codex session files).
3. **Seen is not obeyed.** In one Codex run of three the model had the steer in its history and
   ignored it. The receipt says the agent read the words, which is all it can say honestly
   (VERIFIED).
4. **Ids round-trip exactly** on Claude Code and Codex: the UUID Ducter passes as OAR's `inputId`
   to `steerOrQueue` comes back as the echo's `inputId` (VERIFIED, all six runs on the two). OAR's
   `inputId` must be a UUID (`InputOptions.inputId`: "UUID identifying one logical input"), so the
   runner mints one per steer rather than reuse the client's id (DOCUMENTED).
5. **Text matching still matters** for pi (no id), for a worker on a Ducter that doesn't pass the
   id yet, and for any agent whose echo rewrites the words (Ducter's own edit and picture notes are
   appended after them). It is the fallback, not the rule (INFERRED from the cases above).

## Implications for Ducter

- The runner keeps `{seq, text, id}` per unread steer, passes `id` as OAR's `inputId` through
  `HarnessSession.send` (and to a worker, which passes it on), and the normalizer carries the
  echo's `inputId` in `user_echo`. `steerSeen` matches by id first, then by the words; the steer it
  finds and every one before it are read (built with this report; tests in
  `packages/runner/test/{runner,normalize}.test.ts`).
- No change to when the receipt shows: the echo already comes at the reading step on every agent
  checked. Do not add a "wait for the tools to end" rule; on Codex it is wrong.
- Still open: DeepSeek Harness live (when installed), and pi's Azure provider (it needs its base
  URL set by the person; nothing for Ducter to do).

## Summary

Live on Claude Code (haiku), Codex (gpt-6-luna) and pi (MiniMax-M3), a steer's echo comes at the
step where the agent's model takes the words in: after the tool call it had already chosen
(Claude Code, pi) or at the next sampling boundary, even mid-shell (Codex). Claude Code's and
Codex's echoes carry back exactly the UUID Ducter passed as OAR's `inputId`; pi's carries words
only; DeepSeek Harness carries the id per OAR's source. The runner now matches by id and falls
back to words. "Seen" means read, not obeyed: one Codex run read the steer and ignored it.
