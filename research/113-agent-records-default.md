# 113: Reading the person's own agent records by default

The question (the author, 2026-11-17): should Ducter read the home computer's Claude Code, Codex
and pi records by default, and how, worked out from the real situations and from what the
person gets and feels. Two readers do it today: Past tasks' 也在这台电脑上 (D299, local, no
model) and the partner's first words (D298, last 14 days; the offered titles go into the
partner's context, so to the person's chosen model provider).

Sources: the code (`packages/core/src/local-agents/`, `first-words.ts`, `outside.ts`, `ws.ts`),
research/102 §4 and research/103 (record shapes, sizes), D204, D293, D298, D299, D307, and a
naive-rater feelings test run for this note (§3). No real person's sessions were read; the tests
use synthetic sessions in the agents' own shapes.

## 1. Where the records live, and where the home runs

| Situation | Whose records the home reads | Whose work it is | Notes |
|---|---|---|---|
| **Mac app, home on the same Mac** (the common case) | the Mac's own `~/.claude`, `~/.codex`, `~/.pi` | the person's own work, by hand | VERIFIED in code: `createLocalAgents()` reads `homedir()` of the account the home runs as. |
| **Home on a server, person codes on their Mac** | the server's records | sessions run by hand on the server (over ssh), if any; Ducter's own tasks there are left out (data folder, Ducter folder, Log ids) | VERIFIED: the exclusions in `outside.ts` / `recentFolders`. Before D327 every screen said "这台电脑 / this computer", which on the Mac or phone means the wrong computer. |
| **Workers** (a Mac doing tasks for a server home, D293) | none: the worker's records are never read | the person's own work on that Mac | D299 left "a worker's sessions" open (todo). Reading them moves derived titles off the computer they were written on. |
| **Several Macs, each its own home** | each home its own | | Each conversation names its home. |
| **Work and personal machines** | whatever the home's account wrote | a work Mac's records are work (client code, colleagues' names) | The partner's model provider sees offered titles once the person looks. |
| **Shared computer, separate macOS accounts** | before D327, any file under the home's own `$HOME` the system let it open | another account's records are theirs | `~/.claude` lives under the user's home (0700 on macOS by default); D327 also skips files not owned by the home's own uid. |
| **Shared computer, one account** (family Mac) | everyone's sessions in that account | can't be told apart | Only consent, provenance and "leave this folder out" help. |

## 2. What is in the files, and who sees what is derived

- **Contents** (research/103 §2, DOCUMENTED + VERIFIED on synthetic files): every prompt the person
  typed, the agent's replies, tool calls and their output (whole files, diffs, logs), pasted
  secrets (API keys, tokens), customer data in log lines, other people's names. Claude Code adds
  an AI title (`ai-title`) and the person's `/rename`; Codex a thread name; pi `--name`.
- **What Ducter reads**: names and times of files; from each, the folder, branch, model, title,
  the person's first and last words (head and tail, bounded). Never the folders themselves;
  history (last 60 turns) only when the person carries a session on.
- **Who sees what is derived**: the person, on any of their devices (over loopback, Tailscale or
  their Cloudflare tunnel, D293); the partner's model provider, through the person's own agent,
  for what goes into the conversation (the first words' offers, a carried-on session's turns);
  never Ducter's servers (there are none in the path).
- **Before D327, no redaction ran on derived titles**: a key pasted into a prompt became the
  session's title in Past tasks and could become a first-words offer (VERIFIED in code: `summarize`
  did not call `redact`; the projection's `redactDeep` hid it on screen but not in the Log or in
  the partner's context).

## 3. Feelings test (naive raters)

Method (VERIFIED, run 2026-11-17): `claude -p --model haiku --no-session-persistence` in a scratch
directory; three personas (林舟 a heavy multi-agent developer; 王蕾 a consumer who used Claude Code
three times for spreadsheets; 陈默 a fresh user who followed a tutorial once); two moments (alone;
sharing the whole screen with six coworkers); three raters per cell; each answers trust, delight,
creepiness (1–5), where the suggestions came from, who can see them, and whether they'd turn it
off. Four rounds, 288 ratings. Means over 18 ratings per variant (3 personas × 2 moments × 3).

Round 1 used deliberately hard content (a dev's "reply to the recruiter about the offer" title; a
fresh user's roommate's session): A silent default-on 1.4 trust / 4.7 creepy; B default-on with a
visible line 1.8 / 4.6; C ask first 1.9 / 4.3; D off 2.6 / 3.2. Every reading variant: all 18
would turn it off. The surfacing of one personal title dominated every reaction.

Rounds 2–4, ordinary content (the person's own recent work):

| Variant | Trust | Delight | Creepy | Would turn off |
|---|---|---|---|---|
| B: first words read unprompted, visible line, how-I-know, 别再看了 | 2.1 | 2.2 | 4.1 | 18/18 |
| B, folder only (no titles) | 2.1 | 2.1 | 4.1 | 17/18 |
| B + scope line (what is and isn't read) | 2.1 | 2.1 | 4.0 | 18/18 |
| C: ask first in the first words ("要我看看吗？") | 2.1 | 2.1 | 3.7 | 16/18 said no |
| F: a start "接着我最近在 Claude Code 里做的事", the tap is the yes | 2.2 | 2.5 | 4.0 | 17/18 |
| F + scope line | 2.5 | 2.6 | 3.7 | 16/18 |
| E: Past tasks lists them when the person goes looking | 2.8 | 3.0 | 3.6 | 13/18 |
| E + scope line | 2.9 | 3.1 | 3.4 | 9/18 |
| D: nothing read | 2.7 | 2.8 | 1.5 | 1/18 |

Understanding: "read on my own computer" 18/18 for every reading variant with a line (14/18 for
the silent one). "My AI's model sees it" rose from 4/18 (round 1, "只给你看") to 18/18 once the line
said "除了你和你用的 AI，谁也看不到".

The words raters used (INFERRED from their one-line feelings): "它没问我就翻了我的记录" (unasked,
the first second), "我终端里贴过 API key，不知道它读到哪一步" (scope unknown), "当着同事的面" (a
screen share). With a tap as the yes, raters still wrote "没问我就读了" (the proxy is weak at
counting its own tap as consent). Past tasks, where the person went to find past work, was the
only reading variant most consumers and fresh users would keep.

**Caveats.** LLM proxies, not people; haiku leans privacy-cautious and rated nothing above 3.3 for
delight. The absolute numbers are low; the order is the signal, and it held across rounds: read
unprompted < ask < a tap that asks < pulled from Past tasks < nothing read. The scope line helped
where reading was pulled (E 13 → 9 turn-offs) and little where it was pushed.

## Implications for Ducter

1. **Don't read before the person asks, at the first moment.** The first words read nothing;
   when there are records (by file times alone), one start offers to look, and its tap is the yes.
2. **Pull stays on.** Past tasks lists outside sessions by default: the person went looking.
3. **Say the scope and who sees it**, honestly: names, folders, times, first and last words; no
   code or files; keys hidden; read only on the named computer; nobody but you and the AI you use.
4. **Name the computer**, never "this computer", wherever the reader may sit elsewhere.
5. **Redact at the reader**, before anything (Log, model, screen) sees a title; never offer a title
   that had a key in it.
6. **One switch, meaning off everywhere**, and off forgets what was read (the Log's copy too).
7. **Per-folder exclusion** for the shared or work-and-personal machine; other accounts' files never.
8. **Workers' records only with an ask on that computer** (todo; not built).

Summary: reading the records is valuable when pulled and creepy when pushed. D327 keeps Past tasks
on by default, turns the first words' reading into a one-tap offer, says exactly what is read and
on which computer, hides keys at the reader, and makes "stop" forget.
