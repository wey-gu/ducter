# 139. Continuity first: why the partner opened a new task for every follow-up

Date: 2026-11-18. Feeds D373. Read-only on the author's home (`hel`, `~/.ducter/ducter.db` opened
`mode=ro`); no phone numbers or secrets copied.

## 1. What happened (VERIFIED, the author's Log)

One trip conversation on 2026-11-18 (UTC):

| Time | The person said | What the partner did |
|---|---|---|
| 13:58 | plan a Beijing hotel near AGI Bar | task `8uyicj5x`, Codex, Ducter's browser on hel; done 14:02 |
| 14:18 | "这个酒店和旁边的汉庭差多少钱？然后也帮我看看机票吧…登录我的携程…" | a **new** task `b2m7yz6m`, Claude Code on the MacBook's Chrome; the person moved it to Codex by hand at 14:27; Ctrip signed in there |
| 14:32 | refine the flights (one-ways, not Daxing, Wi-Fi, not early) | a **new** task `iw7grzab`, Codex on hel (no Ctrip sign-in) |
| 14:51 | "周日这个可以，周六再晚一点？…cost 总结…帮我订好机票和酒店" | a **new** task `3e8g6tet`, Claude Code on the Mac again: it refused to start because its brief said "not Claude Code", was moved by hand, then stalled (the person asked at 15:00 whether it had stopped) |

Four tasks for one errand. Each new one lost the last one's signed-in browser, what it had found
(the brief carried a summary only), and the agent the person had just chosen for it.

## 2. Why (VERIFIED in code)

- **The persona said so.** Rule 2d: "Continue an existing task (task_send, even when it is done)
  ONLY when the follow-up builds on its changes that are not merged yet: same repo AND same
  subject … Anything else is a new task." Written for code (review 2, D67) after one task
  swallowed unrelated work; for an errand there is no repo and no change, so every follow-up
  read as "anything else". `task_open`'s description said the same ("same repo, builds on what
  a task just did").
- **Nothing in the turn pointed at the task.** A warm partner session saw the person's line and
  nothing else; which task the talk was on had to be inferred from history.
- **The machinery was there.** `task_send` to a finished task already resumes it
  (`runner.send` → `resumeOrSeed`: the agent's own session by id, else a fresh session from the
  brief and checkpoints, `could not resume … started a new one`); an archived task gets its
  worktree back from its branch; D282 keeps one session per agent per task; D299 continues
  sessions started outside Ducter from Past tasks; D285's 接着做 / Continue does the same by button.
- **The conversation would have hidden it anyway.** `task_send` wrote the line before it as a
  plain message; the task's chip stayed under the old answer (`chipOwner` follows the newest
  `job_status` or ack of a task), and the partner's job for that task stayed "done", so the next
  result never closed a line.

Baseline eval (haiku, the old persona, `results/2026-11-18-haiku-baseline-d372.md`): the trip
scenario opened a new task at the first follow-up, exactly as in the Log; the café errand and
"接着昨天那个 compaction" continued. 5/8 of the follow-up set.

## 3. Does resume work days later? (VERIFIED / DOCUMENTED)

- **Codex, in the wild (VERIFIED, hel's Log):** task `fqhxy9ys` (Codex, browser) started its
  session on 2026-11-13 16:12, finished, and was taken up again on 2026-11-16 02:52, 2.5 days
  later: no second "session started", no "could not resume". Two more Codex tasks were taken up
  again the same day. hel's Log holds no "could not resume" event at all (28 tasks).
- **Claude Code (VERIFIED in research/03, not on hel):** `--resume <id>` brings a session back,
  even a hand-written one. Not re-run here: the run would write under `~/.claude`, which this
  task leaves alone.
- **When it's gone** (pruned, another computer, another agent): the runner starts a new session
  in the same task from the brief and every checkpoint and says so in the task (DOCUMENTED in
  code, covered by `runner.test.ts`, `adopt.test.ts`).
- **Context limits:** a continued session keeps growing; the agent's own compaction and D135's
  save-before-compaction apply as for any long task.

## 4. Sessions Ducter didn't start

D299 already lists the person's own Claude Code, Codex and pi sessions in Past tasks and
continues one in its own folder (the same agent resumes it by id; another agent starts from what
it said). What is missing is the conversation's path to them ("接着我早上终端里那个 claude 会话").
Recommendation: a later step that lets the partner search those sessions (the same reader, the
same D327 consent) and adopt one through the existing `adopt` path. Not built now: it widens what
the partner reads of the person's machine and wants its own consent wording.

## 5. Design (D373)

1. **Continuity first** in the persona: a follow-up carries the task it follows on, done or
   failed, errands and code alike; new only for separate work, after a merge, or when asked
   ("开个新的"); a named earlier one is found and continued; another agent = `task_switch` then
   `task_send`.
2. **The turn says which task** (code, not judgment): under each user line, `(just before this:
   task <id> "<title>", done 16 min ago, Codex, a browser. More of that work goes there with
   task_send …)`: the last task opened, finished or continued in the conversation, within 12 h,
   not dropped; a merged one says new work is new.
3. **A second look** (code): the first `task_open` of a turn whose message follows a finished
   task is answered "not opened: this follows task …; task_send it, or call again for separate
   work" once. Separate work costs one round trip; a request for a new one skips it.
4. **The conversation shows it:** the line before (or right after) a `task_send` to a finished
   task becomes that task's ack with a fresh `job_status` for the same task, so the chip moves
   under the newest ask and the next result closes it; On hand keeps one card.

## 6. After (haiku, the new persona)

Targeted runs of the follow-up set: the trip continued the one task through all three
follow-ups in every run after the second look was added (no `task_open`); the café errand, the
days-later compaction, the dentist (new) and "开个新的" (new) passed; the remaining failures were
length and invented-detail judgments unrelated to routing. The full run (`results/2026-11-18-haiku-d372.md`): 117/153, against 104/144
for the last one (D360); follow-ups 8/10, the two failures a missed retitle and the trip's long
hand-off lines (routing held: no new task at any step).

## Implications for Ducter

- A rule written for one kind of work (code) silently decided another (errands): rules about
  routing need scenarios from all three users.
- Code should say what code knows (which task the talk is on); the model judges only whether
  the new words carry it on.
- Not built: moving a continued task to another computer when the follow-up needs one (the
  partner's `task_switch` has no computer; `loadout.switchTask` already moves); continuing the
  person's own outside sessions from the conversation (§4).

**Summary:** the partner opened four tasks for one trip because rule 2d limited continuing to
unmerged code changes and nothing in the turn named the task the talk was on. Resume itself works
(Codex resumed after 2.5 days on hel). D373 puts continuity first in the persona, names the
followed task under each message, asks back a `task_open` once, and moves the task's line under
the follow-up.
