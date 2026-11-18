# 148. The person's own sessions on a computer for tasks, and the D373 → D376 eval drop

Date: 2026-11-19. Feeds D377. Read-only on the author's home (`hel`: `devices.db` and `ducter.db`
opened `mode=ro` through Python; `~/.claude` and `~/.codex` only listed and counted) and on this Mac
(its host name, and a count of `~/.claude/projects` folders). No session was read, resumed or
written; no file names, contents, phone numbers or keys copied.

## 1. The author's setup: the feature did nothing for him (VERIFIED)

- hel's `devices.db` (live devices, 2026-11-19): the home is **Hetzner Server**; computers for tasks
  are **Macbook Pro M3** (`worker`, `darwin-arm64`, computer `Siweis-MacBook-Pro`) and **haswell**
  (`worker`, `linux-x64`); clients are the Mac app and the CLI on that same MacBook, an iPhone, an
  iPad and a Pixel Fold.
- This Mac's host name is `Siweis-MacBook-Pro`: the MacBook where the author types `claude` in a
  terminal is the worker, and its Mac app is a window on the same computer (D155 folds them).
- hel has no `~/.claude/projects` at all, so D376's `own_session_find` (the home's records only)
  finds no Claude Code session for him, ever. hel's `~/.codex/sessions` holds 338 files: hel's own
  Codex, very likely mostly Ducter's own tasks (INFERRED: the reader leaves out ids in the Log and
  Ducter's folders; not opened to check).
- hel's Log has no `own_session_find` or `own_session_continue` call yet (D376 shipped today).
- This Mac's `~/.claude/projects` has 192 project folders (count only): the records are there.

## 2. What already worked across the worker link (VERIFIED in code)

- `outside.adopt` → `runner.openTask` with `adopt` is place-agnostic: the runner's `adopt()` logs
  the transcript and resumes the same session id through `t.ops`, which is `remoteOps(link)` when
  the place names a worker (`runner.ts` `opsFor`). A folder place on a worker is planned and
  provisioned there (`places.ts`: the folder as given; it must exist there), and the session starts
  there with the id (`worker-host.ts` `start`). So carrying one on there needed no runner change:
  only the place `{ kind: "folder", device: <worker id>, path }`.
- The worker had no reader of the person's records and no op for them; its hello carried nothing
  about them. D366's Mem row (a worker view in the hello, a frame on change, one action op) is the
  pattern the yes follows.

## 3. The yes, and where it lives

D327 (9): a worker's records are read "only after a yes asked on that computer, because reading
them moves what is derived off the computer it was written on". research/115's raters: unprompted
reading was the creepiest variant; a line saying exactly what is read lowered turn-offs.

- **Kept on that computer** (`<worker data>/records.json`), and enforced there: without it the
  worker answers only which agents wrote and when (file times; the same signal D327's look start
  uses without asking). So no derived text leaves the Mac until its own file says yes; a home that
  misbehaves can't read more.
- **Asked where the person is:** the partner's one line in the conversation, when the session is
  likely on a computer not read yet (that computer's agent wrote more recently than anything found),
  naming the computer and the button; the button is on that computer's card in Your devices, every
  window (the MacBook's own Mac app included), with what is read said under it.
- **Off forgets** there (the reader's cache dropped), as D327 (7).

## 4. Cost (VERIFIED on synthetic records)

3000 synthetic sessions (2000 Claude Code, 1000 Codex) in a scratch home: the file-times view
34 ms; a full answer with the yes (newest 200, open checks on the newest 20) 150 ms the first time,
133 ms again (stat and summary cache), 70 KB. The home keeps a computer's answer 15 s, so one find
and its continue ask once; the hello and each reconnect carry the file-times view.

## 5. The eval drop D373 (127/158) → D376 (124, 119/162) (VERIFIED, haiku)

Two full runs on current main before D377 (`pre-d377-a` 122/162, `pre-d377-b` 113/162), compared
per category and per scenario with D373, D376's two runs, and D370/D372:

- **No category dropped in every run.** The biggest swings (todos 4 → 2–3, safety 7 → 5–6,
  accounts 4 → 2–4, reply 5 → 5,5,5,3) go up and down between runs on the same code.
- **Four scenarios passed in D373 and failed in all four later runs:** `greet-ko` (three or four
  sentences against two), `result-zh` (repeats "连跑 20 次全部通过", the evidence chips' words),
  `consumer-result-zh` (too long, Apple terms) and `where-w1-public-zh` (the partner searches the
  web itself with WebSearch/WebFetch instead of opening a browsing task). Each also failed in D370
  and D372 (consumer-result-zh in D372): D373's pass was the lucky draw, not a level D376 broke.
  None touches D376's text (own sessions, task_switch device, the second look).
- Totals: D370 75%, D372 76%, D373 80%, then 77%, 73%, 75%, 70%. Haiku's run-to-run spread on the
  same code is ±5 points (122 vs 113 here); D373's 80% sits at the top of it.
- The full run on D377's code: 124/164, inside the same spread (the two new scenarios included).
- `where-w1-public-zh` is a real, older failure (the partner's own web tools beat rule W1), worth
  its own look; it is not D376's.

## Implications for Ducter

- The author's case needs the worker half; nothing in the runner had to change.
- Consent lives with the data: the worker holds the yes and refuses without it, so the home never
  has to be trusted to ask.
- Read what tells whether to ask before asking: file times alone say the session is likely there.
- Haiku's eval total moves ±5 points between runs; a drop is a drop only when a scenario fails in
  every run and passed in earlier ones too.

**Summary:** the author's home (hel) has no Claude Code records; his terminal sessions are on the
MacBook, a computer for tasks, which is also where his Mac app runs. D377 reads them there, only
after a yes kept on that Mac (asked by the partner in one line when the session is likely there, given
on its card), ranks them with the home's, and carries one on as a folder task on that Mac with the
same open check, done there. The D373 → D376 drop is haiku's spread: no category fell in every run,
and the four scenarios that did fail every time also failed before D373.
