# 147. Continue, the two follow-ups D373 left: another computer, and the person's own sessions

Date: 2026-11-19. Feeds D376. Read-only on the author's home (`hel`, `~/.ducter/ducter.db` opened
`mode=ro`) and on this Mac's agent folders (file and key names only; no session was read, resumed or
written). No phone numbers, keys or session contents copied.

## 1. The trip again: where the sign-ins were (VERIFIED, hel's Log)

The four trip tasks of 2026-11-18 (research/143 §1), by where Ducter put them (`task_open.place` and
`body_selected.why.where`):

| Task | Opened | Where | Why |
|---|---|---|---|
| `8uyicj5x` hotel | 13:58 | `Hetzner Server` (the home), Ducter's own browser | default, `uses: ducter` |
| `b2m7yz6m` prices + flights | 14:19 | `Macbook Pro M3`, the person's Chrome | `kind: signed_in`, `site: ctrip.com`, `uses: chrome` |
| `iw7grzab` flight wishes | 14:33 | the home, Ducter's own browser | default |
| `3e8g6tet` booking | 14:52 | `Macbook Pro M3`, the person's Chrome | `signed_in`, `ctrip.com` |

So the ranking (D157) already knew the one fact that mattered: Ctrip was signed in only in the
MacBook's Chrome. Each new task followed it, and each new task lost what the last one found. With
D373 the trip stays one task, which leaves a different gap: a task continued on the home's browser
can't use the person's Ctrip account. hel's Log holds no move between computers at all (two
`moved from` events, both an agent switch on the same computer).

## 2. What moving already does (VERIFIED in code)

- `loadout.switchTask(…, device)` moves a task through `runner.moveTask` (E3): a browser place keeps
  its kind and goes to the other computer, whose own browsing setting decides Chrome or Ducter's
  browser (`candidates.ts` `fit`); a repo moves only through its pushed branch; a folder never moves.
  The person's 换谁来做 / Switch who does it sheet uses it; the partner's `task_switch` (D352) did not
  take a computer.
- The moved session started from `movedOver(from, to, progress)`: the brief and checkpoints, but not
  the last report. A *finished* errand's findings live in its report (the hotel, the prices), so a
  moved errand would have looked again. D376 adds the report and its last words (`carryOver`).
- `where.md` §7 (5): a move toward more access (the person's Chrome) "always comes from their tap or
  their Go". The person's own words asking for their own account are the same consent, said.

## 3. The person's own sessions: what Ducter can see (VERIFIED on this Mac, DOCUMENTED in code)

- **Reader:** D299's `local-agents` lists Claude Code, Codex and pi sessions on the home by file
  head and tail, redacts keys (D327 (6)), honours 别再看了 / the switch (D327 (7)) and folders left
  out; `outside.adopt` carries one on as a folder task in its own folder, the same agent resuming it
  by id (Claude Code `--resume`, Codex `thread/resume`, pi by id; research/03, research/103). Past
  tasks' 接着做 / Continue uses it today. VERIFIED in code and `outside.test.ts`, `adopt.test.ts`.
- **Is it still open?** Claude Code 2.1.32x writes one small file per running process,
  `~/.claude/sessions/<pid>.json`, with `pid`, `sessionId`, `cwd`, `kind` (`interactive`),
  `entrypoint` (`cli` in a terminal, `sdk-ts` for an SDK host), `status` (`busy`/`idle`), `version`
  and update times (VERIFIED: two such files on this Mac, both pids alive, keys only read). A
  session whose id is in a file with a live pid is open in that process. Codex 0.170.0 keeps no such
  per-session file at the top of `~/.codex` (VERIFIED by listing names only); whether its app
  server tracks live threads elsewhere is not known (INFERRED: not public). So for Codex and pi the
  only sign is the file's own time: written in the last two minutes may still be open.
- **Two writers on one conversation** (the terminal's process and Ducter's resumed one appending to
  the same file) would interleave turns for both: INFERRED, not tried (it would write to a real
  session). Ducter never carries on one that is open; one written a moment ago goes once the person
  says it is closed (or taps again in Past tasks).
- **Which one:** the reader's search (D285's words, time words, agent) already ranks by name,
  folder, branch and the person's first and last words, newest first without words. "终端里那个
  Claude 在做的" names the agent and "now": the newest Claude Code session is it, unless two are
  close, then the partner asks which, naming each by what it was about and its folder.
- **A worker's sessions** (the author's case: hel is the home, his terminal Claude Code runs on the
  MacBook): not read (D327 (9): only after a yes asked on that computer, because reading them moves
  what is derived off the computer it was written on). The partner says the records it can read are
  the home's. Not built here.

## 4. Consent (from research/115's evidence)

research/115's raters found unprompted reading the creepiest variant (18/18 would turn it off) and
the person-initiated look (Past tasks) the least; a line saying exactly what is read lowered
turn-offs. The ask "接着我终端里那个 Claude 在做的" is person-initiated, so it is the consent to look,
once, for this; nothing is read unasked (the tools refuse in a turn with no words from the person).
The first time, Ducter's code says in one line what it read and where (**我看了 {computer} 上你在
{agents} 里的对话记录：只看名字、文件夹、时间和你说的头一句，不看代码和文件。**), never again.
The switch off means off: nothing is read, and the partner says where to turn it on.

## 5. Eval (haiku)

Four new scenarios: `continue-trip-mac-zh` (the real case: the hotel task on the home's browser,
the follow-up wants the Ctrip account, the MacBook browses in the person's Chrome),
`continue-trip-stays-en` (a follow-up needing no sign-in stays where it is), `own-session-zh`
("接着我终端里那个 Claude 在做的，把剩下的测试补上") and `own-session-which-en` (two equally likely
sessions: ask which). First runs: haiku never moved the trip on the prompt and the tool alone (0 of
2); a once-per-turn second look in code (a `task_send` for a browser task whose words ask for the
person's own account, while another computer browses in their Chrome and this one doesn't) made it
move (1 of 1, then in the full run). Its question for two sessions named neither (0 of 2) until the
tool's note gave an example; the first-look line was skipped until the code said it.
Full runs: 124/162 (`2026-11-19-haiku-d376-run1.md`) and, on the final code, 119/162 (`2026-11-19-haiku-d376.md`), against 127/158 for D373; the flips between the two runs are length and wording judgments in unrelated categories. The trip moved and the right own session was carried on in every run; the new scenarios' remaining failures are a second paragraph (the departure city) and the first-look line naming every agent it read. A targeted repeat on the final code: 5/6.

## Implications for Ducter

- Code knows where the sign-ins are (D157's ranking); the model judges only whether the words ask
  for the person's account. The same split as D373 (code names the task, the model judges the words).
- A finished errand's state is its report: anything that restarts it elsewhere must carry the report.
- Claude Code tells which sessions are open; Codex and pi don't. Refusing an open session is the only
  safe default; a fork (`--fork-session`) stays the alternative for someone who wants both running.
- The author's own case (terminal sessions on a worker) needs D327's yes on that computer and a
  `localSessions` op over the worker link: the next step, in `todo.md`.

**Summary:** the trip's sign-ins were on the MacBook's Chrome, which Ducter's ranking already knew;
D376 lets the partner move the continued task there (`task_switch` takes a computer, the report
moves with it, a code task only after a go) and asks back once when the words want the person's
account on a computer without it. The person's own Claude Code or Codex session on the home is found
and carried on from the conversation (`own_session_find`, `own_session_continue`) under D327's
switch, said once, never while it is open in a terminal (Claude Code's `sessions/<pid>.json`, else
a file written in the last two minutes). A worker's sessions wait for a yes on that computer.
