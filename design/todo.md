# Ducter TODO

Deferred work, grouped by area, each with its trigger where it has one.

## Antigravity, live (D416, research/171)

- [ ] **The Mac, live.** Its card shows **只有 Antigravity 的桌面 app，没有它的命令行** (the app and the
  dead `~/.antigravity/antigravity/bin/agy`); **安装** puts `~/.local/bin/agy` (check `agy
  --version` ≥ 1.5.0 and that no `.zshrc` changed); **登录** opens the Google link, the pasted code
  signs in, the row turns **可以用了**; a task named on it in a scratch repo runs a turn, calls
  `report_to_main` through the bridge (and `sqlite3` over
  `~/.gemini/antigravity-cli/conversations/*.db` holds no `dtk.` token); a park and resume in the
  same folder; New task's model list and its effort menu; `/usage` limits on the card. Trigger:
  the author installs it from the card.
- [ ] **hel, live.** The same over the worker: install from the phone, the sign-in link opened on
  the phone (nothing opens on hel), a task there; then `agy logout` by hand reads as 未登录 within
  a look. Trigger: the author's deploy.
- [ ] **Registry.** Once run: the verified range from what ran, the models' windows, whether a
  turn's quota notice reaches the limit card, `scripts/probe-harnesses.ts` lines for agy (`--version`
  pattern, `acp --help`), and whether `agy install`'s shell step matters for anything but PATH.
- [ ] **Mem's steps, live (D417, research/172 §5).** With agy installed and Mem connected: a task on
  the Mac in a scratch repo, then on hel. Check (a) `~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl`
  exists after a turn with no hook configured, and `<id>` is the task's session id in the Log;
  (b) the first turn led with `<nowledge_context_bundle>` (agy's own transcript) and its size;
  (c) the thread appears in Mem (`nmem --json t list --source antigravity`) as the persona, once,
  and grows after a second turn without doubling; (d) on hel it went through the relay (the task's
  "reached Mem through the home" line) and `sqlite3` over `~/.gemini/antigravity-cli/conversations/*.db`
  holds no `dmr.`. If (a) fails, save from Ducter's Log instead (`nmem t import` of the turns) and
  record why. Trigger: the first Antigravity live check above.
- [ ] **Memory off vs the person's own agy Mem plugin (D417).** Ducter can't switch it off for one
  session (agy has no per-session plugin switch; OAR refuses `userConfiguration: exclude`), and
  Mem's `plugins inspect` has no `google-antigravity` host, so the device card can't say it's
  there. Trigger: Mem's check lists `google-antigravity` (then a `memPlugin` fact for Antigravity,
  never an install offer) or agy gains a per-session plugin switch.
- [ ] **Mem's skills in an agy task (D417 cut them).** Distill and handoff stay with the partner
  (`remember`). Trigger: agy loads a plugin or skills folder for one session (a flag, or OAR's
  `userConfiguration` verified for it).
- [ ] **A sign-out for the other agents** (D416 built Antigravity's, through OAR's `logout`;
  Claude Code, Codex, pi and DeepSeek Harness have none in Ducter yet). Trigger: someone asks to
  sign one of them out from Ducter.
- [ ] **DeepSeek Harness pictures** (OAR 0.124 #997 added images to its runtime): check live, then
  `HARNESSES["deepseek-harness"].images`.
## The Mac walk's leftovers (D408)

- **Walk D408 in the real window.** VoiceOver on a joined title (「对话」 read as a word), an expiry typed
  0829 and 829, Settings on 在哪儿运行 while 和你的其他 agent 通信 comes and goes, and a Telegram link
  completed in the settings demo; with a real keyboard in every field.
- **Ask MyGo upstream for accessible text without line-breaking joiners** (its Markdown view, and
  `ui.Text` generally): then `uiText` and `mdSpace` go, and replies keep `keepTokens`' whole tokens.
  Also ask whether an accessibility text insert can show in the value at once, so a driver's
  read-back confirms it (the doubled typing, D408 (3)).

## A review that runs every so often (D394, `past.md` Ongoing, research/158)

- **Live check on hel.** Everything in D394 is checked with fakes only: the brief rule, no nudge,
  one timer, fresh rounds (the token numbers are the fake's model), `review_report` and the round
  card. Does a real Codex call `review_report` and stay silent on quiet rounds? *Trigger:* this
  build on the author's home.
- **A fresh round's own state files.** It reads its checkpoints; files it kept in its scratch folder
  are there but the seed doesn't name them. *Trigger:* a fresh round that redoes work it had.
- **The PR's diff beside a draft.** The sheet shows the notes with path:line; the lines themselves
  are on GitHub. *Trigger:* the author asks for it on the phone.
- **Mentions that aren't review requests** go in `prs` too and count as waiting; they may want
  their own word. *Trigger:* the standing line reads wrong to the author.

## Handing over several to-dos (D385, built, `handover.md` §9)

- **D396: the words' split by a real model.** Code's clause rule and a fake model were checked; the
  cheapest real model on the author's own sentences (zh, en, mixed; one clause holding both) is not.
  *Trigger:* the author's home on this build, or the first split that reads wrong.
- **D396: humans on the question's words** (**想交给{name}哪些？**, the hint, **找的是**, **一件件挑**).
  *Trigger:* the next rater panel.
- **D396: the phone's disclosure rows in call cards** (`phone.go` callPlanBody, callResult) highlight a
  square inside a rounded card (not at its edge). *Trigger:* the next pass on Use a phone.

- **Live: plan first on a real subject.** hel's "memory distill" set on a real agent: does the lead
  part call `plan_report`, does it find the already-fixed ones, how long and how much it costs. Built
  and checked with a fake runner and a fake model only. *Trigger:* the author's home on this build.
- **A plan task that reports without `plan_report`** falls back to one after another of the whole set
  (the card shows its words). If a real agent skips the tool, ask it once more by code before the
  fallback. *Trigger:* the first plan card without a typed plan.
- **A worker takes a subject later** (§6: "让 haswell 做记忆提炼这一摊" moves the group's Where for the
  parts not yet started). Where is chosen at hand-over (the note, a rule, the repository's computer);
  changing it for a running group is not built. *Trigger:* the author asks it of a live group.
- **Subjects merge only by spelling.** Two names for one thing ("Distillation", "记忆提炼") stay two
  chips until a sort reuses one; a model-made merge is held. *Trigger:* the author sees one subject
  twice on the pile.
- **People, not proxies, for the five words** (给{name}的话, 先出个方案 · 你点头再做, 合成一件做,
  分类 / Subjects, 一起过目). *Trigger:* the first human panel (shared with D348's and D382's words).
- **A find by meaning on a real pile:** measure recall on hel's 49 distillation to-dos (words + labels
  + one cheapest-model call) before trusting the line 说的是同一件事的 n 件. *Trigger:* the author's home on this build.

## Models an agent adds (D352, `harnesses.md`)

- **Live: a real switch to gpt-6.2-sol mid-task.** A Codex task on the author's Mac, switched by
  the chip and by "这个任务换成 6.2 sol" while a turn runs: the turn ends on the old model, the next
  one reports gpt-6.2-sol (Codex's own model line), same thread id. Checked with fakes only.
  *Trigger:* next release walk.
- **The partner's own effort (D390).** The partner runs without an effort (`partner.ts` passes
  none, so the agent's own default for the model); Settings › Partner offers models only. Offer
  D387's level dial there once a reason shows (answers too slow or too shallow on a model with
  levels). *Trigger:* the person asks the partner to think harder or answer faster.
- **Live: the partner on GPT-6.2-Astra (D390).** On hel (Codex only): Settings › Partner lists
  Codex's own models, Astra picked, the next message's session started with `-m gpt-6.2-astra`;
  and "用 astra 跟我聊" asking which of gpt-6.2-astra and gpt-6-astra. Checked with fakes and the
  haiku eval only. *Trigger:* the next release on hel.
- **Say once when an agent adds a model?** One quiet line ("Codex 有了 GPT-6.2-Sol…") when a
  `fresh` model first appears, with a Go that moves new tasks to it. Held back: proactive
  restraint, and the person's own agent default already decides. *Trigger:* the person asks for
  it, or a fresh model is picked by hand twice.
- **Back to the agent's own effort on Claude Code (D387).** Claude Code names no default level, so
  the card offers no 回到默认 / Back to default once a level is picked; going back needs the core
  to clear a task's effort (`task_switch` with an explicit "none", the runner dropping `--effort`
  on resume). *Trigger:* the person asks for it, or a Claude Code release names its default.
- **The task's 关于 / About card on a phone (found with D387, read in its code, not yet seen).** It renders as a "sheet" without
  its frame, inside the head (the same fault D387 fixed for the ring's card); move it to
  `pop-place.ts` or `SheetFrame`. *Trigger:* next phone polish pass.
- **A `fresh` chip on the picker** (a small 新 / New mark) for a model newer than the registry.
  Needs a glossary word first. *Trigger:* the same as above.

## Add a computer for tasks (D347, D358, `where.md` §17)

- **The device words with people (D358).** research/128 used LLM raters only: show three people
  (one of each kind) the devices page with 在这台上运行 / 帮 {name} 做事 and ask what turning each off
  does. Trigger: the next real user session.

- **Live check: a LAN Linux box joins hel.** On a Linux machine on the author's home network (no
  public address, no Tailscale), paste the line from Add a computer for tasks on hel's own address: the
  reach check, install, join, the user service (and a root run: the system service), the app's
  waiting → joined → here with its agents, a second paste keeps it. Then one failure each: an
  expired code, a blocked network (the check line), no curl. Done on two VMs against a scratch
  Mac home (research/127); still owed against hel's public address, with D353's quieter install
  (the next release's bundle) and a task that really runs there (an agent signed in on the box).
  *Trigger:* next release.
- **The partner's ack before a refused task_open** (research/127 F2): one haiku turn said "On it:
  running … now" and, after the refusal, nothing. *Trigger:* the next persona change (run the eval
  with a scenario for a named computer that can't take it).
- **A Mac home opened to its network on demand**, so a LAN computer can join a Mac home without
  From outside. Device tokens would cross the network over plain http; needs its own decision.
  *Trigger:* someone asks to lend a computer to a Mac home and won't turn on From outside. Calls that are the
user's go to `design/flows/OPEN-QUESTIONS.md`; the morning of 2026-11-09 answered all of them
(D54, D56–D66), and items below cite the decision they carry out.

**Closed overnight (2026-11-09), kept here for one review cycle:** tasks placed on a worker with
offline → 在等 · <device> 连不上 → resume (two VMs, scripted model) · phone web client with code
pairing and Web Push (`apps/web`) · Ducter.app + DMG · the partner memory slice on Nowledge Mem
(eval only) · the partner eval (`bun run eval:partner`) · art cutouts with true alpha
(`design/art/assets/alpha/`, 22 assets, `design/art/assets/tools/cut.swift`).

## The website (D326, `design/site.md`)

- [ ] **Pictures from the real Mac app:** the hero in the Mac window, and a real Devices picture to
      replace the drawn Isles if it reads as well. Trigger: the next Mac app walk (research/109's).
- [ ] **A 中文 site** (home, Get started, the mainland-China note), with the designed zh tagline.
      Trigger: a mainland China mirror, or the first zh launch.
- [ ] **Dead CSS and scenes** from the old landing page (the drawn hero chat, board, phone, ledger,
      opened task) in `site.css` and `main.ts`. Trigger: the next change to `site.css`.
- [ ] **Get started with people**, not only LLM raters (research/113): a fresh visitor with a Mac,
      one on a phone, one in China without a paid plan. Trigger: before the first public launch.
- [ ] **The agent sentence, end to end:** paste it into Claude Code and Codex on a scratch Mac user
      and a scratch VPS and watch it reach the partner's first words. Trigger: the author's next
      session with a spare machine.

## A second partner (D309, D312, `personas.md`)

- **D312 follow-ups:** the full partner eval at merge (only `second-partner-name` and
  `second-partner-apart` ran, with `--only`); a live run with two real partner sessions on one home
  before the preview flag comes off; its L1 from its own Mem identity's bundle; Bridge, forgetting
  and correcting per partner. Trigger: before the preview flag comes off.
- Per-partner talk, memory and accounts; a chat app bound to a partner; removing a partner; the
  Mac's rename of another partner; the stone's comprehension test with naive raters, then a clay
  character per partner. Trigger: the author reviews the preview.

## Your own agents, as yours (D418, `bridge.md` "Your own agents, as yours")

- [ ] The live run on hel once it updates: the next contact test from the author's Codex answered by code within the
      check, named 你的 Codex（Mem 协作）; the three stuck replies of 2026-11-20 settled (resent once, or said).
      Trigger: hel on a release with D418.
- [ ] A spoken instruction that covers more than a contact test ("以后 Codex 问的直接回", "my Codex's questions: just
      answer") kept as a standing permission (D413's `standing.json`, a `bridge_reply` kind bounded by the agent), so an
      own agent's harmless question needs no card either. Trigger: the author says one, or a second card for an own
      agent's acknowledgement-only message.
- [ ] Mem's refusal of a reply by bare id in another Space, in its own words (research note), so `failure()` names it.
      Trigger: Mem answers the list in `bridge.md` (item 1).
- [ ] The Mac's 390-wide phone shots and the iOS Simulator check of the folded line. Trigger: the next phone-UI pass.
- [ ] A naive-rater check that 你的 Codex（Mem 协作）reads as the person's own agent and 你自己的一个 agent as "mine, unnamed".

## 和你的其他 agent 通信 / Talk with your other agents (D332, `bridge.md` "Simple, by who")

- [ ] **D350 (5): an unnamed sender's Mem display name from its contact card**, fetched once per agent id and
      cached, before falling back to its tool or 一个没留名字的 agent. Trigger: `bridge contacts --query <agent_id>` is
      known to match the card (or Mem returns the sender's display name on `open`), checked on a context Bridge accepts.
- [ ] **D350: the host a sender runs in**, read today only from `sender.host` / `source_app` if Mem sends one. Trigger:
      Mem's #10194 answer on native senders (research/66 §8.4); then verify the field name live and the examples list
      (Claude Code, Codex, Grok Build) against the plugins carrying Bridge.
- [ ] **A teammate's agent, asked per sender the first time** (replaces D170's 也包括同事的): the first message from a
      teammate's agent becomes one card (**{teammate} 的 {agent} 想找你…** · 让它找 · 不用), remembered per sender;
      nothing in Settings. Trigger: the partner has a team mailbox (Mem's Team Bridge, X3).
- [ ] **Codex counts as "your own" too eagerly**: its records don't say the folder a session ran in, so a home whose
      partner or tasks run on Codex reads as someone who runs Codex by hand (the page shows, and the home connects).
      Trigger: a report from someone who never opened a terminal, or Codex's records carrying the folder (then skip
      Ducter's own as for Claude Code).
- [ ] **A human test of the name** 和你的其他 agent 通信 / Talk with your other agents (the author's; research/120's raters tested its first draft), with the
      Partner page's line. Trigger: the first round of human tests.
- [ ] **最近 counts only what the conversation shows**: an agent's answer to the partner's question (relayed by the
      partner) and a reply without a sent state aren't rows. Trigger: someone looks for an answer there.
- [ ] **A deep link straight to the pane on load** (`#settings=peers`) can show the waiting row before the
      conversation's events arrive (the headless shots open it after load instead). Trigger: a link to the pane from
      a notification or the partner's line.

## Deep Nowledge Mem integration (D295, `memory.md`)

- **D393 live:** one Claude Code task on haswell with the carried plugin (`--plugin-url` over http VERIFIED against a fake Mem, research/159), its Context Bundle and thread reaching the author's real Mem through the relay as the persona. Trigger: the author's review of D393.
- **D393: Codex's Mem plugin carried.** Codex has no per-session plugin URL; a `CODEX_HOME` overlay with Mem's plugin in a cache folder of Ducter's loaded nothing (live, codex-cli 0.170.0): it needs a local marketplace of Ducter's (`-c marketplaces.<name>`) and its hooks trusted. Trigger: a Codex task elsewhere that should have Mem's own hooks.
- **D393: an older worker** doesn't rewrite the relay address (its tasks' nmem then can't reach Mem; D168's floor still works). Trigger: a worker not updated past D393.
- **D366 live (and D370):** a real prompt from Mem's Settings › Connectors › Any AI agent pasted whole and redeemed on a lent computer and on a home, `nmem doctor` passing there, and one task
  run there with Mem's plugin (its Context Bundle in, its thread captured as the persona). Trigger: the
  author's haswell after the next release (his link, his Mem).
- **D375 live:** Mem's own `nmem connect --tool` for a Claude Code or Codex that lacks the plugin, on the
  home and on a lent computer, and its `--on-conflict abort` against another memory integration (how it
  reports the clash; research/144 F9); an expired key seen on Memory's head. Trigger: the author's next
  agent without the plugin, or a key rotation.
- **D366: Ducter's uv route on a bare home too** (D225 says "install pipx first" when none of pipx, uv or
  pip is there). Trigger: a home install that hits it.
- **D366: the home's Mem in the Mac app reaching a lent computer** (Access Anywhere; `nmem key
  --show-login` makes a login link on that Mac): one tap instead of a link fetched by hand. Trigger:
  research on what Access Anywhere's link carries and how long it lives.
- **Working Memory as a once-a-day L4 line** (research/136 G2; `system.md` already says so): the
  partner reads `nmem --json wm read` once a day, never shown. Trigger: the author takes it.
- **Recall across Mem's threads** (research/136 G3, research/69 K6): `memory_search` also searching
  `t search`, so "how did we fix it in Codex last week" is found. Needs the haiku eval (D175).
- **D304 follow-ups:** the full partner eval at merge (only the memory scenarios ran, with `--only`);
  a link to the one memory in Nowledge Mem (Open in Nowledge Mem opens Mem's site; trigger: Mem documents
  a per-memory URL or `nowledgemem://` form); the 想起了 line in chat apps (Telegram, Slack, WeChat show
  none; trigger: the author asks); the CLI's `talk` shows none either; an eval case for a task brief's
  `<from_your_other_tools>` actually read by the agent through its plugin (live, with a real plugin).
- **Cloud or local in one flow:** when the home has the Mem app and a Cloud sign-in is offered, one calm
  choice. Trigger: a home where both exist (research first: what `nmem status` says then).
- **Forget another tool's memory from Settings:** read-only there (D295); from a 想起了 line it can be
  forgotten, asking first (D304). Trigger: the author asks.

## Usage limits (D297, research/101)

- Prove it on a real limit hit: Claude Code's 5-hour window and Codex's, the reset read, the
  wait, the resume in the same session, and the hand-off (all checked only with fakes).
- The partner's own harness hitting its limit (the partner is not a task: no wait today).
- A task on a worker: its agent's limits are read on the home today; read them where it runs.
- An eval scenario for the morning line ("昨晚 Claude Code 额度用完，3:12 恢复后接着做完了").
- OAR upstream: carry Codex's reset on the `quota` failure, and `rate_limit_event` as an event.
- A comprehension pass with people on 先停下 / Stop here and the hand-off switch.

## Every task open (D391, `sessions.md`, research/155)

- [ ] **The code exactly as it was at a step**, uncommitted work included: Ducter's own snapshot at each turn's end (a hidden ref per turn, `git stash create` style), used by New task from this step before the newest commit. Trigger: a redo that lost work the agent hadn't committed.
- [ ] **A worker's commits for a redo** (read on that computer; today a redo there starts from where the task began and says so). Trigger: the first redo of a worker's repo task.
- [ ] **The agent's own fork for the same agent** (`--fork-session` with a message, `thread/fork`, pi's `fork`) instead of the condensed start, when the agent is the same. Trigger: a redo whose condensed start missed something the session knew.
- [ ] **Compare two tasks' branches side by side** (two redos of one step). Trigger: the person asks which of two tries is better.
- [ ] **CI checks on Past cards and in Where it stopped** (needs a PR watcher, D216's todo). Trigger: the same.
- [ ] **What a cleanup would remove** (worktrees past the archive horizon, listed before they go). Trigger: a person who asks where a worktree went.
- [ ] **Find on a phone with a hardware keyboard** (⌘K on the iPad's web shell). Trigger: the iPad app.
- [ ] **Live with weeks of the author's real tasks** (ranking of task_find against his words). Trigger: the next live walk on the home.

## Past tasks and Ongoing (D285, `past.md`)

- [ ] **The partner can search Past tasks** (a `past_search` tool beside `log_search`, so "continue last Tuesday's refactor" said in the conversation finds the card and offers 接着做). A tool change: run the D175 eval. Trigger: the author asks the partner for an old task by words.
- [ ] **A human comprehension test of the ten pictures and six tints** (research/93 §5 rated by rubric only). Trigger: before calling the marks more than a preview.
- [ ] **Semantic search** (embeddings over reports) for words that never appear as such. Trigger: a "can't find it" with words that are not in the task.
- [ ] **Change when for every week picks the weekday** (today it keeps the routine's own day). Trigger: the first weekly routine moved to another day.
- [ ] **On hand's rows draw the person's picture and name** (the name already is the title; the picture is not drawn on rows yet). Trigger: On hand's redesign settles.

## The partner reads no web page itself (D378)

## Ask me later (D382, research/151)

- [ ] **D382: "when something happens"** (等 CI 过了再问我): a partner tool that turns the person's words into a waiter (D112's check) on a decision, back when it holds. A partner-tool change: eval twice (D175). Trigger: the author asks, or a Reply like it is seen in a Log.
- [ ] **D382: chat apps, iMessage, the menu bar, the CLI (`ducter answer --later`) and the phones' notification actions** offer only Go / Hold / Reply; a card put off elsewhere stays as sent there. Trigger: the author puts asks off from a chat app or a notification.
- [ ] **D382: a real overnight return** (an ask put off at night, back at the end of quiet hours inside the morning's one notice) on a live home and a phone. Trigger: the next release on hel.
- [ ] **D382: the times in the person's zone on a server home**: the client sends an absolute time from its own zone; 明早 is the end of quiet hours as set. Trigger: a person whose phone and home are in different zones.
- [ ] **D382: comprehension with people** (the LLM-proxy panels' "asks again and again" and "the assistant picks the time"). Trigger: the first friends' install.

## The quick web look (D380, research/149)

- [ ] **D380: live on a home** (hel: "明天上海会下雨吗" → the line, 在网上查…, the answer naming its site in about 20 s; nothing in On hand). Trigger: the next release on hel.
- [ ] **D380: faster than ~20 s.** Each WebSearch round trip is ~8–10 s and haiku often makes two calls; a search API answered by code (no model call between) or a warm look session could halve it. Trigger: the author or a rater finds 20 s too slow.
- [ ] **D380: a tappable source line under the answer** (like 想起了 / Remembered, D304), so the site is code's, not only the partner's words. Trigger: an answer that named the wrong site, or the author asks.
- [ ] **D380: Codex and pi have no quick look** (a browsing task instead): Codex's shell can't be dropped for one session; pi has no web tool. Trigger: Codex gains a per-session tools switch, or a Codex-only home finds one-fact look-ups slow.
- [ ] **D380: DeepSeek Harness's web-only home measured** (the profile layer keeps only `tool-web`; INFERRED from research/50). Trigger: the next DeepSeek Harness partner eval.
- [ ] **D380: a look cut off by a restart** leaves its "looking" record and no answer (the person asks again). Trigger: one seen in a Log.
- [ ] **D378: live on a home** (a web question on hel: the ack, the task in Ducter's own browser, the result with its source; the partner's session lists no web tool). Trigger: the next release on hel.
- [ ] **D378: Codex's `web_search="disabled"` measured in a session** (parsed by 0.170.0; the tool is hosted, so its absence is documented, not seen). Trigger: the next Codex partner eval.
- [ ] **D378: connected accounts' contents (mail) still reach the partner in turn**, untrusted text like a page. Kept: they are the person's own and the in-turn answers need them; Go cards gate every effect. Trigger: an injected instruction seen in a connector's result.

## The person's own sessions on a computer for tasks (D377, research/148)

- [ ] **D377: live on the author's MacBook** (hel the home, the yes on Macbook Pro M3's card, "接着我终端里那个 Claude 在做的" carried on there). Trigger: the next release on hel and the MacBook.
- [ ] **D377: Past tasks' 也在这台电脑上 for a computer for tasks** (the conversation finds them; Past tasks still lists the home's only). Trigger: the person looks for one in Past tasks.
- [ ] **D377: the yes as a card in the conversation** (today the line points to the computer's card). Trigger: the author or a rater finds the trip to Your devices a detour.
- [ ] **D377: the file-times view refreshes at hello and reconnect only**; the find asks each computer afresh, so only the card's agents can be stale. Trigger: a card shows an agent the person removed.

## Continue on another computer, and from the person's own terminal (D376, research/147)

- [x] **D376: the author's own case: terminal sessions on a worker** (built by D377) (hel is the home, his terminal Claude Code runs on the MacBook): D327's yes asked on that computer, a `localSessions` op over the worker link answering the same reader there, and `own_session_continue` adopting on that worker (place `folder` with its device). Trigger: the author asks for one from the conversation, as he will (his terminal is on the Mac).
- [ ] **D376: the move, live** (the trip continued from hel's browser into the MacBook's Chrome, then booked up to payment). Trigger: the author's next errand that needs a sign-in only the Mac has.
- [ ] **D376: Codex and pi say which sessions are open** (only the file's time today: written in the last 2 min). Trigger: Codex writes a running-thread file, or a person carries on one that was open.
- [ ] **D376: Claude Code's `sessions/<pid>.json` shape** is undocumented (read on 2.1.32x): a change makes an open session look closed. Trigger: a Claude Code release that renames it; check on each agent update (`agents.ts`'s version).
- [ ] **D376: a code task moved from the conversation after a go** (the ask, then `task_switch` with `confirmed`) is unit-tested only. Trigger: the first one.
- [ ] **D376: the second look's words** (登录, 账号, 验证码, sign in, my account) miss other ways of asking for one's own account ("用我的淘宝买"). Trigger: a follow-up that needed the person's Chrome and stayed.
- [ ] **D376: the first-look line forgets nothing when looking is turned off and on again** (`outside.json` `looked` stays). Trigger: someone asks why it didn't say it again.

## Earlier sessions from the person's own agents (D299, `past.md`, research/103)

- A worker's own sessions: a `localSessions` op over the worker link answering the shared reader's
  `sessions()` there, and Continue on that worker. D327: only after a yes asked on that computer
  (the Mac app's own question when it joins as a worker, its name in it), because reading them
  moves what is derived off the computer it was written on; the same scope line and 别再看了 per
  computer. Trigger: the first person with a worker (or a server home and a Mac) who asks.
- D327 left: the look's answer and its forgetting are rewritten in the Log, but a window open at the
  time keeps the old words of the forgotten message until it reloads (no event replaces one in
  place yet); a digest already made from the first words keeps what it said. Trigger: the first
  "I said stop but it still shows" report.
- D327: the feelings test was LLM proxies (research/115 §3); a test with people of the three kinds,
  on a real first open, before the first tagged release.
- D327: the web Settings shot of **读它们留下的记录** turned on with a folder left out (the Mac's is
  covered by `settings_more_test.go`).
- A session still running in a terminal: say **还开着 / Still open** (its file written in the last
  few minutes, or the agent's own lock) and hold Continue until it ends. Trigger: before release.
- Codex's own thread names (`/rename`) from its `state_5.sqlite` `threads.name`, read only, when the
  schema is the known one. Trigger: a Codex user asks why a renamed thread shows its first words.
- 带着它开新任务 / New task from this for an outside session (its last words and first ask as the
  seed). Trigger: after the first real use.
- A real-model run: carry a real Claude Code and a real Codex session on, and switch it once.
- Keys on the outside cards (j/k walk into the section, Enter continues).

## Chat apps (D276, `channels.md`)

Built against fakes only (a fake Bot API, a fake Slack Web API + Socket Mode).

- [ ] **One live run on a real Telegram bot** (BotFather token, the deep link, a turn, a card's buttons, an edit to the end state, a picture both ways, an album, a 409 while a webhook is set). Trigger: before calling chat apps more than a preview.
- [ ] **One live run in a real Slack workspace** (the manifest through Slack's importer, an admin-gated install, Socket Mode's refresh after hours, Block Kit buttons, `chat.update`, the files v2 upload with form encoding, a shared message). Trigger: the same.
- [ ] **The 来自 Telegram / via Telegram mark under the person's bubble** in the app's conversation (web and Mac; the key `chats.via` is there). Trigger: the author's review of D276.
- [ ] **The section's art through the metaphor process** (AGENTS.md: five candidates including no metaphor, a mapping table, the rubric, raters). The two drawn speech bubbles are a literal placeholder. Trigger: the same review.
- [ ] **iMessage on a Mac home with a partner Apple ID** (research/88 §4: a Messages CLI over the partner's own Messages database, Full Disk Access, tapbacks for 好 / 先等等, no edits). Trigger: the author's go for the Mac app step.
- [ ] **Slack's agent surface** (`agents.sessions.setStatus` for the waiting line, suggested prompts, streamed answers) where the workspace's plan has it. Trigger: a person on a paid Slack plan asks.
- [ ] **Replies after a restart:** which chat message carried which Log seq is kept in memory only, so a reply to a message from before a restart is a plain message (nothing is lost). Keep the map in `channels.json` if people reply to old messages. Trigger: the first such report.
- [ ] **Outgoing text never carries a saved value** (an Autofill detail that isn't key-shaped): refuse and have the partner reword, as one project does in code (research/88 §7.4). Key-shaped text is already hidden on the way out, as for clients (D152). Trigger: before a public release of chat apps.
- [ ] **Telegram Mini App for the full card** (only for homes with an https address). Trigger: a card people keep opening in Ducter from Telegram.

### WeChat through ClawBot (D301, `channels.md` §9, research/105)

Built against a fake iLink and CDN only.

- [ ] **One live run on a test WeChat account, never the author's own** (a real QR's text, the scan, the redirect host, a turn, a typed 好, a picture and a file both ways, a voice message, the window: how long and how many messages WeChat really allows, which `ret` it answers past them). Trigger: before calling WeChat more than a preview.
- [ ] **WeChat's own terms page** 《微信ClawBot功能使用条款》 read in full (research/105 could not open it): whether it says anything about clients other than OpenClaw. Trigger: the same; stop and ask the author if it forbids them.
- [ ] **The order of the groups for a person in China** (WeChat first when the conversation is Chinese?). Trigger: the author's review of D301.
- [ ] **The 来自微信 / via WeChat mark** with the other chat apps' marks. Trigger: D276's mark.
- [ ] **WeCom's long-connection bot** as a second window for people who live in WeCom (research/105 §3). Trigger: a person asks.

## A harness's own background work (D266)

- [ ] **One live Claude Code task with a `run_in_background` shell and a background subagent:** the steps show, no nudge at the turn's end, the card stays 在做, Claude Code's own turn arrives when the shell ends (the 60 s settle never fires), and the session isn't parked under it. Trigger: before the release that carries D266; so far fakes and OAR's scripted runtime.
- [ ] **Codex's background terminals:** OAR 0.95.1 reports only Codex subagents as tasks, so a Codex task's background terminal is still invisible (and dies at park). Trigger: an OAR release that reports them, or a Codex task that loses one.
- [ ] **The card's wait sentence for background work** (D261: a wait says what it waits for): "在后台跑着：{x}" as the card's line while the task's turn is over. Trigger: the author's review of D266 on On hand.

## iMessage through the Mac app (D277, `design/imessage.md`)

- **The live check** (trigger: a Mac with Messages signed in to a test Apple ID, never the
  author's own): link by code, a reply and a late result back, 好 and a Like on a card, a
  stranger's silence, quiet hours, a restart of Messages and of the Mac, Full Disk Access and
  Automation turned off and on again. Record what macOS 26 does with Full Disk Access for the
  spawned `sqlite3` when the app runs as a login item, and whether the self thread holds one copy
  or two.
- **Pictures and files out** (trigger: the live check passes): AppleScript sends a file to the
  same buddy; D206 media from the partner as attachments.
- **D323's live check** (trigger: an Apple ID made for a test partner, on a Mac that isn't the
  author's own Messages): what **检查** reads from Messages' account `description`, whether the code's
  row carries `destination_caller_id` on macOS 26, whether a brand-new Apple ID gets iMessage on a
  Mac at the first try, and the background-user row on a real Fast User Switching session.
- **The Chat apps clay with human raters** (trigger: the next rater round; LLM raters only so far,
  D283; the letter pebbles are gone, D314).
- **D314's marks still owed** (trigger: the first person who uses one): GitHub Copilot, OpenClaw,
  OpenCode, Outlook, Feishu / Lark and WeCom keep a letter or a drawn stand-in; a website in
  Autofill keeps its letter (its own favicon would mean fetching it, a privacy question first). The
  phone's Settings list and the rail keep Ducter's own clay (the sections are Ducter's).
- **D314: a comprehension pass on the per-kind Done for you glyphs** (merge, PR, setting, install)
  with human raters, and on the iOS Simulator (headless Chrome only so far).
- **The 来自 iMessage / via iMessage mark** under the person's message on the Mac and the web
  (D276's mark, the same `via`).
- **Where to reach me** pinned to iMessage (research/88 §7.1), if the "last spoke" default proves
  wrong.

## Server mode and remote access (D54, `research/29`)

Built and verified in Ubuntu VMs: systemd user service, code pairing, token gate, Caddy and
SSH-tunnel paths, desktop connect card, worker enrollment, presence and task placement.

**From outside (D228, research/67)**
- [ ] **One real run end to end on a Cloudflare account with a domain** (sign-in, the zone read with the certificate's token, `tunnel create`, `route dns`, run, the outside check over HTTPS and WebSocket) on a Mac home and on hel. Trigger: before the release that carries D228; everything so far is fakes plus the real binary's download and sign-in link.
- [ ] **The setup task's agent on Claude Code and on Codex** with the real brief (does it stop at the Go card, rerun after it, ask for another name when taken). Trigger: the same real run.
- [ ] **A start at login without Ducter**: the tunnel comes back when Ducter starts (its own unit or a detached process), not as a launchd/systemd service of its own. Trigger: a person who wants the address up while Ducter is not.
- [x] **The systemd-run path on a Linux home**: the tunnel's own unit survives `systemctl --user restart ducter` (`bun run e2e:linux` step 8).

**Tailscale (D265, research/86)**
- [ ] **One real run on a tailnet-only server** (hel joined to a tailnet, no public port): `ducter tailscale` as root and as a non-operator user, the first certificate, then pairing, a WebSocket that stays up, a reconnect after `systemctl --user restart ducter`, and a push to the iPhone app, from a phone in the tailnet. Trigger: before the release that carries D265; so far only a fake `tailscale`.
- [ ] **`ducter uninstall --all` turns Ducter's serve off** (as it takes the Caddy site away). Trigger: the first report of a stale serve after uninstall; today it forwards to nothing and `ducter tailscale --remove` clears it.
- [ ] **The Mac app's own Tailscale path**: a home Mac in a tailnet offered `ducter tailscale` from Devices' From outside chip, beside the Cloudflare tunnel. Trigger: a Mac home user asks; the CLI already works on a Mac.
- [x] **A status probe per address on Devices**: up / can't reach / not checked per way, from the home's own check and the devices connected through it (D293). Still open: a reason per way (DNS, certificate, Tailscale off). Trigger: the live run above.

**How the machines reach each other (D293, research/97)**
- [ ] **Step 4: the same-network path** (research/97 §5.2 C): the home also listens on its LAN addresses with HTTPS from its own key, announces itself by DNS-SD with a signed record, and adds the `lan` way (reserved, nothing adds it yet); native clients and workers pin the key; together with D57's local token so loopback stops being special. Fixes the Mac home and the phone on the same Wi-Fi, and the mini beside it. Trigger: the next round after D293 is checked live, or the first person whose phone can't see a Mac home at home.
- [ ] **Step 5: the Mac app's Tailscale chip** on top of the address book (with the todo above). Trigger: as above.
- [ ] **One live run of D293**: a home with a tailnet and a domain (or a tunnel) side by side; a phone and a MacBook worker leaving and joining the tailnet; a MacBook worker closing its lid mid-task and opening it within 2 minutes (the same session carries on) and after (resumed by id); a Mac app that sleeps (睡着了 at once). Trigger: before the release that carries D293.
- [ ] **Remove a way only when no device depends on it alone** ("2 devices still reach it only this way"), research/97 §5.2 A. Trigger: the first person stranded by `ducter domain --remove` or turning the tunnel off.
- [ ] **A device that can't reach says which ways it tried and the one fix** ("turn Tailscale on"; "this phone isn't in your Tailscale network: use your domain"). Trigger: the live run above.
- [ ] **Running sessions on a worker follow a switch for their tool calls**: a session's MCP address is fixed when it starts; after the worker moves to another way, a session started before still calls the old one. Trigger: a task whose tool calls fail after its worker moved.
- [ ] **A CLI or Mac app paired before D293 learns the ways** only from a welcome (the Mac app) or by connecting again (the CLI); the CLI could keep them from its own sockets too. Trigger: a person whose CLI stays on an old address.
- [ ] **Android before 13 follows the home** (no Ed25519 in the platform there): a small verifier in the app. Trigger: an Android 12 user who moves between networks.
- [ ] **China** (research/97 §5.3): an entry in the book the person controls and that is reachable from China (their own domain on a Hong Kong or Japan server forwarding to the home, later a tiny relay of their own that forwards only end-to-end-encrypted frames: D39's Ducter Edge generalised); Android notifications through a UnifiedPush distributor that doesn't use FCM. Trigger: a person in mainland China whose home is abroad (or the reverse) asks.
- [ ] **End-to-end frames for workers over a tunnel** (research/97 gap 7): a worker's frames and MCP calls pass Cloudflare in clear today; Devices says so on its card. Trigger: a worker that only reaches its home through a tunnel.
- [ ] **Two homes in one app, and moving the home** (research/97 §5.4): the key makes both possible. Trigger: a person who asks.
- [ ] **Funnel** (`tailscale funnel`, public) is not offered. Trigger: someone without a domain who wants a public address and not Cloudflare.

**Verify for real**
- [ ] **Move your Ducter to another computer (`ducter move`)**: a Mac-first user moves the home to a server: one-time move code from the new (empty) home; moves the Log, persona, settings, rules, routines, connections and the Mem binding over HTTPS with a verified count; not harness sign-ins (re-sign on the server, guided); running tasks parked first; the old machine becomes a worker for its local repos, its app connects to the new home; old data kept 30 days with a one-tap move back. Trigger: the author's Mac → Hetzner case (2026-11-10); design first, then v0.0.4.
- [x] **Phone opened task overflows horizontally**: not the layout. The shot was taken with headless Chrome's `--window-size=390,…`, which lays out at its minimum window width (~500 px) and crops to 390. With device emulation at 390 px (CDP `Emulation.setDeviceMetricsOverride`) the folder task and a long zh title + long brief with unbreakable paths and URLs wrap, and `scrollWidth` is 390. Take phone shots with device emulation, never `--window-size`.
- [x] **Folder result shows a stray proof line**: a folder task's proof line no longer counts the changes (desktop and web); D142's sentence says them.
- [ ] **Updating in place (D148) on a real systemd box:** a 0.0.4 → 0.0.5 update of a VPS home
      and of a Linux worker from the card and with `ducter update --all`, including one forced
      rollback (a release whose binary fails `/health`) and the helper surviving `systemctl
      restart`. All steps are tested with fakes only. Trigger: the 0.0.5 release.
      **D172:** two consecutive home updates of the systemd user service now run in a VM like hel
      (`bun run e2e:linux`); still open there: a Linux worker's update, a forced rollback, x64
      (the rig is arm64 on Apple silicon), and a real network hop with TLS and a non-loopback
      peer at the auth gate (lima forwards the VM's port to this Mac's loopback).
- [ ] **D227 on the author's machines:** the MacBook's Codex step again once hel and the Mac run D227: tap 更新 on the Mac's card, then Update all; the row should say 等 Macbook Pro M3 上的 Ducter 更新完, then update Codex after the Mac is back. A real launchd restart under a running npm (the worker's leftover report from `agent-updates.json`) is only faked. Trigger: the next release.
- [ ] **Update all (D224) across real computers:** a hel home, the MacBook doing tasks (its app asked through `asksApp`) and a mini, with Claude Code and Codex behind on two of them and a task mid-turn on one agent: the order, the wait, the home's restart mid-plan, the Mac app's own restart last, the phone page's reload. Fakes and the VM cover each part; the whole only on the author's machines. Trigger: the next release with Ducter and an agent both behind. Also open: the iPhone app updates from the App Store and is not part of it; a plan step for this Mac's app when it is only a client is shown by the Mac app itself, not the home, so the phone doesn't list it.
- [ ] **Updating the AI agents (D156) for real:** an npm Codex and a native Claude Code on a
      server updated from the card and with `ducter update --agents --yes`, one forced rollback
      (a pinned npm version that fails `--version`), a worker's agent over its socket, and a
      night round inside the verified range. Only fakes so far; no real install was run. Also
      open: the partner holding a new turn while its own agent updates (only waited for today),
      a Codex app copy seen on a real Mac. Trigger: the next Codex or Claude Code release.
- [ ] **A Mac updated from the phone (D187) for real:** the author's MacBook (a worker of hel)
  from 0.0.14 to the next release, tapped on the phone: steps on the card, the putting-in screen
  on the Mac, 回来了 on the card; then once with the app closed (没开着). Also the night-time
  auto-update for Macs whose Ducter asks its app (today D148 (10) skips them; the restart would
  happen while the person may be at the Mac). Trigger: the first release that carries D187.
- [ ] **Updating in place, the rest of D148:** the partner's one line for a security release
      (nothing tells the partner yet); archive sweeps inside the runner's critical section;
      renaming from the island's tag (the card's name does it). Trigger: after the first real
      update round.
- [ ] One real-harness task on a worker (`claude auth login` / `codex login --device-auth` on
      the worker). Trigger: the user signs in on a worker.
- [ ] `ducter domain` on a real VPS + domain as root (DNS check, apt Caddy, ACME, renewal, WebSocket through Caddy
      with TLS). Trigger: the first real VPS install.
- [ ] **Opening fast (D209) on real devices:** time a relaunch of the iPad app against hel (the
      conversation in the first frame, no empty page; full screen painted within 100 ms), the iPhone
      simulator, and the Android app in the emulator (cache-first load, `reach` bringing up
      can't-reach, the stale-page reload). If the ~1.2 s before the first frame holds on a real device:
      start the web view at app launch, split the bundle so the conversation parses first, virtualize a
      long transcript. The notifications ask still appears ~0.4 s after the first frame (the app's
      push state is asked after it). Trigger: the next TestFlight build.
- [ ] Phone web on real phones: iOS Home Screen push (16.4+), and whether a token paired in
      Safari carries into the Home Screen app (if not, pair from the installed app);
      `PushManager.subscribe` on a real Android Chrome (the Chromium builds here have no push
      service). Trigger: the first phone install.

**Build next**
- [ ] **Local token (D57)** (`design/system.md` "Who counts as local"): a 0600 token in the
      data dir, presented automatically by the CLI, the desktop on that machine and the tasks'
      MCP config (beside the role token). Then every caller shows a token, loopback included;
      `DUCTER_LOCAL_TRUST` is retired, and an SSH-tunnel client connects once with a code.
      Until then, doctor warns when `who` / `/etc/passwd` shows other human users. Trigger:
      before recommending a shared host, or the first user on one.
- [ ] **Push never holds a decision past its default (D59):** coalescing (15 min) must let a
      decision out at once when its default would fire before the window ends
      (`packages/core/src/push.ts`, `tick`). Trigger: now; it is a correctness gap.
- [x] **Relayed harness logins (D52 Q17):** built for workers and the home by D363 (a device
      card's 登录, the lend sheet): Codex's device code and Claude's link with the pasted code.
- [ ] **D363, the rest** (research/132): (a) one real sign-in end to end through the card (Codex's
      device code and Claude's pasted code reaching "signed in", then a task there), only run up to
      the link and a wrong code so far; (b) an agent installed by another user than the service's
      (a root system worker and a person's own `~/.npm-global`) is not found: say so on the card, or
      offer to install for the service's user; (c) 安装 on a Mac home and a Mac worker (only Linux was
      run); (d) about 700 MB for all three agents: drop Claude Code's other platforms if npm keeps
      them, or use its native download; (e) updating Ducter's own Node; (f) haswell wiped and lent
      again from the release, as the author will. Trigger: the release that carries D363.
- [ ] **D371, the rest** (research/140): (a) Ducter's own npm install of DeepSeek Harness on a bare
      Linux VM and a Mac worker (only a scratch prefix with Node 26 was run; Ducter's Node 24.22.3
      ships npm 11.19.1); (b) a Mac with only the npm copy can't use the DeepSeek account (the
      account's sign-in lives in the app): offer the app there once DeepSeek has a download page
      Ducter can name; (c) the account route's own sign-out or a rejected grant mid-task: say
      "signed out" on the card instead of a failed task; (d) 1.3 GB: ask DeepSeek for a slimmer CLI
      package (its document tools are most of it). Trigger: the release that carries D371, or the
      first report of a DeepSeek-only user.
- [ ] Desktop: a 断开 / Disconnect item and a visible "connected to <host>" line, so a remote
      connection is never invisible.
- [ ] A2-W confirm card ("vps-1 想加入 …" with Go / Not mine) in the Devices UI. Today a worker
      joins with a code typed on the worker, with no confirm step.
- [ ] Workers: a new task for an asleep worker waits instead of being refused; place by need
      ("needs Linux", a repo only the worker has); browser places on a worker; keep a session
      alive across a short socket blip instead of close + resume.
- [ ] Device key + passkey for the phone/web client (code pairing and the `/pair#c=…` page
      exist). Trigger: the Ducter Edge, or a second phone per user.
- [ ] Keychain for the desktop token (today a 0600 file under the user config dir).
- [ ] `ducter service` on macOS (launchd) for a Mac that serves others.

## Mac app and first run (`design/onboarding.md`)

- [x] D56: Ducter keeps running when the window closes; Quit is the explicit stop. Built as a
      per-user LaunchAgent (`apps/desktop/internal/local/agent.go`); `design/onboarding.md`
      "Lifetime" describes it.
- [ ] Walk a really blocked Mac through the app (blocked, name and failed screens are verified
      headless only), and check an ad-hoc build's helper loses its quarantine flag after
      Open Anyway. Trigger: the first friend install.
- [x] The partner's real first words (D298): a Log message from the home, offers from the
      person's own Claude Code and Codex records, 别再看了 in place.
- [ ] **D298 live:** a real first install with Claude Code and Codex records (the titles read
      right, Ducter's own sessions left out), and a real DeepSeek, Kimi and OpenAI key each (the
      balance read, a wrong key, no balance; OpenAI from mainland China without a proxy). Trigger:
      the author's next fresh Mac or the first friend install.
- [x] **D298: paste a key in Settings › Partner and Devices** (D307: a row on Partner and on the
      home's card in Devices, Mac and web).
- [x] **D298: Mem's line in the first words** (D329 (1)): one line that Mem is there and one start asking
      what it remembers; nothing in Mem read for them.
- [ ] **D298: pi without node in the app.** A key for pi on a Mac without node opens pi's
      installer in Terminal (it asks before installing Node). Install it in the app (a Job that
      answers the installer, or Ducter's own Node) when the first consumer hits it. Trigger: a
      first-run report of it.
- [ ] **D298: Alibaba Model Studio (Qwen) keys** are recognised and checked but not usable (pi has
      no plain Model Studio provider). Trigger: pi adds one, or a user asks; else a pi custom
      provider in a Ducter-owned pi home.
- [x] **D298: a Settings switch for the first words' looking** (D307: Settings › Partner › 你的 AI
      agent 留下的记录, with Past tasks' hidden agents and 再显示 beside it).
- [ ] **D307: the keys kept** (`keys.env`): a list in Settings with which provider and a way to
      remove one. Trigger: a person who pasted a key they want gone.
- [ ] Rename the partner from the desktop (today the name is asked once, in the terminal or
      the app).

## Partner and tasks (`design/plan/v1-tonight.md` "Known gaps", `research/30`)

- [ ] **The workbench, after D214** (`design/workbench.md`): (1) a worker task end to
  end (a second scratch Ducter as a worker; its page through the worker's socket), and hot reload
  for a worker's page (a websocket carried over the worker link). Trigger: the author's first
  coding task on hel with a dev server. (2) A terminal: a server-owned PTY per task with a bounded
  tail any client reattaches to, read-only first. Trigger: the author asks to run
  a command beside the agent, or a task's dev server log is needed. (3) Comments on diff lines and
  on the preview, sent with the next words as chips (Conductor, Codex). Trigger: the first review
  of a real task's diff in the workbench. (4) Per-hunk revert and "this turn" as a scope (Codex).
  (5) The Mac: resizing the column, the Results page, an embedded preview (a web view).
  (6) Computer use (the agent driving a desktop) gets the same Screen frame once Ducter streams it.
  (7) Verify the phone sheet in the iOS Simulator and on Android; a single-HTTPS home's Preview
  through Ducter's browser on hel.
- [ ] **D220, the simulator and the working copy**: (1) **Taps, swipes and typing on the
  simulator.** simctl has none; every route loads Xcode's private CoreSimulator / SimulatorKit
  frameworks (idb, AXe, serve-sim; one route is installing npm tools after a consent step). Decide between
  a consented install like D217's phone and a small helper of Ducter's own built against the
  user's Xcode, with its version pinned per Xcode. Trigger: the author asks to tap in the
  simulator from Ducter, or an iOS task needs the user to drive the app while it watches.
  (2) A faster screen (an H.264 stream from `recordVideo`, or the helper's framebuffer) when 3–4
  frames a second is too slow for an animation. Trigger: the same helper, or a task about motion.
  (3) Android emulators the task builds for (not Ducter's own phone) by adb, the same rail.
  Trigger: the first Android dev task. (4) A worker Mac's simulator end to end through its socket.
  Trigger: the author's first iOS task on a worker Mac. (5) Task-to-task lineage (a task opened
  from another's result, or forked to try another way) in 谁做过 / Who's worked on it; the model
  has no such link yet. Trigger: "continue this in a new task" or a fork lands. (6) Ducter's phone
  live in the Phone page on a Mac with 用手机 installed (built and unit-checked; not seen with a
  real emulator here). Trigger: the author's review on their Mac.
- [ ] **The persona's one stale button word (D212)**: rule 15 says On hand keeps a missed wait
      "with 接着等 / Keep waiting"; the button is 继续等 now. Not changed alone because a persona
      change needs a fresh eval (D175). Trigger: the next persona change, in the same run.
- [ ] **The zh pass, round two (D212)**: the agent's English step titles inside zh chrome (D211's
      recommendation), and an audit of the CLI's long help lines with a native reader. Trigger:
      the author's review of D212.

- [ ] **The opened task, after D268:** (1) a subagent has no running state: the runner logs a
      subagent's call only when it ends (and drops its chatter by `agentPath`); a running row
      needs the tool's start logged. (2) ~~A queued message can't be edited or taken back~~:
      done by D325 (Ducter holds it). (3) Thinking opens to its headings only (D127 keeps no body). (4) A plan longer than
      the 2 KB input preview is cut and not shown; raise the preview for plan tools if real plans
      hit it. (5) Code blocks in the agent's words are mono 13, not 12 (MyGo's Markdown sizes
      spans and blocks from one CodeSize). (6) Closed by D270: the header's subtitle is gone,
      the head's meta line says it once. Trigger: the author's review of D268.
- [ ] **The opened task, after D210**: (1) a step under way: Ducter's Log has a
      tool call only once it is done, so the foot names the latest finished step; a "running"
      line needs the runner to log a tool's start (OAR's item started events). Trigger: a live
      run where the foot lags a long command. (2) The agent's words appear whole, not streamed;
      streaming needs text deltas in the Log. Trigger: the same. (3) Done in D271 (the Mac's
      page is a `ui.List`). (4) Check the foot, Esc twice and Jump to latest on a real iPad and a
      real long run with the author.

- [ ] **The opened task, after D271**: (1) done in D279: a progress report after `wait_for`
      leaves the card on Waiting (core's `rests`). (2) Done in D284: the newest window first, pages
      in the background up to 2,000, then as the reader reaches the head. (3) In a loop, a finished round folds everything
      before its last words, so a review round's findings hide under "做了 8 分 21 秒" when its
      last words are "45 分钟后再看"; consider keeping the round's longest words in view. Trigger:
      the author's review of D271. (4) The web's locator marks the turns in view by scroll
      position (no virtual list); the Mac's by the list's rows. Check both on a real loop.

- [ ] **The opened task, after D284**: (1) check the opening time against the author's own VPS
      home (the perf tests simulate a 4 Mbit/s link) and the locator's glide and tint on the real
      Mac and in Safari on an iPhone (the web keeps the reader's place itself when older pages
      land; WebKit has no scroll anchoring). (2) The web unzips a gzipped frame only where the
      browser has DecompressionStream (Safari 16.4+); older ones take text as before. (3) The
      socket's own deflate (permessage-deflate) for every client if the phone app's or a
      worker's link is slow too. Trigger: the author's review of D284.

- [ ] **A long session, after D320**: (1) scroll a real 50,000-event loop on the author's VPS home
      in the Mac app and Safari on an iPhone (the perf tests and headless Chrome only). (2) The
      locator's rail draws one tick per turn: past about 2,000 turns the ticks merge; consider
      drawing it by time or by density. (3) The browser app a run of steps is in no longer
      carries from the turn before (a turn is built only when drawn). (4) Key redaction is slow
      on one megabyte-long token (a base64 blob): the cut at 20,000 characters bounds it at about
      half a second; a faster redaction for long tokens. (5) Placeholders are blank; a faint
      skeleton if the author finds blank jumps unclear. Trigger: the author's review of D320.

- [ ] **The eval's new gaps on haiku** (research/48 addendum, `eval/results/2026-11-10-haiku-d175.md`):
      (1) it says a rule is kept without calling `rule_save` / `notice_rule` (an honesty gap: a
      code check could refuse "已存在「你的规则」" prose with no rule saved this turn); (2) it answers a
      web look-up (HN today, a latest version) from memory instead of opening a browsing task;
      (3) `needs.long` and a named agent's `harness` are left out. Persona change, then a fresh
      eval (D175 (4)); check sonnet too. Trigger: the next persona change.

- [ ] **A two-tier partner tool list** (D175 (5), research/48 §3): the core tools always, routines,
      rules and connections loaded when used. Not now: the 24 tools are ~7K tokens. Trigger: the
      partner's list passes 30 tools or 32K JSON chars (`tool-budget.test.ts` G2 forces it).

- [x] **New task: attachments (D128).** Done by D206 for pictures (drop, paste or 加图片 on the
      What row; they go to the task with the words), and by D259 for any file.
- [ ] **Projects: rename and remove (D186).** Defaults: click the name in By project to rename
      (the `cardName` control; every task carrying it follows); remove from the group's ⋯, its
      tasks untouched. Trigger: the first time a folder's name isn't the name the author wants.
- [x] **Projects: add a folder on the server itself, or from the phone (D186).** Done by D203:
      找一个文件夹… on any computer of the home, from any client.
- [ ] **New task: "every time something happens" (D185).** The card's 等某件事发生 is one-shot;
      a repeating condition still goes through the partner (its check is compiled by a model).
      Trigger: the first time the author wants a watcher without saying it.
- [x] **New task: By project on the phone (D128).** Built as D261's project lens: a row of names on the phone.

- [ ] Two results landing together still mention branches and guess at merge conflicts (eval
      `settle` 0/2). Settlement batching in code, not prose.
- [ ] Greetings sometimes give two examples (eval `first_words` 3/4).
- [ ] Re-verify live that a task never phrases Hold as "no" (brief changed, not re-run).
- [ ] Parked Claude Code sessions take ~10 s to resume; nothing prewarms tasks.
- [ ] **Archive horizon for dropped and failed-to-start tasks.** The sweep archives only `done`,
      `done?` and `failed` tasks idle 14 days; a dropped task keeps its worktree for Undo.
      Trigger: worktrees of dropped tasks pile up on disk.
- [ ] **A resume rejected after it started** (the harness accepts the id, then its stream
      errors) still parks the task; only a refusal at start falls back to a new session.
- [ ] Tasks can write outside their place (one used `/tmp/flk`); no sandbox on the Mac.
- [ ] **D198 on the phone and web:** the opened task shows no working-copy path there (the Mac
      app does; there is nothing to open it with). Trigger: someone wants to copy it from the phone.
- [ ] **D201: Rex can't be opened at a folder on macOS yet**, so 打开 leaves it out until its
      Info.plist claims folders. Its bundle id (`com.superlogical.rex`) is inferred; check it on an
      installed copy. Warp's URI is documented, not run here. (con ships it from 0.1.0-beta.177,
      nowledge-co/con-terminal#557: its Info.plist claims `public.folder`, so Ducter lists it with no
      change; seen in the release's plist, not yet on an updated copy.) Trigger: Rex ships folder
      opening, or someone with Warp tries it.
- [ ] The honesty guard is a regex over zh/en wording; it can miss paraphrases.
- [ ] Measure partner latency on opus (live runs used sonnet only).

- [ ] **Reversible asks carry a default (D67):** the ask tool and persona give every
      how-to-do-the-work choice a default and a time (10 min); only effect-ladder asks wait
      with no default. Re-run the eval's ask scenarios after.
- [ ] **Long paths in bubbles (D67):** middle-ellipsis with tap to expand, desktop and phone.

### What it thinks with, and who does the tasks (D89, D90)

- [x] **The partner runs on `Settings.brain`** (harnesses, D85) and a live session ends at the
      next message after a switch (ai-loadout): unit (fake runner) and end to end on OAR's
      scripted runtime (`packages/cli/test/brain-switch.test.ts`). A live Codex partner turn is
      still to walk.
- [ ] **Codex as what it thinks with** behind its config isolation (`-c` overrides, no user
      `AGENTS.md`) and a pass of `packages/partner/eval`. pi and DeepSeek Harness: done (D177,
      research/50 §5).
- [ ] **The partner's prompt sees Your rules** (today core applies them in `fw_candidates`;
      the partner learns them only through `rule_list`). Trigger: a rule the partner ignores
      when it pins a harness itself.
- [ ] **Allowance on the tray is real** only where a harness reports it (`DeviceHarness.allowance`);
      probes for Claude Code (`get_usage`) and Codex (`account/rateLimits`) are not built.
- [ ] **Live handoff** between harnesses: verified with fake sessions only (runner test).
- [ ] **Human comprehension test** of the socket and tray (`design/ai-loadout.md` §6: ≥ 80% on
      key items, no boss or servant reads).
- [x] **Devices mark** is an icon-only badge on the coin (`BrainBadge`, tooltip and accessible
      name "{name} 想事情用"); the rebuilt Devices stage (`isles`) only has to keep calling it
      inside a token's coin box.
- [ ] **The phone's opened task** keeps its title as the headline; D90's "what it is doing
      now" headline is desktop-only so far.

## The quiet conversation (D104, `design/quiet-conversation.md`)

- [x] The ack says how long work usually takes and that it will say when it's clear (D120):
      persona rule 2, the partner eval's ack scenarios (`ack-*-estimate`, `ambiguous-zh`).
- [ ] Estimates grounded in the user's own history: today the partner has "took about N min"
      on recently finished tasks and what it was told; a per-project median of past task
      durations would ground more acks. Trigger: acks without a number feel vague in dogfood.
- [ ] Ack and go on harnesses that stream no tool-call input (the head never arrives): the task
      then opens when the call does, as before D120. Check Codex, pi and DeepSeek Harness live
      with `packages/partner/eval/latency.ts --harness …` once it takes that flag. Trigger: a
      partner on one of them.
- [ ] The waiting line on a real partner turn (opus), timed end to end: first step, each step,
      the ack. Verified so far on the demo's scripted partner and in unit tests. Trigger: a
      live run with a signed-in harness.
- [ ] The iOS shell (`apps/ios`) renders `apps/web`, so it should follow; check it in the
      Simulator. Trigger: the next iOS build.
- [ ] A ↗ line in the demo seed, to show what went out stays in view (the seed sends nothing
      out). Trigger: the next demo-seed change.
- [ ] Consumer voice on a cheap model (D129): haiku still names the leftover items ("证书、描述
      文件…"), writes a third sentence in a relayed question, and sonnet once said "点 Go". Try a
      code guard (drop a relay clause naming Go / Hold, as D109 refuses wrong-language asks) and
      more voice scenarios (en result, a relay with a default). Trigger: the next partner eval
      round, or a dogfood message with jargon.
- [ ] The partner relays a task's question with its own Go words: today the button says the
      task's default ("好，Continue" when the task gave none). Let the relay carry a goLabel.
      Trigger: a relayed question whose button reads wrong in dogfood.
- [ ] A push for a task's question goes out with the task's wording, before the partner has said
      it (D129 holds only the conversation). Hold the push for the relay, up to the same 60 s.
      Trigger: push dogfood.
- [ ] **D307: the web's forced paper in the iPhone and Android shells** (the page turns; check the
      shells' own status bar and background under a light page on a dark system and back). Trigger:
      the next iOS/Android build.
- [x] **D307: the web's 这台手机 / This phone on a desktop browser.** Done by D330 (1): 这台电脑 / This
      computer, with the clay laptop.
- [x] **research/118: the demo cores read the machine's own Nowledge Mem and audio devices.** Done by
      D337 (3): every demo starts from `apps/web/demo-core.ts`.
- [x] **research/118: Updates and about on a Mac home says two checks.** Done by D337 (2): one check, the
      latest, one button. Still to see with a real feed failure on a real Mac home.
- [x] **research/118: Accounts' own-number setup is open for everyone.** Done by D337 (1): one row with
      设置 / Set up until opened or started. Trigger for review: the author's next Settings pass.
- [x] **research/123: a sheet's content shows above its top edge on iOS.** Done: every sheet is a
      frame that keeps its rounded shape (`overflow: hidden`, the grab on it) with a body inside
      that scrolls (`sheet-frame.tsx`); re-walked on both phones, nothing above the edge.
- [x] **research/123: 试试看 on a 375-pt phone.** The two exchanges sit on the text column (52 pt
      in), so each bubble is about 195 pt wide and wraps to three lines in en. Dropping the empty
      tile column for this block when narrow would break D283's grid; a design call. Trigger: the
      author's review of the page on a small phone.
- [x] **research/123: the demos named the home `hel`.** Done: they say `home-server` (a server home)
      beside demo-core's Ada's MacBook Air.
- [ ] Watch D302's light-to-dark cross-fade on a real Mac at macOS's Auto switch, and the dark
      Devices sea and coins at full size. Trigger: the author's next evening session.

## Keeping your place and copying (D254, research/83)

- [ ] **The long press on real WebKit and Android touch:** the iPhone app in the Simulator and on a
      device, the Android app on the emulator and the Pixel Fold: the menu always opens (never the
      system's selection), Select text's sheet selects with the system's handles, Copy works over
      the home's plain http in both web views (the hidden-field fallback). Shots so far are
      Chromium with an iPhone UA and synthetic pointer events. Trigger: the next iOS/Android build.
- [ ] **Find in the conversation** (⌘F on the Mac and the wide web, a magnifier in the phone's
      header): matches in the loaded conversation, older ones through the home (the Log, and Mem's
      recall for the gist). Trigger: the author or a user scrolling for something said last week.
- [ ] **Dynamic Type on the phone:** the web client sets its sizes in px; follow iOS's text size
      in the iPhone app (`-apple-system-body` as the root size, the scale tokens in rem). Trigger:
      a reader with a larger text size, or the accessibility pass.
- [ ] **The time on hover on the Mac** (the web's menu has it; the Mac's right-click menu cannot
      show a disabled line yet). Trigger: MyGo's menu gains a header item, or a reader asks.
- [ ] **The draft across devices:** kept per device today; a draft started on the phone and
      finished on the Mac would need the home to keep it. Trigger: asked for.
- [ ] **Older messages:** a fresh open replays the last 200 channel events (core `REPLAY_FRESH`);
      not checked in D254 is whether scrolling to the top of a longer conversation brings older
      ones, keeping the place. Trigger: a conversation longer than the replay.

## The reply pebble (D256)

- [ ] **An iPad with a trackpad or mouse** reports a fine pointer that hovers, so it gets the
      pebble; check it there (and that a finger on the same iPad still swipes). Trigger: the next
      iPad build.
- [ ] **A message of pictures alone on the web** is placed by rule (left of the pictures, by their
      width) but was not in the browser pass's demo; look at one with one picture and with a grid.
      Trigger: the next pass over the media shots.
- [ ] **Keyboard on the Mac:** the pebble shows on hover only; a way to reply from the keyboard
      (focus a message, then ⌘R or the menu key) is not designed. Trigger: the keyboard pass, or
      asked for.

## Long-term memory (`design/memory.md`)

- [x] **Memory shows Mem's own memories, by kind** (D257, research/84 §4): built by D321 (groups by Mem's kind,
      each line's source, Fix and Forget in Mem); closed in D329 (7).
- [ ] **The glance reads the identity's lane too** (D329 (7), D229): Memory's groups read where saves land
      (`m list` with no Space); recall also reads the identity's lane (`--space-id`). Read both and merge by id,
      as recall does. Trigger: a real account whose lane holds memories about the person that the page misses.
- [x] **Nowledge Mem in 全部更新 / Update all** (D257 option C): built by D329 (6), the home's `nmem` after the
      agents, by day only.
- [ ] **Mem in Update all on a worker** (D329 (6); D366 puts one there through uv: `uv tool upgrade nmem-cli` with its tools-folder env): only the home's `nmem` is an item; a worker's own `nmem`
      (its tasks' Mem plugin) is not. Trigger: a worker whose tasks need a newer Mem.
- [ ] **An On hand line when a Mem update blocks something in use** (D257 (5)): today the update is said on
      Memory, on the Settings entry, and on 和你的其他 agent 通信 when a connection fails with a newer Mem out. If people
      miss it there (Bridge broken for days), add one quiet On hand line. Trigger: a real report of a missed
      update.
- [ ] **The notebook mark's comprehension test** (D257, AGENTS.md's metaphor rule step 4): naive raters (LLM
      proxies, then people) read the drawn notebook on the Settings rail without its label. Not run with D257
      (it would write to `~/.claude`). Trigger: the next metaphor test batch.
- [ ] **Review D257 on the iOS Simulator** (memory: verify on iOS): the Memory page at 390 in light and dark,
      the Settings list's notebook and coins marks. Trigger: before the next tagged release.
- [ ] **Ask Mem for orchestrator attribution on plugin writes** (D175 (6), principle 17): a task's
      plugin capture records the persona and its agent's `source_app`, but nothing says Ducter
      ran it or which task. Ask for an env the plugin passes through (e.g. `NMEM_ORCHESTRATOR`
      with a task id / Log pointer). Trigger: the next Mem sync.

- [ ] **Measure the Mem plugin's Context Bundle per agent** (research/48 M2): one scratch task per
      harness with the plugin present, on a real persona, at the task window; read the first
      turn's input tokens with and without the plugin; record it as `memPlugin.contextCost` in
      harness-facts and add its ceiling to `prompt-budget.test.ts`. If it is large, ask Mem for a
      size knob. It re-enters after each compaction (SessionStart "compact"). Trigger: before the
      first tagged release.
- [ ] **Codex: does memory off hold?** (research/48 M3) The setup guide adds "its hooks script"
      beside `codex plugin add`; if it lands in the user's own hooks, `plugins.<id>.enabled=false`
      leaves its SessionStart hook running. Check on a scratch `CODEX_HOME`; if so, also turn the
      user's hooks off in memory-off tasks (`features.hooks=false`), and say so. Trigger: same.
- [ ] **DeepSeek Harness memory off** (D174 (7)) runs under a Ducter-owned home: verify the login
      and the profile bundle's absence on a real install. DSH 0.2.2-rc.1 now runs live (D177): the
      login holds in an owned home (the key from the env); the bundle's absence needs Mem's DSH
      bundle installed in a user home to compare. Trigger: a user with Mem on DSH.

- [x] **One live write**, read back, then removed (D63, D141 (6), 2026-11-09): identity,
      `source_app` and `metadata.source_message_id` verified on Cloud. The key may not create
      Spaces, so it went to the Personal zone, not a `ducter-scratch` Space.
- [ ] Re-run `mem-live.ts --real` with a key that may create Spaces and Agent profiles, to check
      the `ducter-scratch` Space and the rename (`nmem agents set`) live. Trigger: an owner key
      or a local Mem.
- [x] The Bridge's named Agent Context names the persona's identity (D141 (7)): D205's connect names it
      (`--agent-id`) and the passive setup afterwards must say the same identity, or Bridge stays off.
- [x] Outbox with idempotency keys when Mem is down (D329 (4)): `<partner dir>/mem-outbox.json`, replayed
      with Mem's upsert id, said on the Noted line.
- [x] Search before writing, to supersede instead of duplicating (D329 (2), `nmem m supersede`).
- [x] Undo on the Noted line (D329 (3): archive, never delete; a replaced memory comes back).
- [ ] **D329 against a live Mem:** the outbox's UUID-shaped key as `m add --id` (accepted? upserts?), `m
      supersede`, `m archive` (out of recall, still readable) and `m show`'s JSON shape, on a scratch identity;
      then name the key on a save's first try too (a timeout that wrote still makes one memory). Trigger: the
      `mem-live.ts --real` re-run above (an owner key or a local Mem).
- [ ] **A semantic judge for "the same thing"** (D329 (2)): supersede catches alike titles only; a changed
      preference titled differently stays a second memory. Let the model say it replaces a recalled one
      (a `memory_add` argument, with a D175 eval). Trigger: a real report of two memories for one preference.
- [x] Tasks (windows) as the same identity: `NMEM_AGENT_ID` in the task's session spec (D141).
- [x] Nowledge Mem in tasks (D168, built with fakes): the plugin stays on as the persona, Ducter
      fills in where it isn't, `remember` proposals, the plugin off in the task with memory off.
- [ ] Live: a Claude Code task and a Codex task on a computer with the plugin: its SessionStart
      Context Bundle loads in the task under the persona's identity (`NMEM_AGENT_ID`), its
      captured thread lands as the persona with the task's native session id, and no mailbox
      notice shows. Trigger: before calling D168 done.
- [ ] Live: memory off really keeps the plugin out (Claude Code `--settings enabledPlugins` is
      INFERRED; Codex's per-id switch is VERIFIED for other plugins, research/38), and the
      Codex plugin's hooks from its `install_hooks.py` don't still run. Trigger: same.
- [ ] Does Mem distill a captured thread into memories by itself? If so, a task's `remember`
      and the partner's `memory_add` could duplicate it: ask Mem's team, then dedupe or drop
      `remember` where the plugin captures. Trigger: the first live run above.
- [ ] A recall relevance floor and a better query than title + brief, measured on a real
      channel replay with tasks. Trigger: the replay in "The conversation's own memory".
- [ ] Live: 装上 on a real worker with a fresh Claude Code, through Mem's SKILL.md to a passing
      `nmem --json plugins inspect --host claude-code`; and the connect-link ask when Mem isn't
      connected there (D169). Trigger: before the first tagged release.
- [ ] 有新版 / update: Mem's check names no newer plugin version today; when it does, the line
      shows it (built, untested against a real answer). Trigger: nmem adds it.

## The conversation's own memory: digest, window, recall (`design/memory.md`, D123)

- [ ] **Turn automatic pre-turn recall on** (built, gated, logged in `spine_recall`; off by
      default). Trigger: its admitted-hit precision measured on a real channel replay clears
      0.8 (the eval's corpus gave 5/8, below the bar).
- [ ] **A real-channel corpus for the eval**: a replay of the author's own channel (zh + en),
      ~100K tokens or more, at production budgets, so digests compress 20–50× (today's corpus is
      ~2K tokens at budgets scaled 50× down: it checks what is kept, not compression). Also
      LongMemEval_S / LoCoMo for an outside calibration. Trigger: before tuning `T_hi`, `T_lo`,
      the epoch size, or the recall gate.
- [ ] Vectors next to FTS5 (Qwen3-Embedding-0.6B or bge-m3 in sqlite-vec), fused by rank.
      Trigger: lexical misses on paraphrased questions in the real-channel eval.
- [ ] Index digest TOC rows as coarse search nodes (RAPTOR-style), so `log_search` can hit a
      topic as well as a line.
- [ ] The main AI marks a topic finished (a tool, or a marker in its reply). Today only a merge
      or PR by button counts as a finished topic.
- [ ] Writer: a cache-aligned side call on the warm main session instead of a fresh session
      (research/14 §6.3), and a self-critique pass before the audit. Trigger: the writer's
      cost or its rewrite rate in real use.
- [ ] Roll-up loss over months (level-2 epochs are not built; stop at level 1 until measured).
- [ ] Re-cut by expected cost with P(warm) (principle 4): today a warm session re-cuts on one
      threshold (the harness's context count past 120K, digest or not; `context.md`).
- [x] The partner's harness compactor bounded above the re-cut (Claude Code window + no idle or
      precomputed compaction; Codex token limit), the context size taken from the harness's own
      count and kept across a resume, and a re-cut with no digest (research/11 §7.3.7).
- [x] Bound pi's and DeepSeek Harness's own compactors for the partner (D177): DeepSeek Harness
      by its owned home's `compaction-basic.thresholdRatio` + `retainTokens` (live); pi by Ducter's
      re-cut at 120K (pi's own point is the window minus 16K).
- [ ] pi's own compactor as a second bound under the re-cut: an extension on
      `session_before_compact` that cancels in a partner session. Trigger: a pi model with a
      window under ~140K offered as the brain.
- [ ] D135 small windows on pi and DeepSeek Harness: pi has no per-session window or
      compaction flag (settings.json `compaction.reserveTokens` only; a project `.pi/settings.json`
      or an extension on `session_before_compact` could carry the save/re-inject). DeepSeek
      Harness tasks in a Ducter-owned home (memory off) get the compaction point (D177); a task in
      the user's own home keeps the user's. Trigger: a task on either runs long.
- [ ] D135 periodic re-verify of `design/harnesses.md`: `bun scripts/probe-harnesses.ts --strict`
      on each harness update (and in CI on a machine with them installed); widen `verified` only
      after the live checks behind each fact are re-run. Trigger: `ducter doctor`'s warning, or
      any probe drift.
- [ ] D135 live checks owed: a task that actually reaches 160K on Claude Code and on Codex
      (the save ask lands mid-turn, the PreCompact note shows in the summary, the brief comes
      back, Details counts it); OAR's mid-turn `usage` events carrying a fresh context reading
      (INFERRED; tests use fakes). Trigger: the next token budget for a long live run.
- [ ] A long-running live check that the harness never compacts the partner: count
      `partner_session` `harness_compacted` events in real use. Trigger: the first one seen.
- [ ] Read-fold and late fold (principle 5) are still not built.
- [ ] Meter the digest writer's cost (the eval records answer cost only).

## What you said comes back (D281, research/91)

- [ ] **Live on the author's homes:** a week of real conversation with the morning note on; count
      (only counts) the lines kept, said, covered by a wait, let go, and muted. Trigger: the next
      release that reaches the author's Mac and hel.
- [ ] **A held-out precision set** from the author's real conversation (his own lines, read with
      his yes, counts and verdicts only in git): the rules were tuned on the corpus they are scored
      on. Trigger: the first wrong "you said…" he reports, or the live week above.
- [ ] **A cheap model's pass over a turn** for phrasings the rules miss ("周五之前把报告交了", "别忘了…"
      said without 我), at most once a turn and only on lines with a day or time word. Trigger: the
      live week shows misses.
- [ ] **Pin the language when it is unset:** `zh()` follows the last message, so one English line
      flips the next morning note. Trigger: a mixed-language week on any home.
- [ ] **A trust number per kind** ("of what it said this month you acted on n"), from Go, 有用 and
      这类不用告诉我, under 今天看了什么. Trigger: the author asks how often it was right.
- [ ] **"Done" for a kept line:** a reply that says it was done ("交了") quietly drops what is still
      ahead. Trigger: a reminder said after it was done.

## The plan sheet and the aha moments (D388, research/154)

- [ ] **The author runs `ducter proactive replay --days 3` on hel** and compares it with the other
      app's morning (research/154 §1): which of the four moments it would have said, when, and what
      the cheapest model made of the weekly report (a `plan` fact or nothing). Trigger: the release
      that carries D388 reaches hel.
- [ ] **Look before saying, when a look can settle it:** run the web look for a contradiction's open
      time before the find is said, and say one complete message instead of two. Trigger: replays or
      live days where the follow-up comes within the hour of the find.
- [ ] **A notice Rule for the open question's web look** ("别替我上网查活动时间"), and the look's count
      in 今天看了什么. Trigger: the first person who asks why it searched, or the live week.
- [ ] **Their public posts as a source** (the other app named the author's own post about attending):
      only with a yes, only their own accounts. Trigger: a person connects a social account.
- [ ] **The replay over a longer look back** (`--deep`: the 60-day subjects into the ledger first), so
      a booking from weeks ago meets this week's mail. Trigger: a replay that misses a join the live
      engine makes.
- [ ] **The person's own words dated by when they said them:** in the replay their lines are copied
      in at the replay's time, so "周六" resolves from today, not from the day they said it. Trigger:
      a replay across a weekend.

## Your accounts and connected AI agents (promised as "coming soon" on the site)

The site, README and `docs/faq.md` say these are coming. Each needs the change loop (a design
note and a `Dn`) before it is built.
- [ ] **Accounts through OpenConnector** (https://github.com/oomol-lab/open-connector): Gmail,
      Google Calendar and others, with the runtime self-hosted where Ducter runs so provider
      credentials never reach a harness. Reads pass; any write that sends goes through the
      partner's Go like every other outbound. Needs a research report first (its credential
      boundary, action allow/block policy, MCP surface, license: modified Apache 2.0 that
      bars offering it as a hosted service, which embedding in Ducter is not). Trigger: the
      first user scenario that needs mail or calendar.
- [ ] **Proactive help (D165) and the accounts card (D166): the live trial**, `connectors.md`
      §1.1. Steps 1–9 are built and tested on fakes (2026-11-10). Owed: (10) a live trial on the
      author's oo with a scratch home (which action ids oo answers for calendar, GitHub and chat;
      a real morning; a Go task end to end); a live triage run on a private labeled set from the
      author's inbox (outside git, like research/15), scored with
      `packages/partner/eval/proactive/` to tune the cap and the per-kind bars; iOS's
      time-sensitive category for "now". Trigger: the author's go for a live trial.
- [ ] **D226 on hel, the first live week** (`connectors.md` §1.2, §5.1): after the release,
      read-only: `findings.json` exists and grows; `proactive.json` `month.tokens` moves and
      `backfill` reaches `done` for the oo source; no `triage:` warnings in the journal;
      今天看了什么 shows read > 0. Then decide with evidence whether the bar is too strict for the
      first days (在等你回 only for people and after 2 working days; a company mail that needs
      an answer, like dots' warranty example, never qualifies), with the triage eval
      (`packages/partner/eval/proactive/`) on a private labeled set. Also: the long look back reads
      at most 50 mails per account (one page); paging it is owed if the eval shows misses.
      Trigger: one week of hel running D226.
- [ ] **D243 live on hel** (research/81 §7): counts only, after the release: how many of the
      ~114 daily notices pass `NOTICE_TERMS` and what they cost against `NOTICE_DAY_MAX`; that
      Codex's cheap model gives `service` and `billing` facts; the judge's keep rate under the new
      rubric; `clientZone` set by the app's hello. Trigger: the first release with D243.
- [ ] **D250 live** (counts only): on hel, whether the one line offering the morning note back was
      said and how it was answered; on a fresh scratch home, the first morning message on the
      default with the chips under it, and shots of both (web 390 zh/en, Mac). Bump `NOTES_REV`
      (engine.ts) only for a material change in what the notes can notice, with its own Dn.
      Trigger: the first release with D250.
- [ ] **Topics the person follows** (dots' "news on something you care about", research/81): a
      product or a project they use, through Mem, so an announcement about it is a find. Trigger:
      D243 live and the author's labelled week.
- [ ] **Proactive judged per item, not by hand-written detectors** (D232 next): the cheap model
      says per item whether the person needs to know and by when; code keeps timing, caps and
      dedup, and the cross-source checks (a stay vs a flight). Only after a labelled week from the
      author ("should this have been said?") scored for precision of what is said and recall of
      what mattered, against today's detectors. Trigger: hel's first findings under D230–D232
      and the author's labelled week.
- [ ] **Mailbox and app-tile art** (D166): a clay mailbox per source colour at 640 (closed, lid
      up, grey) and the app tiles' clay base; marks per each brand's guidelines (D146's rule).
      Then the human comprehension test (with D65's). Trigger: met (D166 decided 2026-11-10).
- [ ] **oo's own read/write hint and action list** (D122, `connectors.md` §18.4). oo has no "list
      actions" and `connector schema` carries no read/write; OOMOL has both (its generated
      `oo-gmail` skill tags `[write]` / `[destructive]`). Ask OOMOL to expose them, then use
      them over the verb rule (keep the rule as the fallback). Trigger: the next oo release, or
      a conversation with OOMOL.
- [x] **OOMOL Hosted with a real key** (D158, research/44 §6). Done 2026-11-10 (D180): the
      console key works as Bearer at `/v1/mcp`; the tool list had been renamed (`connector_*`),
      so the catalog is now inferred from what its tools take; `/v1/apps` gives `id`, `alias`,
      `accountLabel`; search, read/write and a read on each Gmail account checked live.
- [ ] **A task loaded the user's own Claude skills** (`oo-gmail`) although the clean setup sets
      `userConfiguration: "exclude"`. oo is now signed out for every session (D122 (6)), but
      other user skills that act on accounts are still reachable. Check what OAR's exclude
      covers for skills and close it. Trigger: the next harness change.
- [ ] **Connections in the CLI** (`ducter accounts`, the oo tap and the address form) for a
      server with no app attached. Trigger: the first headless user who wants mail.
- [ ] **Partner eval cases for accounts**: share with a task in the same turn; a Go label in one
      language (the live trial got "存为草稿 / Save as draft", against D109); read message bodies
      before flagging, not only snippets. Trigger: the next eval round.
- [ ] **Nowledge Bridge live** (`design/bridge.md`): the live J1 round trip, then outbound
      (J4). Trigger: the account is enabled for Bridge.

## Calendars (D222, `design/calendar.md`, research/65)

- [ ] **One real Go per change, on a test calendar of the author's** (create with a guest who is
  the author's other address, move, answer an invitation, cancel), through oo: that the staged
  input runs as built, the card settles with its link, and whether `online` gives a Meet link
  (oo exposes no `conferenceDataVersion`). Trigger: the author back and willing; never on a
  real meeting.
- [ ] **Outlook calendars** through oo's `outlook_calendar` (`list_calendar_view`, `list_events`,
  `create_event`): the same merged day and cards. Trigger: someone with Outlook connected in oo.
- [ ] **Recurring events:** "every week from now on" for a move or a cancel (today one occurrence).
  Trigger: the first ask for it.
- [ ] **A guest's zone without being told:** from Mem (where Lina lives) or the guest's own
  calendar settings when shared. Trigger: a wrong-zone proposal seen in use.
- [ ] **Comprehension test** of the day card and the change card with naive raters (LLM proxies
  first), with the next prototype review.
- [ ] **The calendar in the iOS widget / Lock Screen** ("next: 14:00 Design sync"). Trigger:
  the widget work.
- [ ] **Re-check D223 on hel** after the next release: the day card and one change card through
  OOMOL Hosted with both accounts (no `app service does not match` in the Log). Trigger: the
  release that carries D223.
- [ ] **The chat watcher's input on OOMOL Hosted** (D223 (3)): it now reaches
  `slack.search_messages`, whose schema takes `query` and `count` only (no `after`, `limit`;
  `additionalProperties: false`), so the look likely fails as invalid input; Discord has none of
  the three actions there. Fit the input per action from its guide. Trigger: D223 on hel.

## Pictures and files, phases 2 and 3 (D206, `design/media.md`)

- [ ] **D286 on the Mac: a video's frame and a sound's waveform in their cards** (AVFoundation
      through purego, as Core Graphics is reached for PDFs), and playing a sound inside the app.
      Trigger: the author sends a voice memo or a clip from the Mac.
- [ ] **D286 on real devices:** the strip, pinch and drag-down on the author's iPhone and Pixel
      Fold; a light haptic when a picture lands (`haptic("light")` exists). Trigger: the next
      phone build.

- [x] **Phase 2: files and PDFs from the user.** Built by D259: one button, the same tray, the file
      card in the message, the partner's line with its path (a short text whole), a task's line
      with its path, a worker gets the bytes.
- [ ] **A sent PDF as a model's own document input** (OAR, where the runtime takes documents), and
      **PDF text on the home** for a partner or agent with no PDF reader (Codex, pi, DSH on a machine
      without one). Trigger: the first sent PDF a partner couldn't read (D259).
- [x] **The composer's picture mark for pictures and files** (D259 kept the picture mark; the label
      says both). Done by D273: the drawn paperclip, by the author's call, with the candidate table in D273.
- [ ] **D273's attach mark, a comprehension check:** naive raters (LLM proxies first) shown the composer at
      18–20 pt, asked "what does this button do?". Trigger: the next composer change, or a person who
      misses it.
- [ ] **Try D259 for real:** a PDF and a 40 MB deck from a real iPhone and Android over the
      tunnel, a real partner (haiku) answering from a sent PDF and a long log. Trigger: the next
      release with D259.
- [ ] **Phase 2: a share sheet into Ducter.** An iOS share extension and an Android share intent
      that open the conversation with the picture (or file) in the tray. Trigger: phase 2 files,
      or the first time a picture has to be saved first to be sent.
- [ ] **Phase 3: video.** Send and view; the model sees ~6 frames taken on the sending device.
      Trigger: the first screen recording a task should look at.
- [ ] **Phase 3: reply to a message** (quote one message or picture), and **link previews**.
      Trigger: two conversations a week where "that one" is ambiguous / a pasted link reads as noise.
- [ ] **A routine's pictures.** A New task scheduled for later keeps its words only. Trigger: the
      first scheduled task that needs a picture.
- [ ] **Office files drawn (D239).** docx/xlsx unzipped and drawn in the viewer.
      Trigger: a task hands over a spreadsheet or a document a person wants to read on the phone.
      (PDF pages, expiring keys and find were built by D242.)
- [ ] **Find in a PDF, and a PDF's CJK fonts on the web (D242).** pdf.js's text layer for find;
      its CMaps and standard fonts (about 1.5 MB more) for a PDF that names a CJK font without
      embedding it. Trigger: a PDF report whose words come out as boxes, or a person asking to find
      in one.
- [ ] **Find inside a laid-out report on the Mac (D242).** MyGo's Markdown view has no ranges to
      mark, so the Mac finds in the text. Trigger: MyGo gains marks or a find hook in
      `markdown.View`.
- [ ] **Drop pre-D242 media keys (D242).** The 7-day grace ends by itself; remove the legacy path
      in `media.ts` `verify` once every home has run D242 for a week (the release after next).
- [ ] **Media housekeeping.** The store keeps everything; a sweep of pictures no event references
      for 90 days. Trigger: the media folder passes 2 GB on any home.
- [ ] **Mac viewer: pinch and grow-from-tile.** The Mac opens with a scale and fade and zooms by
      double-click only; HEIC from Finder is skipped (Go reads none). Trigger: the author's review.

## Folders that aren't repos (D142)

- [ ] **Live run with a model** (owed: skipped for the token budget). A scratch Ducter, a cheap
      model, a scratch folder of fake invoices sorted into month folders, then Undo from the app
      and from `ducter undo`. The flow is proven with temp folders and a scripted harness
      (`packages/runner/demo-folder.ts`). Trigger: the next budget window.
- [ ] **Claude Code: keep writes inside the folder.** Under bypass nothing holds it there; try
      Claude Code's own sandbox (`--settings` with `sandbox.enabled`) for Bash and check it in a
      live run (the experiment was not allowed this session). Trigger: a report of a task writing
      outside its folder, or the live run above.
- [ ] **More than 10 deletes at once, after the fact.** Today asked in the brief only. Detect it
      at the turn end against the copy and offer the deleted files back in one card. Trigger: a
      task deletes many files without asking.
- [ ] **The proof line under a folder result** still counts `file` evidence ("改了 1 个文件") next
      to the Changes sentence; show the folder's own count there. Trigger: next pass on results.
- [ ] **Linux check:** reflink on btrfs/xfs and the network/external mount detection were
      written from the mount table, not run on Linux. Trigger: the first Linux server user.

## Folders anywhere and GitHub sign-in (D272, research/87)

- [ ] **A live GitHub sign-in.** Only a fake gh has run the flow. Run 在 {computer} 上登录 GitHub
      once against a scratch Linux server with a throwaway GitHub account (never this Mac's own
      gh), check the code and link reach the phone, `gh auth setup-git` lands in its git config,
      and a private clone then works; also `ducter git login` over SSH. Trigger: the next server
      session, or the first report of a sign-in that doesn't finish.
- [ ] **Sandboxed task environments.** `taskCredentials({kind: "sandbox"})` exists and is tested,
      not wired: no sandbox runs tasks yet. When one does: mint a token scoped to the task's repo
      (a GitHub App installation token or a fine-grained key the person approves, never the
      person's own gh token copied in), pass it through the sandbox's starter, mount nothing of
      `$HOME`, make sure gh is inside, and expire the token with the task. SSH-only remotes need
      an agent forwarded per task or are refused there. Trigger: the first sandbox (container or
      separate user) for tasks.
- [ ] **Install gh in one tap.** Today the no-gh line says what to run (`brew install gh`,
      `sudo apt install gh`). Default: a D225-style step on the home that uses the first route
      present without sudo (Homebrew; the GitHub release tarball into `~/.local/bin`). Trigger:
      a second person meets the no-gh line.
- [ ] **GitHub Enterprise and other hosts.** Only github.com is offered; GitLab and the rest keep
      "sign in to git on {computer}". Trigger: the first person whose repositories live elsewhere.
- [ ] **A typed path outside the home folder** in Choose a folder on {computer}. D203's browser
      stays inside ~ (links resolved first); a field for an absolute path (e.g. `/srv/data`) with
      the same checks is the default. Trigger: the first folder someone needs outside ~.
- [ ] **Sign in from Devices too.** Today the sign-in lives in New task's clone field and the
      CLI; a push or draft PR that finds no sign-in names them. Default: the computer's card in
      Devices shows its GitHub line with the same button. Trigger: a push failing for sign-in
      more than once.
- [ ] **A computer's new plain folders on other clients.** A computer's projects listed by
      `repos` are its git repos in `projects/`; a new plain folder is listed because it was
      added (projects.json). Trigger: a folder made on one home not showing after a reinstall.

## Autofill (D191, `design/autofill.md`)

- [ ] **The author's review of D191** (draft): the three stores, never storing the security code,
      no reveal, OK per site, the Pay card. Trigger: the author's next session.
- [x] **A real errand, once** (2026-11-11, a scratch home; shots `.shots/autofill-live/`): a saved
      sign-in on practicetestautomation.com, a home address into httpbin.org's form, and Stripe's
      test-mode Checkout paid with the test Visa after the Pay card, each after its card was answered
      over the client protocol. No secret in the Log, the transcripts or any tool answer. Fixed on the
      way: a one-computer home refused browser places; the sidecar chose before the brief was logged
      (a saved handle didn't get Ducter's browser); two OK cards for one sign-in; fills into a
      re-rendered field; Stripe's 0x0 payment-method buttons; no way to choose a select.
- [ ] **Card fields in a cross-origin iframe** (Stripe Elements, the embedded Checkout on a merchant's
      page): the reader doesn't enter iframes, so the task can't see or fill them, and the Pay card's
      merchant would have to be the top page's host while the fill goes into the frame. Trigger: the
      first real checkout that embeds its card form.
- [ ] **Say the result of a payment the page shows only as an icon** (Stripe's green check): read the
      button's state or aria, or a screenshot to the user. Trigger: a task reports "not sure" after Go.
- [ ] **Screenshots of a page that echoes a filled value** show it in clear (httpbin's echo of the
      address): the dots only cover filled fields. Keep screenshots from the model, or mask echoed
      values before saving. Trigger: the review of D191.
- [ ] **A model's own payment question beside the Pay card** (sonnet asked with `report_to_main` in the
      same turn; its done was held until that was answered too). Trigger: it happens again in the eval.
- [ ] **A card's postcode isn't scrubbed** from reads (only values of 6+ characters are, and postcodes
      aren't listed). Trigger: the review of D191.
- [ ] **Clay art for Passwords & cards** (Autofill) through the metaphor process (it borrows the 上网 clay today).
      Trigger: the review of the Settings shots.
- [ ] **Face ID / Touch ID on the Pay card** (the iPhone shell's existing unlock; LocalAuthentication
      in the Mac app). Trigger: the first real payment.
- [ ] **The live view's "fill from saved"** plugs into `FillSeam` (`packages/core/src/saved/fill.ts`)
      when the takeover work lands; the owner taps a field, then a saved thing.
- [ ] **1Password / Bitwarden by reference** (research/54 §5: 1Password's agent programme is
      partner-only; Bitwarden Agent Access SDK is alpha). Trigger: a public path for self-hosted agents.
- [ ] **Single-use cards** (Stripe Link agent wallet via `link-cli --output-file`, Privacy.com) behind
      the same Pay card, US/Canada. Trigger: a user outside the owner's-card path asks.
- [ ] **Codes from a connected mailbox** with per-account consent and a Muse-like filter. Trigger: 3-D
      Secure by SMS/email shows up as the common blocker.
- [ ] **Filling on a worker's browser** sends the value over the worker socket (the owner's own
      computer); say it on the Passwords & cards page, or fill on the home only. Trigger: the review.
- [ ] **The author's review of D233** (keys a task asks for): the card's words, Remember as the
      default, the per-task key file, what is and isn't guaranteed. Trigger: the author's next session.
- [ ] **A key for a task on a worker** (D233 (7)): write the task's key file on the worker over its
      link (0600, removed when the task ends, rewritten when the worker comes back), and say on the
      card which computer gets it. Trigger: the first task that must run on a worker and needs a key.
- [ ] **ask_for_key live, once per harness** (Claude Code, Codex, pi): the task loads the file in
      the command, ends its turn when told, and resumes from the message; check Codex's 60 s limit
      holds and pi's real one. Trigger: before D233 leaves draft.
- [ ] **A task's own transcript keeps what its command printed** (the harness's session file, e.g.
      `~/.claude/projects`), key included if printed: scrub the harness transcripts Ducter keeps, or
      wrap commands that load the key file to mask their output. Trigger: a key seen in a transcript.
- [ ] **The partner and keys** (D233): the persona doesn't yet say "a task asks for a key itself;
      never ask the user to paste one into the chat" (it needs the D175 eval). Trigger: the partner asks
      for a key in words in a live session.

## Browser places (W5)

`packages/runner/src/browser.ts` attaches cua-driver directly (D47). Verified live on 0.44.0
(`design/onboarding.md`, "The browser, first time").

- [ ] **env-gate MCP proxy:** untrusted-content framing, domain policy, submit/pay as intents
      (today the rule lives only in the task brief). First slice done: 10 allowed cua tools,
      Claude Code's own built-ins less Agent and Workflow (D240; first Bash/Read/Write/ToolSearch),
      no user Claude config (W5-2; HN lookup 332k → 140k input tokens before D240).
- [x] **Hostile pages and the Log.** A browser task's `log_search` / `log_read` reach only its
      own stream (D62); other tasks reach their own stream, their person's conversation and
      that person's other tasks, never another person's (`packages/core/src/tools.ts`,
      `packages/core/test/log-reach.test.ts`).
- [ ] Sign-in handoff: the driver ends an idle browser session after 300 s (SIGKILL; verified
      live), so a slow sign-in while the task waits on needs_input loses the window. The
      env-gate proxy can keep the session alive while the task waits.
- [ ] Cookie durability depends on Ducter's clean quit (CDP `Browser.close` on
      done/failed/drop). A crash, or a task that calls `end_session` anyway, can still lose
      sign-ins from the last ~30 s.
- [ ] Profile exclusivity in the runner: a second browser task for the same persona waits
      (today the driver refuses and the task reports blocked).
- [ ] Supervise Ducter's cua-driver daemon: if it dies mid-task, `mcp --socket` relaunches it
      without `CUA_DRIVER_BROWSER_PROFILE_ROOT`, so the profile would land in the driver's
      default root. Ducter also leaves its daemon running after it exits.
- [ ] Browser sidecars are not restarted when a browser task is recovered after a restart.
- [ ] Snapshots carry no link targets (href); tasks fall back to page URLs or fetching public
      HTML. Ask cua for hrefs in `semantic_v2`, or read them through the env-gate.
- [ ] Browser identity (W5-1, D62): built. Still needed: the client
      renders the status line with a Show action; someone checks the Dock tile with the Dock
      visible; in a `bun build --compile` binary the avatar file is not bundled, so there is no
      Dock tile.
- [ ] Find what triggers macOS's "CuaDriver was prevented from modifying apps" notification.
- [ ] **Server browser, real-server checks (D151).** Built and tested on a Mac with Chrome for
      Testing 157 (`DUCTER_TEST_CHROME`): tools, blind, live view, sign-out, persistence. Still
      to run on Hetzner Ubuntu 24.04: the install as root and as a user (the t64 names, the
      `sudo` line), `--no-sandbox` as root, a live view from the phone through `ducter domain`'s
      HTTPS, a real sign-in with 2FA, and how often a datacenter IP meets CAPTCHAs or "this
      browser may not be secure". Trigger: v0.0.4 on the author's server.
- [ ] **Server browser, later (D151):** Xvfb + headed Chrome when a site refuses headless;
      a pending live view that survives a socket reconnect; a Codex Computer Use brief that
      isn't appended on Linux for non-browser places; Chrome updates (re-run the install when
      CfT Stable moves); browser places on a worker. Trigger: the first such report.
- [ ] **Native browser, live checks (D130).** Native is the default and unit-tested with fakes;
      what is still unseen live: (1) a Claude in Chrome run with the extension connected to
      Claude Code (HN lookup, then a sign-in handoff), and the in-place move to cua-driver on a
      real "not connected"; (2) Codex's browser tools with Ducter started under the desktop app
      (access host passed through), in the in-app browser only; (3) whether a socket-only Claude
      in Chrome connection shows in `list_connected_browsers`. Computer Use stays out of live
      tests (rule).
- [ ] **Restrict Codex Computer Use to the browser surface when the access host is there.**
      `-c plugins.unified-computer-use@openai-bundled.mcp_servers.cua_repl.env.CUA_REPL_ENABLED_SURFACES="browser"`
      would make app-level keystrokes impossible in a browser place; the `mcp_servers.<name>.enabled`
      path is verified, the `env` one is not (it might replace the server's whole env and break
      it). Trigger: the first live run of (2) above.
- [ ] **A clean setup for DeepSeek Harness browser tasks.** Owned homes are per setup now
      (`<dataDir>/harness/dsh/<hash>`, D177), so a browser task no longer overwrites the partner's;
      set the clean setup in runner `withBrowser`. Trigger: the first DeepSeek Harness browser task.

## The device card as a character sheet (D161, `design/ui-devices-card.md`)

Built 2026-11-10 on both clients (§12). Still open:

- [ ] **Learned rules on Settings › 伙伴** with **你换过两次以后定的** and **不要这条** (D161 (9)).
      Trigger: the first rule the partner learns from two switches.
- [ ] **Owed design:** a dedicated small clay object for 替 {home} 做事 (today the home's own
      clay); Pebble dark on the phone's sheet; a device with five or more agents (the tray wraps
      today); the comprehension check of the chips with naive raters (LLM proxies first).
      Trigger: the next design pass on Devices.
- [ ] **The phone's chips for another computer**: 上网 and 用电脑 toggle from the phone, but 从外面连
      (a pairing code) and 替 {home} 做事 (a LaunchAgent on that Mac) only explain themselves there.
      Trigger: pairing from the phone.
- [ ] **A phone's 通知 chip on the Mac's card** needs the home to know each phone's notification
      state. Trigger: the protocol carries it.
- [ ] **The shared-controls guard on the rest of the phone client** (`views.tsx` still has its own
      `qlink` and form buttons): move them into `controls.tsx` and widen `test/controls.test.ts`.
      Trigger: the next settings or task-page change on the phone.

## Where a task runs (draft D157, `design/where.md`)
## Where a task runs (D157, `design/where.md`)

D157 was decided 2026-11-10; the build runs in `where.md` §13's order (step 1 unblocks the Mac worker).

Built 2026-11-10 (`where.md` §16): browser places on a worker (native, cua-driver, Ducter's own
browser driven over the worker socket, the live view through it); 上网 and `alwaysOn` per
computer; the one ranking with needs and one reason; a task waiting for its computer and the ask;
the where line on both clients; Switch who does it with the island strip and the move; New task's
computer part; 我要合电脑了; the parcel's Lands / Waits / Moves. Still open:

- [ ] **Live check on hel + the MacBook** (the build is tested with fakes only): a browser task on
      the MacBook in the user's Chrome, Ducter's own browser on a Linux worker with a real sign-in
      through the live view, a move of a repo task with a real push. Trigger: the author's next run
      with the Mac switched on.
- [ ] **Partner eval scenarios W1–W6** (zh/en) for `task_open needs` and the ack naming where only
      when it waits or uses the user's Chrome. Trigger: the next partner eval run.
- [ ] **The Mac's own sleep notice as the closing trigger** (NSWorkspace willSleep): the worker is
      the `ducter worker` process, the app has no sleep observer, and nothing sends `{t:"sleep"}`
      today, so "asleep" is never reported (a lid close reads as 连不上). Trigger: the first real
      lid close with work on the Mac; build a willSleep observer in the app that tells its worker.
- [ ] **`alwaysOn` for a Mac on power** (a power assertion while plugged in, A3): today a laptop
      always counts as sleeping. Trigger: a plugged-in laptop used as the always-on computer.
- [ ] **A repo on two computers** gets New task's computer part too (`where.md` §6.3; today only
      No folder has it), and continuity (its worktree or uncommitted changes) as a ranking step
      with a real signal. Trigger: the first repo cloned on both hel and the Mac.
- [ ] **A worker's Signed-in sites** in Settings (the ranking already reads them from the home's
      `@<device>:<profile>.sites.json`). Trigger: the first sign-in through a worker's live view.
- [ ] **A task waiting for its computer across a home restart** is recovered as parked, not as
      waiting. Trigger: the first restart with such a task.
- [ ] **Evidence screenshots of Ducter's own browser on a worker** are saved on the home, where the
      task on the worker can't read them. Trigger: a task that needs to look at its own screenshot.
- [ ] **Comprehension check** of Lands and Moves with D81's owed human test of the stage.
- [ ] **D202: Claude Code's pinned model versions** (claude-opus-4-8, claude-sonnet-4-6, …) in New
      task's Model row (today its named models only: opus, fable, sonnet, haiku), behind a **更多 /
      More**. Trigger: the first time the user wants an older model for a task.
- [ ] **D202: live check** of Model and Effort on hel + the Mac (a worker on this build answers
      `models`; an older one leaves the card on the tier table), and Claude Code's `get_settings`
      read-back refusing an effort its settings clamp (the task then fails to start, with OAR's
      line). Trigger: the author's next run with the Mac switched on.
- [ ] **D202: the switch sheet (换谁来做) picks a model and effort** the same way (today it keeps
      its rows per model and drops the effort on a switch). Trigger: the first ask to switch to a
      deeper effort mid-task.
- [ ] **D203, D204: live check** on hel + the Mac (a worker on this build answers `repos`, `browse`
      and `clone`; an older one shows "needs an update" on both cards), and a real clone from the
      phone onto the Mac (a private GitHub repo over https with the Mac's keychain, and over ssh with
      its agent): only faked git so far. Trigger: the author's next run with the Mac switched on.
- [ ] **D204: the Ducter folder in Settings** (a field beside where it lives; today only
      `DUCTER_FOLDER`). Trigger: the first person who wants it somewhere else and doesn't use a shell.
- [ ] **D204: clone progress** (git's own percentage in the field, from `--progress` on stderr,
      relayed by the worker). Today: a spinner and "a big repository takes a few minutes".
      Trigger: a clone that someone abandons because it looked stuck.
- [ ] **D204: plain folders in `~/ducter/projects`** (not git repos) are not listed; list them as
      folder places. Trigger: the first person who puts one there and expects it.

## Wide screens: the whole screen (D184)

- [ ] **Run it in the iPad simulator and on a real fold**: the arrows, ⌘2 from the iPad's menu
      (twice), Esc on a hardware keyboard, the morph on WebKit (iPadOS 18+ has view transitions),
      and the book fold on the emulator's Pixel 9 Pro Fold (841 × 701). Trigger: the next iPad or
      Android build.
- [ ] **The opened task's own parts, web vs Mac**: the whole-screen task uses the web's task page
      (D152) under the Mac's crumbs; its head (meta line wrapping, the outcome block) still differs
      from the Mac's in places. Converge part by part. Trigger: the next change to either task page.
- [ ] **A tabletop's whole screen**: today neither level takes it on a tabletop. If wanted: Needs
      you above the fold, the other lanes below. Trigger: someone uses a fold that way.

## Devices stage: the Isles (D81)

- [ ] Human comprehension test of the Isles scene (owed since D65; research/33 used LLM proxy
      raters only). Pass bar: 80% on where Ducter lives, what a bridge means, work running, can't
      reach, and where a new device goes. Trigger: before v1 is called done.
- [ ] Reduced motion checked on the native window with the system setting on (verified in the
      headless renderer only; this machine's setting was left alone). Trigger: the next design QA.
- [ ] "Shared by N devices" from the AI agent itself, per account (D82). Trigger: an AI agent
      reports its account or allowance.
- [ ] One small mark on the AI agent Ducter thinks with (a separate proposal); the token has
      room for it. Trigger: that proposal is decided.

## Screens a task drives (D248, `design/computer-use.md` §7–8, research/82)

- [ ] **Teach by showing** (做给它看 → a draft 技能): a recorder of the person's inputs in their turn
      on Ducter's phone (labels only, password fields never), a model pass that writes the steps,
      the skills page, 试一次 / 留着 / 定期做. Trigger: the skills page exists, or the author asks.
- [ ] **A reminder after about 4 hours waiting on the person** (research/77 §8.6): Ducter has no
      reminder for an open card. Decide with the attention forecast and push, once. Trigger: the
      attention forecast's next change.
- [ ] **The dozing phone as clay raster art** (`design/art/assets/prompts/phone_asleep.md`, in
      `batch.json`): the image provider didn't answer on 2026-11-13; a drawn SVG ships meanwhile.
      Trigger: the art pipeline's next run.
- [ ] **D248 on Ducter's browser:** the held frame and fade, the turn that waits for the step and
      what it did for D190's live view (it already never starts the browser). Trigger: the next
      browser live-view change.
- [ ] **用电脑's 它做了什么** (its steps note only the app today) and a live view for a worker Mac,
      under D248's rules. Trigger: the first worker-Mac 用电脑 task on the author's machines.
- [ ] Human raters for research/82 §4 (LLM proxies only so far).

## Art assets: production export

- [ ] Export WebP at 1×/2×/3× per the size each asset is used at in the clients. Commit only
      final exports from here on (D64).
- [ ] Re-cut any regenerated asset with the same tool, and check it on a dark tile.

## Storage: adopt HawDB (after the Bun/Node binding)

v1 stores the Log on SQLite behind an append-log port (principle 19). The port is shaped like
HawDB `strict_append`: partition, gapless commit sequence, cursor reads. Once the items below
land in HawDB, the self-hosted control plane moves to HawDB. Cloudflare keeps Durable Object
SQLite until HawDB has persistent WASM. See `research/09-hawdb-evaluation.md`.

- [x] HawDB Bun binding: `@nowledge/hawdb-bun` (0.34.0 on npm, 2026-11-16; Bun FFI over the C ABI,
      Cypher and SQL, transactions). The switch waits (the author, 2026-11-16: "等 hawdb 稳定再切"):
      HawDB's on-disk format carries no compatibility promise yet, so a Log could need recreating
      after an upgrade. Trigger: HawDB declares format stability, or Ducter can export and re-import
      a home. Then: a `DUCTER_STORE=hawdb` spike running the whole suite, and the items below checked
- [ ] Declarative FTS index on SQL / append tables
- [ ] Multi-key reads on append tables (per-window and per-persona-since-cursor without a dual
      write)
- [ ] Public, resumable change-feed subscription (client sync)
- [ ] Later: persistent WASM storage or `hawdb serve`; 1.0 format stability

## Runtime: no JS runtime at all (later)

The runner ships today as one compiled binary (`bun build --compile`; Node SEA is the CI
fallback). A runner with no JS runtime at all means porting OAR's drivers to Go behind
`HarnessPort`: Claude + Codex + shared core is ~10–12k LOC, about 6–10 engineer-weeks. Do it
Codex first, once OAR is near 1.0. See `research/17`.

- [ ] Spike: run `@botiverse/oar/observe` (no `node:` imports) inside the MyGo client on
      moejs, with a `randomUUID` shim, for client-side read models
- [ ] Evaluate moejs as the client plugin host (cf. MyGo Music / mygo-plugin)

## Release and CI (`design/release/README.md`)

- [ ] **The E2E rig in CI (D172, `scripts/e2e/linux.ts`).** It runs on a Mac with colima today.
      Next: a forced-rollback release (a binary that fails `/health`) in the same run; the Mac
      app's own update (a signed DMG through `DUCTER_UPDATE_FEED`); the phone client in a
      headless browser against the same VM; an x64 VM (qemu) for the x64 tarball. Trigger: the
      next release that touches update or the live view.

- [ ] **The notification relay live (D159, `design/release/push-relay.md`).** Built and tested
      with a fake APNs and a fake relay only; nothing is deployed. Open: the APNs key and the
      relay's environment in Vercel; `GET https://ducter.ai/api/push/health` says `ok: true,
      store: "kv"` (confirms Vercel builds `apps/site/api/` next to the Astro preset); the first
      tagged release signs `DucterNotify` (`co.nowledge.ducter.ios.notify`) through CI; on a real
      iPhone a decision arrives with its words and Go / Hold / Reply, and "Ducter needs you" shows
      when the key is missing. Trigger: the author's steps in `push-relay.md`.
- [ ] **Relay hardening, later (D159):** App Attest on register so only the genuine app can get
      a handle; rotating the handle encryption key with a key id; a per-home budget once homes
      identify themselves to the relay. Trigger: abuse seen in the relay's 429s, or the App Store
      release.
- [ ] **Notifications in the Android app (D181 (4)), without Google as a requirement:**
      UnifiedPush. The app registers with a distributor (ntfy, or an embedded FCM distributor
      only where Play services exist), gets an endpoint, makes the p256dh/auth keys, and hands the
      page a standard Web Push subscription; the home's existing Web Push sender serves it once
      `isPushEndpoint` accepts endpoints the paired app vouches for (keep the SSRF guard: https,
      no private addresses, per-device). The app shows the notification with Go / Hold from the
      decrypted payload (the shape `sw.ts` uses). Was: an FCM relay in the push function (D159's
      shape), which would make Play services and a Firebase project a requirement. Trigger: the
      Android app in users' hands (0.0.10) and the first ask for notifications.
- [ ] **Android app, before it ships (D181):** the release keystore, its four secrets and the
      `ANDROID_CERT_SHA256` variable (`design/release/android.md`); Android developer verification
      of `co.nowledge.ducter.android`; install and update on a real phone and on a Chinese ROM
      (Xiaomi asks on every update); one update between two release-key builds; the QR scanner
      with a real camera. Trigger: tagging 0.0.10.
- [ ] **Android app, later:** a share target (send a link or text to the partner); a
      download link on the website once the first APK is out. Trigger: the author's ask. (The
      page's Settings showing this app's version with 检查更新 is built, D342.)
- [ ] **D342 live check on the author's Android phone** (built with unit tests only). Install the
      release before the one carrying D342 and update to the D342 build by hand first. Then, when
      the next release is out: (1) open the app; the card offers it. (2) Tap **更新**, and while it
      reads 在下载 turn on airplane mode: within about 20 s the card says **没能更新到 {v}** with
      the download sentence, **再试一次**, **以后再说** and **在浏览器里下载**. (3) Airplane mode
      off, **再试一次**: it downloads and installs. Repeat (2), then tap **以后再说**, swipe Ducter
      away and open it again: the offer comes back at once. (4) Repeat (2), tap **在浏览器里下载**:
      the browser opens ducter.ai/download at Android; the APK from there installs over the app and
      the conversation is still there. (5) Settings › 这台手机: **这个 App**, **版本 {v}**,
      **检查更新**; tap it: the card says 在检查… then 已经是最新的 (or offers). The same row on this
      phone's card in 你的设备. (6) On the offer, **以后再说**, reopen: no card (3 days). Trigger:
      the first release after D342.

- [ ] First tagged release end to end (notarized DMG, Linux tarballs, TestFlight). Trigger: the
      author's checklist at the top of `design/release/README.md` is done.
- [x] One Bun for everything: 1.4.4 for CI, the web bundle and the CLI (build:web fetches it
      with npx when the Mac has another).
- [ ] Intel Mac DMG (a `macos-15-intel` job). Trigger: someone asks for Intel.
- [ ] CI on GitHub: the first run (2026-11-09) failed on machine-dependent tests only (git
      identity, installed harnesses), now fixed and reproduced on the Mac with a clean env
      (`design/release/README.md`, "Tests are hermetic"). The second found the Go job can't run
      on Linux (the views' text measures differently; plutil is macOS-only), so it runs on
      macos-15. Close once a GitHub run is green.

## App lifecycle (D72)

- [x] **Settings rows** for updates (the status line, 退出时自动更新, 现在检查) and for 彻底移除
      (built: Updates and about's status, Check now and the night's updates; Where it runs' Remove
      Ducter with its plan; closed by D307's walk)
      Ducter (the page with Removes / Keeps, the two options, the typed confirmation), on the API
      in `apps/desktop/internal/update` and `internal/local/lifecycle.go`. Trigger: the Settings
      window lands (branch `ia`).
- [ ] **Reset partner** (clear the conversation, keep devices and settings). Not built: the Log
      holds the conversation and every task in one append-only file (principle 1), so it can't
      be cut out safely. Proposal: a `conversation_reset` event that the projection and memory
      window start after, so tasks, decisions and resume keep their history. Trigger: the user
      asks for it; it goes through the change loop (`design/context.md`).
- [ ] Rollback in the UI (`RollBackOnQuit` exists). Trigger: a bad release reaches someone.
- [ ] A pre-release channel (the updater only reads `releases/latest`). Trigger: the first beta
      testers.
- [ ] First real update from GitHub (both checks against a notarized release, Gatekeeper on).
      Trigger: the second tagged release after the repo is public.
- [ ] D160 on a real Mac: Restart Now from 0.0.6 to the next release shows the putting-in
      screen, no white window, and opens with Updated to; the relaunch skips the LaunchAgent
      restart and connects to the new helper. Verified so far on a scratch signed bundle with no
      LaunchAgent (DUCTER_URL to the mock server). Trigger: the next tagged release.

## First run without a terminal (D70, `design/onboarding.md` "No terminal, start to finish")

- [ ] A task that needs the web before 上网 is set up: open the three steps from the
      conversation, not only from the devices screen. Trigger: core gives the refusal a
      structured reason the client can act on.
- [ ] See macOS's "Background Items Added" notice for Ducter's own agent and quote its zh title
      exactly. Trigger: the first signed build installed on a Mac in Chinese.
- [ ] Walk a real Claude Code sign-in and a Codex sign-in from the app to the end. Trigger: a
      throwaway account, or a fresh Mac user.
- [x] Nowledge Mem installed but not running: one line with 打开 Nowledge Mem on a Mac home with the app
      (D329 (5), `open -a`).
- [ ] **A closed Mem elsewhere** (D329 (5)): a Linux home's Vault or a Mac home without the app in
      Applications gets the line only. Trigger: Mem exposes a start command (`nmem serve` or the like).
- [ ] Moving the app out of the disk image (offer "Move to Applications" when run from
      `/Volumes` or a translocated copy). Trigger: the first friend who opens it from the DMG.
- [ ] Remove Ducter from a copy run off the disk image: the plan's last step moves Ducter.app
      to the Trash, which a read-only `/Volumes` copy can't do (and the installed copy, if any,
      stays). Say so in the plan and leave the app alone. Trigger: with the "Move to
      Applications" offer above, or the first report of it.

## Partner and Settings (D71)

- [ ] A theme choice in Settings › Look (Pebble's light and dark is D302's 浅色和深色 / Light and
      dark row). Trigger: a second theme (Midnight, Volt…) works on the desktop and the phone alike.
- [ ] Walk Forget against a live Nowledge Mem (`nmem m forget --force` on a line with a memory
      id) and check recall no longer returns it. Trigger: a scratch Mem space for tests.
- [ ] **D306: the Lock Screen glance on a real iPhone** (trigger: a signed build on a device with
      the relay's `activity` op deployed): start from a task, watch needs you and done arrive by
      push (own key and relay), the stale line after 4 h, then turn `DUCTER_LIVE_ACTIVITIES` on.
      Then: push-to-start for a call that goes live while the app is closed (iOS 17.2+), and a
      tap on the glance opening its task (the app has no URL scheme yet).
- [ ] **D306: Android's glance while the app is closed** (trigger: UnifiedPush, D181 (4)); and
      Android 16's promoted ongoing notification (Live Updates) for a live call.
- [ ] Screenshot the menu bar extra's open menu natively (D306: its mark's three states too). On the test Mac it sat in the menu
      bar's overflow, so only its contents are covered by unit tests. Trigger: a Mac with room in
      the menu bar. Then hear it with VoiceOver: D310 gives the item its name ("Ducter, Working")
      through AppKit on the status item's button; checked only by building, not read aloud yet.
- [ ] Sign in, install and sign out from a Devices account card in the real Ducter.app (the
      card's sheet reuses the first run's jobs). Trigger: the same throwaway account as above.
- [ ] Rules (F1) on the Partner page: let "On its own, or asks you first" be changed, not only
      read. Trigger: F1 has a flow and a decision.
- [ ] The partner's name in its live session: a rename reaches new sessions (the identity is
      rewritten); the session already open keeps the old name until it restarts. Trigger: a
      user notices.

## First-wave harnesses (D85, `research/34`)

- [x] The full partner eval on pi and on DeepSeek Harness, flipped `partner` (D177: DSH 68/74,
      pi 62/74, Claude Code + haiku 52/74 on the same persona; research/50 §5).
- [ ] A second full run of each (variance), and DeepSeek V4 Pro on both. Trigger: before 0.0.9 ships.
- [ ] pi's cache reads were 73% of input in the eval against DSH's 96% on the same model: find the
      part of pi's request that varies early. Trigger: pi as the brain on a busy day.
- [ ] Owned DSH homes are one per setup (`<dataDir>/harness/dsh/<hash>`): each persona edit leaves
      the old home and its sessions. Remove homes untouched for 30 days. Trigger: ten of them.
- [ ] One DeepSeek key for pi and DeepSeek Harness (D102 gives it to DSH only; pi on DeepSeek signs
      in with its own `/login`). The author's call (D177, default no).
- [ ] Why Bun 1.3.1 SIGKILLs a host after a few pi RPC sessions (research/50 §4; 1.4.4 doesn't).
      Trigger: a Bun older than the pin anywhere Ducter runs.
- [ ] The full partner eval on Codex at its workhorse model (gpt-6.1-sol) before Codex is
      offered as the brain. Trigger: the ai-loadout UI lands.
- [ ] Verify Codex leaves out a non-empty global `~/.codex/AGENTS.md` and the user's
      `personality` (this Mac's AGENTS.md is empty). Trigger: a scratch `CODEX_HOME` copy with
      a test AGENTS.md, or a user with one.
- [ ] The Devices key field for API-key accounts: masked input, writes `<dataDir>/keys.env`
      (0600, D102), never echoed or logged; "需要一个 DeepSeek 密钥 / Needs a DeepSeek key".
      Trigger: the ai-loadout Devices work.
- [x] Pass pi's provider keys from Ducter's key file too (D102: `HARNESS_KEYS.pi`, from the
      env or `keys.env`, never the DeepSeek key).
- [ ] A way for the user to give tasks a named env token on purpose (e.g. `GITHUB_TOKEN` for
      `gh`), now that a harness child's environment is an allowlist (D102). Trigger: a task
      fails because a tool it runs relied on a token from Ducter's shell.
- [ ] pi's in-process fallback (no `node` and no `pi` on PATH) runs inside Ducter's process and
      reads its environment directly; the allowlist covers only pi's bash tool there. Ducter's
      own keys are scrubbed from that environment, a shell key is not. Trigger: a machine
      without node that runs pi tasks.
- [ ] Label the partner's Codex sessions (`SessionOptions.name`) so they read as Ducter's in the
      user's Codex history. Trigger: a user asks what they are.
- [ ] Qwen Code, Qoder, Grok as the next harnesses (cheapest per research/34). Trigger: a user
      asks.

## Before the repo goes public

- **Rewrite history once (D75 and the motivation scrub).** After every branch is merged:
  `git filter-repo` with the text replacements (motivation wording, personal paths, fake eval
  keys) and `--invert-paths` for the evidence paths: `apps/desktop/docs/`, `design/screens/`,
  `docs/design/screens/`, `docs/images/`, `apps/ios/screens/`, `apps/desktop/desktop`, the raw
  and normalized generations and the concept explorations (keep the two `r2` reference images
  named in `design/art/assets/batch.json`). Then run `bun scripts/check-binaries.ts` on every
  remaining commit's tree, force-push, and set the description and topics. Trigger: the last
  open branch merged.


## Nowledge Bridge (D105–D111, D162–D164, D170–D171, D205, D225, D249, `design/bridge.md`)

- [x] Connect the persona in Only me (D205): connected 2026-11-13 by the author; the live trial ran (D249).
- [x] File B17 with the Nowledge team (filed as nowledge-co/mem #10194; Cloud fixed by #10278, D294): `open` names no sender and links
      no reply; `contacts` lists an Agent with no registered mailbox; the 409's "previous unknown send" wording on
      a first send; native-session Agents all "Bridge agent". Trigger: the author's go.
- [x] Read Mem #10278's `sender`, `in_reply_to` and `mailbox_available`, and retry Mem's "can't right now"
      briefly (D294; over the fake's `presentation` shape).
- [ ] Rerun `bridge:live -- --real` (D324: as the trial's own identity) and make the live S2 check pass (5/5);
      then drop D249 (5)'s maybe-answered rule (D364 already leaves Mem's `in_reply_to: null` originals out of it),
      and the "until the live trial passes" wording in `bridge.md` and `roadmap.md`. Check on that first run that
      Mem connects a freshly enrolled identity at once, that `agents delete` retires its mailbox, that `--cleanup`
      finds nothing after, and what `sender` really holds (research/134 §1.1: 3 fields, #10278 named 4).
      Trigger met 2026-11-18: nmem 0.10.120 asks for #10278's representation (research/134); the exact run is in
      `bridge.md` "Try it live". Waits on the author's Go (it writes a throwaway identity to Mem).
- [ ] D364: after the live run, check on hel (nmem 0.10.120) that a real native Claude Code's message reaches the
      partner named (`sender.agent` other than "Bridge agent") or by its tool; if Mem still says "Bridge agent" for
      every native session, ask Nowledge for the session's label in `sender` (research/66 §8.4). Trigger: the live run.
- [ ] D324 on the author's homes: end the Mac's leftover `ducter` connection (the 2026-11-13 trial's, made by the
      Mac's own nmem login) so hel alone reads the mailbox: hel's Settings › 和你的其他 agent 通信 › 只留这台, or on the
      Mac `nmem bridge connections revoke <the id that isn't hel's>` and `nmem agents context clear --name ducter`.
      Trigger: hel runs a Ducter with D324; the author's Go.
- [ ] D334 live, after the release (the author runs it; Ducter never writes to the real Mem from a test): on hel,
      after a minute with the build, read-only `cat ~/.ducter/bridge-connection.json` shows `places` (one context
      per Space `ducter` is in, named `ducter-on-hel-…-in-<space>`) and maybe `unread`; `nmem --json agents
      context show --name <one of them>` names `ducter` and that Space. Then the Codex that sent from `Everyone`
      sends its test again: the partner answers it within 5 minutes (or at once on "查看来信") and the reply shows
      in that Codex's inbox in `Everyone`. No connection is revoked in any Space (connections belong to the
      identity: one revoke would end hel's own); only the Mac's 2026-11-13 leftover goes (the item above).
      `agents show ducter` shows D338's description naming only the Spaces hel reads ("Only me" alone on nmem
      0.10.120: `select` in every team Space answered 404, VERIFIED 2026-11-17 on 0.0.68), and
      `bridge-connection.json`'s `unread` entries carry `status: 404`. Trigger: hel on a build with D338.
- [ ] D334: the Settings problem row for `bridge.unread` (a Space Mem won't let the home read) in D332's pane:
      one quiet row, e.g. **{name} 收不到「{label}」里发给它的消息：Nowledge Mem 没让这台电脑读那里。 / {name}
      can't get messages sent to it in "{label}": Nowledge Mem didn't let this computer read there.** with the
      step Mem's code names (D205's refusal lines) and **再试一次 / Try again** (a recheck). Words go in the D292
      tables of D332's pane (`memory.tsx`, `peers_pane.go`), not this branch. Trigger: D332 merged.
- [ ] D338: once nowledge-co/mem#10402 lands (the identity can receive in every Space it is a contact in, or
      Mem stops advertising it where it can't), drop D338's workarounds: the 404 back-off in `discover`
      (`UNREAD_RETRY_MS`), the card's Space list (back to D334's "every Space" through `wide`), and
      `answerMayNotReach` / the `unheard` mark in `bridge_contacts` and `oneSpaceEach`. Until then, no
      `bridge connections connect --space-id` per Space. Trigger: an nmem release carrying #10402 (met by
      0.10.121, D400: `discover` already goes wide there; the 404 back-off and `unheard` stay for 0.10.120 until
      no supported home runs it).
- [x] D334: switch to Mem's one inbox per identity when nowledge-co/mem#10402 ships. Done by D400 for nmem
      0.10.121 (the plain `inbox`, detected by the help's words; Mem's `open_args`/`reply_args_prefix`; the entry
      shape VERIFIED by the read-only read of 2026-11-19, research/161 §8).
- [ ] D400 live: on hel and the Mac with nmem 0.10.121, check that a reply by Mem's `reply_args_prefix` goes out
      in the message's Space (the peer sees it there), that `--watch` brings an arrival within seconds (one line,
      one check), how the identity inbox pages on past one batch (per-Space `next_cursor` beside a top-level
      `next: null`), and what `bridge notices status --json` really prints for a home's connection (D400 (7)
      reads it tolerantly). Then clear the per-Space contexts D334 made (`agents context clear --name
      <…-in-<space>>`, the person's Go) and fold `oneSpaceEach` away once the grouped contacts are seen live.
      Trigger: the personal Space's `…_unreconciled` cleared (B19), or a trial without it (met 2026-11-20: it reads again, research/161 §9).
- [x] D409: rerun the live trial with the 120 s limit and rule 2d. Done 2026-11-20 02:58 UTC: 10/17; `open` and
      `reply` work after `enable_needed` (4 to 13 s each); what was left is D412's (research/161 §10).
- [ ] D412: rerun the live trial (`bun run bridge:live -- --connected --real`) with the guard reading Mem's `bm1:`
      references, the card's name check and one follow-through line per agent. Read in its raw output: a peer
      `open` under its own context for each of Ducter's claim, result and answer; the peer's `reply` linked to
      Ducter's question (S2); whether `--watch` brings the arrival before the minute check.
      Trigger: the coordinator merges D412.
- [ ] D409: the start mark (B14) is the first inbox read that *works*: if it fails until mail has arrived (the
      2026-11-20 run, every read timed out), the first real request is taken for old mail and never opened. Mark
      only entries sent before the first attempt (0.10.121 gives no send time; `expires_at_ms` minus Mem's 7 days
      would, INFERRED) or skip only already-read ones. Trigger: a home whose first reads fail, or Mem gives a time.
- [ ] D409: ask Mem (draft in the D409 report, not posted) why the identity inbox's pages skip `sequence` 21 to 25
      of a Space (VERIFIED three times on the peer's mailbox), whether Bridge mail in a shared Space ("Before the
      team", 6 readers) is readable by anyone but the recipient, and whether 50 s for an eight-Space inbox is
      expected. Trigger: the author's go to send it.
- [ ] D400: if Mem notifies the person for mail the partner handles (the Settings line shows), ask Nowledge how
      to turn that off per connection (research/161 §6 (c)), then offer it on that line. Trigger: the line seen on
      a real home.
- [ ] D334: an unnamed sender in a shared Space (nmem 0.10.119 names none) is treated as a teammate's, so the
      person's own agent writing from a team Space meets the 答应 card once. Once the CLI carries #10278's
      `sender.member`, it is known as the person's own and goes straight through. Trigger: an nmem after 0.10.119.
- [ ] D333: on hel, see which Mem server the partner's clean Codex session had (`codex <the partner's args> mcp list
      --json` under hel's CODEX_HOME, read-only) and whether D333's check turns it off (the partner's tool list
      without `mcp__nowledge_mem__*`). Trigger: hel on a build with D333.
- [ ] D333: check live that a task's Mem plugin Bridge tools act as that session's own mailbox, never the
      partner's (a task with the plugin, `bridge_im contacts` and an inbox read, then hel's inbox still lists the
      partner's messages unread). If they can reach the partner's mailbox, turn the plugin's Bridge tools off in
      tasks (Claude Code `--disallowedTools` by its server's tool names; Codex has no per-tool switch for a
      hyphenated server). Trigger: the first task on a home with the plugin after D333.
- [ ] D333: whether a description set with `agents set` shows on the identity's `bridge contacts` cards in every
      Space (research/121 §3, INFERRED). Trigger: the same live run.
- [ ] D335: the long-poll live. Once an nmem's `bridge inbox --help` lists `--wait` (asked on nowledge-co/mem#10402),
      check on hel that it holds and returns as the fake does (a handle in the JSON `inbox` shape, back within a second
      of a send; at the end of the wait, the same shape, exit 0), that a held call never marks anything read, and that
      a dropped network errors rather than hangs past `--wait` + 20 s. If its shape or exit differ, adjust
      `waitInbox` and the fake. Until then the timer (1 min, 15 s live, +10 s… after a send) carries it. Trigger: the
      first nmem with `inbox --wait`.
- [ ] D335: watch the cost of the minute period on hel (nmem's process start plus one Mem request a minute, about
      60 an hour): if Mem asks for less, or a laptop's battery shows it, go to 2 min idle and keep the reads after a
      send. Trigger: a word from the Nowledge team, or the energy report naming nmem.
- [ ] D324: show a home's display name (not its slug) for another home's connection, once the homes' names are
      known across homes or Mem carries a device label (research/66 §9.3). Trigger: Mem's connection label field.
- [ ] D324: two homes that each want their own address (a work server and a family Mac) are two partners (D312);
      offer that from the elsewhere row once Bridge per partner exists. Trigger: D312's "Bridge per partner".
- [ ] Post the drafts in research/66 §9.3 (a device label on connections, cross-login revoke, `outcome_unknown` as a
      contract, `agents delete` and the mailbox). Trigger: the author's go.
- [ ] Post B19 (research/139 §4): `cloud_mailbox_own_source_unreconciled` on the author's native Claude Code
      mailbox (409, not retryable, no reconcile command in nmem 0.10.120): what causes it, how a person gets
      out, `outcome_unknown: false` on reads. Then rerun the live trial (its preflight says when it clears).
      Trigger: the author's go.
- [ ] Post B18 (research/137 §6): `bridge inbox` lists the whole mailbox oldest first, 20 a page, so the first
      page of a mailbox with history is all old mail; ask for newest first or an unread filter, a resumable
      cursor, and the order in the help and the Bridge skill. Then (D367) drop the 25-page walk for it.
      Trigger: the author's go.
- [ ] D367: tell the author's live `ducter` about the stray reply 47dcd5db (the 2026-11-18 trial's peer answered
      its old question 960715b8 with made-up status) if it surfaces in his conversation. Trigger: the home
      updates to a Ducter that pages its inbox.
- [ ] Post the five drafts in research/66 §8.4 (B17 release, local Bridge version, telling connections apart,
      transient codes, native senders' names). Trigger: the author's go.
- [ ] Local Bridge (Mem app or Vault): the live check on a Mem in local mode. Trigger: Mem names the version with
      its local fixes (research/66 §8.3).
- [ ] "%s 问你" (D273) puts a space before 问你 after a Chinese agent name ("Claude 收尾协调 问你"); join by D78's rule in the
      web, Mac and push templates. Trigger: the next touch of the asker card.
- [ ] D273 in the words the partner model reads: `whoForModel` and the `ask`/`bridge_send` refusals still tell it
      to say 你的 <agent> / your <agent>, and an own agent's task brief says （你的 <agent> 让我做的）. Make them say
      the agent by its own name, as the UI now does. Trigger: the next persona or partner-tool change (D175 eval).
- [ ] D273 on the Mac: the Settings panes share the phone's discipline in spirit but not its code; audit them for
      the same misalignments (headers on the text edge, one row anatomy, no card in a card), and draw the add rows'
      ＋ in the tile column. Trigger: the next Mac Settings change.
- [ ] Unnamed own agents share one name, so the daily quota, mute and "3 open asks" count them together (D249).
      Trigger: a user with two own agents writing on the same day.
- [ ] The live driver: the peer's native context keeps its inbox across runs; give each run its own peer session
      context, or have the peer ignore what predates the run. Trigger: the next live run.
- [x] (history) Connect the persona in Only me (D205): on the home, Settings › 连上的 AI agent › 连接 (it runs
      `nmem bridge connections connect --space-id <Only me> --agent-id ducter --context ducter`). Run once on a
      scratch home 2026-11-12: Mem answered 503 `cloud_bridge_setup_unavailable` (research/66 §3). On hel first
      **更新** (nmem 0.10.116 by pip, D225). Trigger: Mem opens Bridge connections for the workspace (`bun run
      bridge:live -- --connected` gets past the connection line).
- [x] (D249, VERIFIED: the binding's own context works for the logical commands, and replies land in it) After that: does a terminal session's native inbox (the plugin prepares one in every session now) send to
      the persona's Agent mailbox, and does the reply land where the session reads? Adjust X1/S1's peer prompt and
      the skill hints to what works (research/66 §2). Trigger: the live run.
- [ ] File B16 with the Nowledge team: a device-code sign-in for `nmem connect` on a headless box, a public word on
      when Bridge connections open per workspace, and `status`'s `update.latest` lagging the release (research/66
      §6). Trigger: the author's go, with B11–B15.
- [ ] A home with no pipx, uv, password-free package manager or usable pip (a fresh Ubuntu server, a non-root
      user without `sudo -n`): the row's **怎么装** names `sudo apt install pipx` (D225, D229). If users stall there,
      offer a task that installs it with the user's OK (D169's shape). Trigger: a user stuck on that line.
- [ ] D229 live: tap **换一下** on hel (root, apt, pip copy 0.10.116 past the mark): pipx from apt, the old copy
      out, `pipx install --force nmem-cli`, still signed in (`nmem --json status` healthy), Bridge row back to
      Connect. Then a recall on hel that should find a memory from the identity's lane. Trigger: the author's go.
- [x] Partner recall and threads (research/69 K6): built in D368 (`memory_search` reads threads when asked or
      pointed at), measured on the eval (`thread-recall-*`).
- [ ] D368 live: on the author's home, "今天先弄哪个？" after Mem's morning Working Memory, and "how did I fix …
      in Codex" against a real thread; check the L4 block's size and that nothing says "your notes". Also read
      a day whose Working Memory has awaiting rulings and flags, to replace the inferred item shapes
      (research/138 F3). Trigger: the author's go.
- [ ] A 想起了 line for a past conversation (D368 (3)): "想起了你 11/12 在 Codex 里…", tapping opens the thread in
      Mem. Held: a thread is not a memory the person can forget or fix from that sheet. Trigger: a user asking
      where an answer about another tool came from.
- [ ] Working Memory for tasks (D368): a task's brief could carry the focus line where the task is about it.
      Held: the brief already carries the memories that matter (D168). Trigger: a task that missed the day's
      priority the partner knew.
- [ ] Tasks get two voices on saving (research/69 K1): the brief says never save memories (D168 (5)); the plugin's
      startup text says save durable decisions autonomously. Check in the task eval whether tasks still call
      `nmem m add`. Trigger: a duplicate memory traced to a task.
- [x] (2026-11-13, research/66 §7) Run `bun run bridge:live -- --connected` (dry), then `-- --connected --real` and record it in research/37:
      S1, S2, S3 and an X1 round trip with a native Claude Code session as the other side. Check that the native
      binding's own context works for logical `contacts/send/inbox/reply` (INFERRED) and replace the fake's
      `connections`/`session prepare` shapes with the raw ones. Trigger: the connection above.
- [x] A start mark for the persona's mailbox (B14, D170): what was in the inbox at the first check is never a
      request.
- [x] X1 · "有事问 Ducter" (D164, D170): the asker card on both clients, the reply by code, "not yet" after 30 min,
      60 s checks while live, 3 open asks per agent, the lock-screen copy.
- [x] X2 · "直接接" (D163, D170): the offer after two Go's, the rule in Settings › 伙伴, 5 a day.
- [x] Settings › 连上的 AI agent (D170): who can reach the partner, the learned rules, the muted (simplified by D332 to 和你的其他 agent 通信: one switch, only the muted).
- [ ] X3 · a team's agents: a per-team switch once a team context exists, Space-scoped answers (Mem search in that
      Space only), and the eval scenario for a teammate's question. Trigger: a team context and Mem's Team Bridge
      accepted.
- [ ] **不再听 <agent> 的** as a button on its cards and quiet lines (today: said to the partner, undone in
      Settings). Trigger: the first user who mutes one.
- [ ] Muted and over-quota senders are logged after `open` reads them; a sender-only probe would leave them unread
      (B6). Trigger: Mem ships `bridge inbox --peek` or a sender in `inbox`.
- [ ] The partner eval: `bridge-ask-you-zh/en` (a question from the user's own agent becomes an asker card, no
      prose, no bridge_reply) and `bridge-trusted-zh` (a trusted agent's work opens with no card). Trigger: before
      Bridge is on by default.
- [ ] X5 · consumer AIs (J5): take X1–X3's rules unchanged. Trigger: Mem's remote-MCP delegation (#8956) ships.
- [ ] X6 · probe Mem's Slack adapter as a sender to the persona (research/37 §8). Trigger: the persona has a
      mailbox.
- [ ] File B11–B13 and B15 with the Nowledge team (research/37 §6, §8; the text is ready). Trigger: the author's go
      (D111's channel was not reachable from the session that found them).
- [x] Read the real shapes from the live run (D249): `inbox`, `open`, send/reply, `inspect` and the 409; the fake
      answers in them by default. The older fields stay as fallbacks until Mem's next shape.
- [ ] Turn Bridge on by default by D170 (9)'s criteria (the first is met by D205: Ducter finds the persona's
      context itself; 断开 and 谁都不行 are the offs). Trigger: the live run passes (2026-11-13: everything but the linked reply, B17).
- [x] Clients render the quiet lines (发来请求 / 已发给 / 已回复, and a sender set aside) (D170).
- [ ] Follow-through by a time the user named ("今晚前告诉我"). Trigger: a user asks for it; `wait_until`
      covers it today.

### Work over time (D112–D115)

- [ ] A round of the waiting pose with real people, children included (LLM proxies: 5/10 for
      the pose alone; the words carry it). Trigger: before calling v1 done.
- [x] The moment a wait comes true: the bubble pops and the card springs from Waiting to Working
      (desktop and phone; reduced motion: a fade).
- [ ] Live: an OpenConnector Gmail trigger watch, a real judge model on a wait, a check on a
      worker device, a routine's real run and its per-run cap. Trigger: an OpenConnector account
      on the test Mac.
- [ ] Routines on another device, waking a sleeping one, the cloud fallback (D29). Trigger: a
      routine missed because its device slept.
- [ ] Editing a routine by saying it ("改成 8:30") as a diff card (research/20 §7.3).
- [ ] **D245, live:** a routine run that hits a real sign-out (Claude Code logged out, a
      connection signed out) and recovers after signing in, to check `troubleOf` against the
      real wording; a late run after the home slept; a folder watch on a real ~/Downloads.
      Trigger: the author's next routine that misses a morning.
- [ ] **D245 follow-ups:** a watch of files on a worker (only this computer today); a watched
      command's full output from a worker (the worker's check answers 4 KB); the
      routine-proposal guidance line "a repeating run carries out the lasting request each time,
      not a copy of today's decision" (research/77 §8.2, a persona change with its eval); a
      watch kept on New task's **等条件满足** (today it is the task's own wait, not a routine).
      Trigger: a person who asks for one of these.
- [ ] The partner eval: scenarios for "PR 过了告诉我", "一直修到 CI 绿", "每周一给我周报".


## A result in words (D124)

- [ ] Evidence carries pass or fail per check (`EvidenceRef.ok`, set by the task in
      `report_to_main`), so a reproduction is told by its result, not by its label. Trigger: a
      reproduction whose label the heuristic misses, or a passing run it calls one.
- [ ] A failed Open draft PR is client state only; a second client (or a reload) offers it again
      until the place says it has no remote (the protocol field). Trigger: that field lands.
- [ ] The partner says when it is putting a result into words (an `activity` for report turns), so
      the waiting line needs no 2-minute guess. Trigger: a partner slower than 2 minutes.
- [ ] D152: the agent's words show in its own language (often English for a zh reader). A small
      **翻译 / Translate** under a message, by the partner's cheap model, kept per message.
      Trigger: the author asks for it, or a zh user's task runs on an English-speaking agent.
- [ ] D152's summarizer and probe list (command -v, which, test, ls, grep) and the harness
      description fields (Claude Code `description`, Codex `justification`) were checked on
      fixtures shaped like the author's run, not a live Codex 0.167 / Claude Code session; check
      both, and whether Codex's exec events carry a reason field. Trigger: the next live dogfood run.
- [ ] D152 hides keys by pattern; a key with no known head and no telling field name (a bare
      32-character hex in prose) still shows. Consider hiding values the user marked as keys in
      Settings or the brief's own words ("this token: …"). Trigger: a reported leak.
- [ ] D152: a needs-you task with no visible ask was seen in the author's run; the clients now
      say **Over to you**, but the cause in core (which path set needs_you without a decision)
      wasn't reproduced. Trigger: the next time it happens, read the task's Log.
- [ ] D127's step table was built from the shapes the author's App Store Connect run showed and
      from OAR's per-runtime tool names; check it against a live Codex computer-use run and a pi
      run, and add what reads as **使用 / Used {tool}**. Trigger: the next live dogfood run.
- [ ] Older Logs have no thinking headings (`task_event.thinking` is new); a session resumed
      across the change shows Thinking lines only from then on. Trigger: none needed.
- [ ] D138: the browser's cua-driver spawns (`packages/runner/src/browser.ts`) still inherit the
      whole environment; give them `toolEnv` plus the display/session-bus names. Trigger: the
      next change to browser.ts.
- [ ] D139: DeepSeek Harness's partner session is not read-only (no per-session tool denial in
      OAR; its read-only permission mode unverified). Trigger: dsh installed for a check.

- **Chinese product name.** 「搭子」 is on hold: Baidu's AI office agent 百度搭子 (March 2026) is in
  Ducter's category (`research/41-zh-name.md`). Decide between "Ducter 搭子" and another name after a
  manual CNIPA search (classes 9, 42, 35, 38); the full zh pass is ready on branch
  `worktree-agent-a55f33cfcf026e6c1` (commit 702fa74). Trigger: the author picks a name.
- **A Mac doing tasks for a server, live (D155).** Turn on "Let this Mac do tasks for hel" in a
  signed Ducter.app against a real server: the LaunchAgent loads, survives logout/login and a
  crash, the Mac appears on hel with its agents and repos, a task runs there, and off revokes it.
  Trigger: the next release candidate.

## Harness engineering (research/48, 2026-11-10)

- [ ] **Live re-verify Claude Code 2.1.322 and pi 1.5.1** (D135 checks: compaction point with
      `--debug-file`, window knob, 1M switch) on a scratch login with haiku; widen `verified` only
      if they pass. The 2.1.322 binary's compaction code changed shape (INFERRED). Trigger: now.
- [ ] **The partner eval after D157**: add W1–W6 (needs / where), `rule_save`, connections and
      browser-place scenarios; run haiku and sonnet once. Trigger: before the next persona change.
- [ ] **One secret detector for the brief** (research/48 F7, decision §4.1). Trigger: the author's call.
- [ ] **Tool-less one-shot sessions** (`--tools ""` for the judge and the digest writer), after one
      measured call shows the saving (F8). Trigger: the next change to judge.ts or writer.ts.
- [ ] **Prompt-cache hit rate**: read `cache_read` vs `cache_creation` from a day of the partner's
      sessions (OAR usage) to replace principle 4's heuristic. Trigger: the cost-model work.
- [ ] **Before merging D165/D166 and D168/D169**: their highs in research/48 §2 (P1, P2, M1, M2).
- [ ] **D240/D241's open items (research/76 §4, §6):** the rest were decided in D241 (Codex
      subagents inherit the brief; PushNotification, RemoteTrigger denied in every task, Workflow since D282 only in browser places;
      pi's project AGENTS.md appended under the clean setup; DSH browser tasks in a home of Ducter's).
  - a live rerun of the HN browser lookup with D240's built-ins, to replace the INFERRED ~190K. Not
    done in D241: it needs the author's Chrome and a running instance (a session must not touch
    either). Trigger: a live browser task on the author's setup.
  - Claude Code's `EnterWorktree` / `ExitWorktree` in every task: a task already works in a
    worktree of Ducter's (D204), and moving to another would put its commits where Ducter doesn't
    look. Check what they do under `-p`, then whether they join the denials. Trigger: the next
    harness audit.
  - pi's global `SYSTEM.md` (`~/.pi/agent/SYSTEM.md`) replaces pi's own prompt in every task, clean
    or not, and no flag turns it off (research/76 §6.3). Ask pi upstream for a flag, or pass pi's
    own prompt explicitly. Trigger: a pi task that behaves unlike pi.
  - DSH in a home of Ducter's (a browser task, D241) is checked by tests only: run one live browser
    task on DSH and confirm its tools, its key from the person's credential file, and a resume
    after a driver switch. Trigger: DSH installed on a test Mac.

## Phone calls (D189, D193; `phone.md`)

- [ ] **The first real call, with the author** (trigger: the token imported on the home): read-only
  first (`tuwa_balance`, `tuwa_voices`, `tuwa_calls_list`), then one cheap call to a number the
  author owns; check every answer field `phone.md` §9 lists and fix the readers in
  `phone-provider.ts`.
- [ ] **Keep a call in Mem on tap** from its result (IQ9), and the GQ4 revisit trigger (the same
  number and goal approved 3 times in 14 days).
- [ ] **The partner's 连上 / Connect from the conversation**: today it says in one line where to
  connect; a card that opens the sign-in in place.
- [ ] **Inbound** (never answered by Ducter today, D218 (5)), live listening, Ducter calling the
  owner as the top escalation rung.
- [ ] **D218, own number, with real hardware** (trigger: the author's spare Android, the cable and a
  key): research/63 §6 one by one (real-network call states, keypad digits mid-call, headset words,
  levels through the cable, both engines' live session shapes and Qwen's price, microphone
  permission in the signed Mac app); then a PRC lawyer on research 60 §6 before offering it to
  mainland users at large.
- [ ] **D218 on a worker** (trigger: a phone plugged into a computer other than the home): the
  worker runs adb, ffmpeg and the voice loop and streams the call's state to the home (D157). Now part of D278 (a)-(c) below: the station by a live link, not by being plugged in.
- [ ] **D218: Bluetooth HFP from a Linux computer** (no cable), and `gpt-realtime-2.1-mini` as a
  cheaper engine once the eval of a call in someone's name shows it holds the rails.
- [ ] **D278 part 1 on a real phone** (trigger: the author's Pixel Fold with this build): research/89
  §8 P1 (a sheet's 拨打 rings through `placeCall` with `CALL_PHONE`, to a +86 mobile and an E.164
  foreign number, without the dialer's confirm; time to ringing), Android's permission prompt the
  first time, refused → the dialer filled, the sheet's notification readable when pulled down over
  the Pixel's in-call screen, 在 Pixel Fold 上拨打 from the Mac while Ducter on the Fold is (a) in
  front, (b) behind another app (its page may be paused: then the 60 s timeout line), and the
  partner's one line plus 通话结束 → how it went, on haiku (`bun run eval:partner`, a scenario for
  `from=own` with nothing set up).
- [ ] **D278 (a)-(c): the call station by a live link, control in the Ducter app, the voice on the
  station** (trigger: the author's sign-off on D278's direction and the tests below passing). Each
  computer reports `callLink { phone, kind: cable | bluetooth | continuity, checkedAt }`; the app
  reports `dial` and dials, reads the state and hangs up (`READ_PHONE_STATE`, `ANSWER_PHONE_CALLS`);
  adb leaves the user path; the voice loop runs on the station (D218 (7)'s worker step) and reports
  to the home. The card: **电话从你的 {phone} 打出，声音走 {computer}** through the glossary first.
  Device tests first, research/89 §8: on the Pixel Fold (Android 16) with the app, P2 the
  `TelephonyCallback` states of an outgoing call (off-hook at dial, nothing at answer) and whether
  the D238 service can read the in-call timer as answered; P3 `endCall()` with `ANSWER_PHONE_CALLS`
  for an app targeting API 35/36; P4 keypad digits (post-dial `,` `;` through `placeCall`, and
  accessibility taps on the dialer keypad); P5 Google's USB-C adapter + splitter + a USB sound card
  on the MacBook: the call routes at once (`TYPE_USB_HEADSET`), both directions audible, the pad
  value, whether uplink processing distorts TTS, crosstalk echo, 15 minutes without a dropout; P6
  the chirp handshake with no call (the app records the headset mic and hears the Mac's code; the
  Mac hears the app's tone); P7 a PD pass-through audio adapter charging and carrying call audio.
- [ ] **D278 (d): the Mac as a Bluetooth hands-free unit, a one-day spike** (trigger: the author's
  MacBook and Fold together, before any more cable UI). research/89 §8: B1 pair from the Fold: does
  it offer "Phone calls" for the Mac (an HF SDP record, UUID 0x111E); B2 a 100-line Swift probe,
  `IOBluetoothHandsFreeDevice initWithDevice:delegate:`, `connect`, the service-level connection up;
  B3 `dialNumber:` places a call on the Fold, `+CIEV` shows alerting then active; B4 SCO up: does a
  CoreAudio device appear, can AVAudioEngine or ffmpeg read and write it, which codec (CVSD / mSBC);
  B5 `sendDTMF:` reaches a phone menu, `endCall` hangs up; B6 which TCC prompts appear (Bluetooth,
  microphone) in the signed app. If B1-B4 pass, Android + Mac needs no hardware.
- [ ] **D278 (d): Continuity for iPhone + Mac** (trigger: after the Android route): research/89 §8
  M1 `open tel:+…` from the app (which app, what confirm, can computer use press it); M2 a virtual
  input (BlackHole) as the call's mic, the far end hears injected audio; M3 a process tap on the
  Phone/FaceTime process captures the far end and mutes it locally; M4 detect answered / ended and
  hang up through AX.
- [ ] **D278 (e): mainland China** (trigger: before own-number live calls are offered to mainland
  users at large): a PRC lawyer on research/60 §6 (反诈法 Art. 14's reading of a computer beside the
  phone; the disclosure wording); only while the station is linked and is a computer the person uses.
- [ ] **D278: the sheet over the in-call screen** (trigger: the notification proves hard to read
  during a call): a slim card over the call from the D238 accessibility service (research/89 §4.F),
  and for iPhone a notification / Live Activity.
- [ ] **A third calling provider** behind the same card (Twilio + a real-time model) if Tuwa's
  reach or terms stop fitting.

## Watching Ducter's browser and taking turns (D190)

- [ ] **On the author's devices:** watch a task on hel from the iPhone over the internet (`ducter domain`), take a turn, sign in with a real two-step code, hand it back; the same on an iPad, an Android foldable and the Mac app. Trigger: the next release with D190.
- [ ] **The Mac app reopens a live view after a reconnect** (the web client does), and draws the click ring. Trigger: a reconnect seen on the Mac with a view open.
- [ ] **The quality steps on a real phone link:** read `live.stats` on a real 4G/5G phone; tune `SLOW_MS`/`FAST_MS` and the tiers. Trigger: the first real-device session.

## Ducter's data folder and the opened task (D207)

- [ ] **A place-less task's scratch folder outside the data folder** (`<Ducter folder>/scratch/<taskId>`): today it is `<dataDir>/scratch/<taskId>`, Ducter-made and empty, the one way into the data folder. Trigger: a task seen reaching up out of its scratch into the data folder, or the Ducter folder gaining a third kind of thing.

## On hand as a workspace, next phases (D216)

- [ ] **CI on the row**: a repo task's PR checks (passing, failing, running) next to **草稿 PR**. Needs a PR watcher per open PR (polling every 2 min and waking the agent on a failed check; Ducter's `wait_ci` check is the start). Trigger: the first time the author merges from On hand without opening the PR.
- [ ] **The Mac: the rail beside an opened task, and many at once.** The web has both; the Mac app has the list, Find, keys, hover actions and ⌘O. Trigger: the author's review of the web's rail.
- [ ] **Done only while unread**: a read mark per task (synced like the conversation's), so a finished task the user already saw recedes further and an unseen failure stands out (a read watermark). Trigger: Done today holds more than ten.
- [ ] **Cost on the row**: a task's tokens or money, quietly, for the heavy developer (the until loop already counts tokens). Trigger: a cost question from the author.
- [ ] **Search past today**: the switcher sees every task the client holds; older finished tasks need a server search (the Log's FTS). Trigger: "where was that task from last week" (scenario I4).
- [ ] **Live checks**: against a real home (hel) with 20+ real tasks; the iPad simulator with a keyboard (j/k, ⌘O from the menu); an Android phone.

## Ducter's phone (D217)

- [ ] **On the author's Mac:** add 用手机 from the real app, sign in to Google Play and one real app, and run a real errand in it end to end (a Go at the tap, a sign-in turn). Trigger: the author's review.
- [ ] **A worker Mac's phone, for real** (built with fakes, D234): the 2.3 GB install on the author's MacBook from hel's card, a real errand in an app through hel, frames over the internet. Trigger: the author updates the MacBook's Ducter.
- [ ] **A Linux server's phone** (x86_64 image, KVM). Trigger: a home with no Mac.
- [ ] **The user's own phones:** physical Android over adb (USB/Wi-Fi), iPhones through Pinky once it can be approved from outside its window (its M4) or a presence-proving client exists. Trigger: either lands.
- [ ] **Autofill on the phone** (D191 by reference into app fields; the Pay card for in-app payments). Trigger: the first errand that needs a saved sign-in in an app.
- [ ] **A faster screen reader** (an accessibility companion, ~70 ms vs uiautomator's ~2 s) and **video frames** (scrcpy) for games and video. Trigger: a task that waits on reading, or a moving screen.
- [ ] **Update the pinned Android packages** (platform-tools, emulator, the image) on a schedule, with sizes and checksums together. Trigger: a security update to the image.

## 用电脑 / Use the computer (D235)

- [ ] **On the author's Mac:** + 用电脑 from the real app, the two switches through cua-driver's guide, a real Keynote export and a Mail reply behind Go, the agent pointer seen, Stop from the phone. Trigger: the author's review.
- [ ] **Electron and Catalyst apps** (Slack, VS Code, Lark): cua-driver's tree can be thin; fall back to the picture and pixel clicks with the gate on the element under the point, checked on real apps. Trigger: the first app task that finds no elements.
- [ ] **The gate's word lists against real apps** (Mail's 发送 icon-only button, WeChat's Enter-to-send setting, a menu item named only by a symbol). Trigger: the first real run.
- [ ] **A worker's own re-check of blocked apps per pid** (today the worker refuses blocked apps on launch only; the home's gate holds for every action). Trigger: a review of the worker trust boundary.
- [ ] **Linux and Windows desktops** (cua-driver runs there). Trigger: a person with a desktop Linux or Windows worker.
- [ ] **A harness's own computer use behind the gate**, if one offers a pre-call hook Ducter can block on (Claude Code's PreToolUse over its own computer use). Trigger: such a hook verified headless.

## Reply to one message (D236)

- [ ] **A human comprehension pass on the imprint**: five people who don't use Telegram, cold, on the phone shots (research/72 §6 is LLM raters only). Trigger: before calling the look settled.
- [ ] **Reach an original that left the screen**: the clients hold the last 200 conversation events; a tap on an older imprint says so. Add a channel history frame (before a seq) and load toward it, up to 20 pages. Trigger: the first "where was that" from the author.
- [ ] **Reply to a part on the phone and the Mac**: the wide web has 回复这段; the phone needs a selection toolbar, the Mac a text selection hook in MyGo. Trigger: a long partner answer the author wants to answer in pieces.
- [ ] **Reply inside an opened task's conversation** (to one of the task's own messages, steered with the quote). Trigger: the heavy developer asks for it.
- [ ] **The partner's answer chooses what it replies to**: today a turn's messages reply to its last user message (each reply has its own turn). Trigger: one turn that answers two things.

## 用这台手机 / Use this phone (D238)

- [ ] **On the author's Pixel Fold:** install the release APK from the browser, walk the guide through restricted settings, check Pixel's own strings against research/74 §2.2 and the miniatures, a real errand (a WeChat reply behind Go), Stop from the pill and from the Mac, and that the page keeps its socket with Ducter in the background for a 10-minute errand. Trigger: the author's review.
- [ ] **D247 on the author's Pixel:** with 用这台手机 off, ask "用我的手机打开小红书…" from the Mac and from the phone; the card, 去打开 opening the guide on the phone, the task carrying on by itself once the switch is on; that no task asks for adb. Trigger: the author's review.
- [ ] **A notification on the phone when 去打开 is tapped elsewhere** and the Ducter app is in the background (today the guide opens when the app is next in front; an Android change in `apps/android`; D331's own link is up only once Android's switch is on, so it can't carry this). Trigger: the author's Pixel check, if the guide doesn't show.
- [ ] **A paired phone whose app isn't open, before 用这台手机 is on:** a card that waits for it (and opens the guide when it connects) instead of the partner's one line "open Ducter on {phone}". D331 covers a phone whose switch is on (its own link is up with Ducter closed). Trigger: a person who asks with the app closed.
- [ ] **D246 on the Pixel Fold:** the connecting screen on the inner screen (book) and the cover screen (the emulator's cover display wouldn't wake for a shot); the guide's two steps with a browser-installed APK (that Android 16 shows Allow restricted settings only after the grey row was tapped, and its dialog's words: the emulator showed **App was denied access · Close**); the notifications ask once 用这台手机 turns on, the loan's notification with 停下, and App info listing **在用这台手机**. Trigger: the next build on the author's phone.
- [ ] **The allowance across a self-update** (Android 15+: does "Allow restricted settings" survive Ducter's PackageInstaller update?). Trigger: the first release after the author turns it on.
- [ ] **D251 live on hel:** with the Pixel added (main's hello fix) and with it removed, ask from the phone "用我的手机看看微信里…" (their phone, the card when removed, never the emulator) and "在安卓上试一下我们的 App" (Ducter's phone on the MacBook, never the Pixel); read the task's first phone_look line. Built 2026-11-13 (D251, which phone: mine · ducter · any). Trigger: the next release on hel.
- [ ] **D253 on the author's Pixel Fold** (needs the Android app from this release, bridge 2): lend it, lock it mid-task (the pill and the notification gone within a second or two, the task told, a new card on the next step, the screen staying on while lent); Stop from the notification and from the Mac (one end state on the pill, the opened task and the conversation within ~5 s, no "you may use" after it); toggle airplane mode for 20 s mid-loan (暂时没回应 at once, lost at 15 s, "back" once it reconnects); kill Ducter from recents mid-loan; a screen recording by the card, with the task checking it is recording and finding the video. Trigger: the next release on hel.
- [ ] **D255 on the author's Pixel Fold** (needs the Android app from this release, bridge 3): lend it, open Chrome and keep it lent for 10 minutes with Ducter in the background (the notification **正在用这台手机** with 停下 the whole time; App info shows Ducter running a service); `phone_record_start`, Android's dialog (its Pixel words, whole screen only), the red dot, 30 s in two apps, `phone_record_stop`, the video in Photos › Movies/Ducter and in the conversation's player; lock mid-recording (partial, kept); airplane mode for 20 s mid-loan (said as the phone's network, "back" once, after it answers); swipe Ducter away mid-loan (said as Android closed the app). Trigger: the next release on hel.
- [ ] **D331 on the author's Pixel Fold** (needs the Android app from this release, bridge 4; Ducter's switch on). Trigger: the next release on hel. Steps, each with what to look for:
  1. **The link with Ducter closed.** Open Ducter once after updating (the page's hello starts the link), then swipe Ducter away from recents. In the shade: **用这台手机开着** (quiet, no status-bar icon); long-press it: its channel can be turned off and the link stays (App info › Ducter still shows a running service). Reboot the phone, don't open Ducter, unlock it: the same notification comes back within a few seconds.
  2. **A Go with Ducter closed, phone unlocked.** On the Mac: "用我的手机打开 Chrome 看看今天的天气". Tap 借给它 on the Mac. Within ~3 s the pill appears on the Pixel without opening Ducter, and the task works in Chrome. The opened task on the Mac says **正在用你的 Pixel Fold**.
  3. **A Go while locked.** Lock the Pixel (power key), wait 30 s, then ask a new phone task from the Mac and tap 借给它. On the lock screen: **解锁后，Ducter 就开始用这台手机** (no task title there); the Mac's opened task says **借给它了：解锁你的 Pixel Fold 就开始**; the answered card says **借给它了，还没开始**. Unlock: the pill appears and the task starts with no tap in Ducter. Repeat with the phone face down on a table for 10 minutes before the Go (deep Doze): note whether the notification came while locked, or only once the phone was picked up (research/119 §3), and the same with Battery › Unrestricted.
  4. **Not now on a waiting Go.** As step 3, but tap **不借了** on the lock-screen notification: the Mac's task shows the hairline **你收回了 Pixel Fold**, the notification goes, unlocking starts nothing.
  5. **A lock that pauses.** In a loan, press the power key: the pill goes; the loan's notification says **「{task}」暂停了** with 停下; the Mac says **暂停了：你的 Pixel Fold 锁着**. Leave it locked 2 minutes (no "lost"). Unlock: nothing moves by itself; a heads-up **还借给「{task}」吗？** with **不借了** and **继续借给它**; the Mac says **在你的 Pixel Fold 上问你：继续借给它吗？**. Tap 继续借给它: the pill is back, the task carries on (its next `phone_look` works). Lock again, unlock, tap 不借了: the hairline **你收回了 Pixel Fold**.
  6. **The cap.** Lock in a loan and leave it 31 minutes: the task is told the paused loan gave it back; unlocking shows nothing from Ducter but the quiet notification.
  7. **Out of reach, said truthfully.** Airplane mode on, then tap 借给它 for a new task on the Mac: the opened task says **借给它了：现在连不上你的 Pixel Fold，连上就开始** with **它可能没联网，或者 Ducter 被关掉了…**; Battery › Restricted for Ducter, then the same: **安卓限制了那台手机上 Ducter 的后台…**. Airplane mode off: the loan starts by itself.
  8. **Battery:** after a normal day with the switch on and no loans, Settings › Battery › Ducter's use, on Wi-Fi and on cellular (research/119 §4 says a few percent at most on cellular; INFERRED until this).
- [ ] **D339 on the author's Pixel Fold and hel.** Trigger: the next release on hel. (1) In a loan, lock, then 停下 on the Mac: the paused row sits in the task's head under the headline (never in the title bar); the task says 在等 once. Then write "再借手机继续" in the task: one new card **「{task}」想借你的 Pixel Fold 用一会儿**; 借给它, and it carries on. Write "你还在么？" right after a 停下 (within a second): it answers (no spinner). (2) The head of a phone task placed on hel says **Codex 在你的 Pixel Fold 上**; no 看它上网 unless it opened a page in Ducter's browser. (3) Smart Lock: with On-body detection on, let the screen time out in a loan: does Ducter's wake get past the lock screen without the PIN? If not, the ⓘ line's promise is wrong: reword it (it is INFERRED today). Also confirm the zh name of Smart Lock on the Pixel (延长解锁 or another) and Android's path (Settings › Security & privacy › More security & privacy › Extend Unlock on Android 15 Pixels, inferred).
- [ ] **Hel's Log of the 0.0.69 run behind D339 (4)** (the person's "你还在么？" got a spinner): read its task stream (kinds, states, `delivered` modes, turn ends only) to confirm the cause was the note steered into a stopping turn and run as a turn Ducter didn't track. Trigger: the next time someone can read hel's Log with the author's leave.
- [ ] **Sound in a screen recording**
 (the phone's own audio through AudioPlaybackCapture, the mic only when asked; Android's dialog has its own audio switch for its recorder only). Trigger: a recording that needs sound.
- [ ] **A recorder on Ducter's own phone** (the emulator: `adb shell screenrecord`, the same tools and the same check at the home). Trigger: a demo on Ducter's phone.
- [ ] **The recording on the opened task and the phone's card** (a red dot beside **正在用你的 {phone}**; today only the phone's pill and notification show it). Trigger: the author's review.
- [ ] **Why a phone is quiet, from the phone itself** (D253; D255 built the end's why: network, a new run, the page paused): the app could tell the home it is losing its network before the link drops. Trigger: a quiet phone whose cause the task can't say.
- [ ] **Restricted-settings detection** where the app op can't be read (it reads as unknown on the Android 16 emulator, so the guide shows all three steps): try `AppOpsManager` by op code or the package source. Trigger: the Pixel trial.
- [ ] **A human comprehension pass** on the pill and the guide (the naive raters were LLM proxies, research/74 §8). Trigger: the first outside testers.
- [ ] **Watching the loan from another window** (a live view of the person's own phone over the accessibility screenshot, ≤ 3 frames/s). Trigger: someone asks to watch from the Mac.
- [ ] **iPhone** (research/74 §7): revisit if Apple opens app actions to third parties (App Intents across apps) or iPhone Mirroring becomes scriptable with an accessibility tree. Never iphone-use's code (PolyForm Shield).

## On hand beside the opened task (D244)

- [ ] **The floating little phone** in the opened task (research/78 item 3): the next step, after D244 merges.
- [ ] **On a real 11-inch iPad held across and a real Pixel Fold** (the rail at 1180–1194, the book split with the rail in the first half); so far headless shots only.
- [ ] **Resizing the rail** (Lody's 240–420). Trigger: someone asks; today it follows the window (`clamp(300, 22%, 340)`).
- [ ] **New results across devices**: seen is kept per device, so a result opened on the phone still shows as new on the Mac. Trigger: someone notices it; the fix is a seen cursor per task in the home.
- [ ] **A human comprehension pass on the row faces** at 24 pt (flag, reading, done) on a 40-task rail.

## On hand as a conductor (D261)

- [ ] **Against a live home with the author's real board** (the 3 quiet waits, 30+ tasks): so far the Mac's view tests and headless web shots from a demo core.
- [x] **A task's own timer** (`wait_for` with a time; built 2026-11-16, D267): a task can only wait on a check or an event, which is why one used `date` as a clock; D261 refuses that, and a time-only wait for a task needs the waiter to wake the task, not the partner (a task's timer is the partner's today). Trigger: a task asks for "look again in 45 minutes" twice in a week.
- [ ] **The shorthand guard on a task's reports and checkpoints**, not only a wait's reason (D261 (10)). Trigger: a row's line shows notes again; the rule then belongs in the task's brief.
- [ ] **The web's routine shelf under a project's lens** (the Mac shows only that project's routines; the web still shows all). Trigger: the next pass on routines.
- [ ] **The window header's counts vs the strip**: the header's 今天做完 counts successes today, the strip counts the section (failures and yesterday's late finishes too). One rule for both is the shell's call (the header is shared chrome).
- [ ] **Quiet after 24 hours** and **seen results folded by default** are defaults to revisit with real use.

## On hand with character (D287)

- [ ] **People, not only LLM raters**: the author first on their real board, then a consumer who has never heard "agent" (research/95 is Haiku proxies only). Trigger: the next build the author installs.
- [ ] **The iOS Simulator and Android** for the head and the cards (the phone's 56 figure, one card to a row). Trigger: the next phone release.
- [ ] **A done card's moment on the Mac when it arrives live** (the web's pop plays the first time the card is drawn this session; the Mac's too, but neither ties it to the handover face). Trigger: the author's review.
- [ ] **The fold threshold (3), two cards to a row from 612, the day column from 1280** are defaults to revisit with real use.

## From the author's phone-use run (2026-11-16)
- [x] **Recording consent is the person's turn, said everywhere** (built 2026-11-16, D280 (1)): the
      card in every window with its countdown and 不录了, the pill's 轮到你：点「立即开始」.
- [x] **The task hears the loan ended** (built 2026-11-16, D280 (2)): "Your loan of {phone} ended: …",
      the tools refusing after, `phone_give_back`, the hairlines.
- [x] **Tests that take the phone away need the person** (built 2026-11-16, D280 (4)): the brief and
      `phone_ask_user` say to ask the person with exact steps and report what was seen.
- [x] **The screen went dark during an idle loan** (built 2026-11-16, D280 (3)): the app's own screen
      hold beside the pill's flag; a timeout is told from a lock and never ends the loan.
- [ ] **D280 on the author's Pixel Fold.** Not yet run on a real phone: (a) a recording task: the card
      on the Mac with its countdown, a Mac notification with the window behind, the pill's 轮到你 with
      the accent rim, Start now resolving the card, 不录了 closing Android's dialog, 2 minutes with no
      answer resolving it as not recorded; (b) an idle loan for longer than the phone's screen timeout:
      the screen stays on (`adb shell dumpsys power | grep -i ducter` shows `ducter:loan`, `dumpsys
      window | grep mHoldScreenWindow` the pill); (c) with the timeout forced (Settings › Display ›
      Screen timeout 15 s and the hold released by a debug build, or a lent phone left in a drawer), the
      screen comes back on and the loan holds; (d) the power key ends the loan within about 2.5 s; (e)
      Stop, a lock and the task finishing each show their hairline on the Mac and the web. Trigger: the
      next errand on the Pixel.
- [ ] **Android's button word read from its dialog.** The card says 「立即开始」 (the author's Pixel
      Fold); other versions say 共享屏幕 / Share screen. The accessibility service could read the
      dialog's positive button and send it with the recording's state. Trigger: a person on another
      Android version reads the card wrong.

## From the author's review of 0.0.58 (2026-11-16, after the release)
- [x] **Calls with your own number when the home is a remote server.** Done in D278 part 1 (2026-11-16):
      a server home never offers itself, install lines for the home's own OS only, 再找一次 answers
      (正在找…, then 看过了 · time · what it saw), and 你来打 / You call (the sheet, one tap on the phone).
- [x] **立即查看 / Look now says what it does**, and **a wait that feels alive, not "在等"**. Done in
      D279 (research/90): **{time} 回来 / Back at {time}**, the watch card's ring, looks and moment,
      **现在就去看一次 / Check now**, **不用再去看了 / Stop checking**. Left: (1) human raters (the
      author first) on the shots in `.shots/d279/`; (2) the watch card's tally counts wakes in the
      loaded transcript (an opened task loads its latest 2,000 events), so a loop older than that
      counts from there; core could log a look count on a waiter's end. Trigger: the author's
      review of D279.

## D282: a task is the person's own agent, switching inside one task (2026-11-16)
- [ ] **pi and DeepSeek Harness on the same switch paths.** Resume by id with a new model, and an
      agent switched back resuming its own session, are verified on Claude Code and Codex only
      (research/92 §5); on pi and DSH a rejected resume falls back to the condensed start. Trigger: pi
      or DSH doing the author's tasks.
- [ ] **A real-model run of a switch** (Claude Code → Codex → back, Sonnet ↔ Opus in place) on the
      author's setup, and Codex's `/compact` through OAR live. Trigger: the author's first day of
      daily work in Ducter.
- [ ] **The Ducter task tools' own cost per request** with the real core (research/92 measured
      with report_to_main and checkpoint only). Trigger: the next token audit.
- [ ] **The model and effort rows on the phone's switch list** read the agents' model lists from
      New task's options frame, asked for when the list opens. Check on the iOS Simulator at 390 px.
      Trigger: the next phone review.

## D288: a task's context, compactions and account limits (2026-11-16)
- [ ] **On hand's tiny ring, only near the limit.** The task card would carry the latest reading
      (`TaskCard.context: { tokens, window, compactAt }`, set by core from the `context` lines) so a
      row on On hand can show the ring when a task is past its save point. Trigger: the On hand
      redesign lands.
- [ ] **The partner plans with the limits** ("Codex has 60% of its week left; I'll give this one to
      Claude Code"): `fw_candidates`' quota pace reads the home's account book. A partner tool or
      persona change: D175's eval with it. Trigger: the first limit hit in a real week.
- [ ] **A worker's limits and Compact now on a worker's session.** The card shows the home's own
      read; a worker's agents need a worker op (`account_usage`, like `models`) and its session's
      `compact`. Trigger: the author running tasks on hel daily.
- [ ] **Live checks**: a real Claude Code auto-compaction (its `post_tokens` present?), a real Codex
      `account/rateLimits/updated` (its params as assumed), pi's `tokensBefore`, a real limit hit's
      `rate_limit_event`, and Claude Code's `get_usage` on a Max account (the card's words).
      Trigger: the author's first day of daily work in Ducter.
- [ ] **OAR upstream**: the sizes on `compaction_ended`, a `rate_limit` event (Claude Code), the
      Codex rate-limit update, per-turn usage. Trigger: the next OAR release window.
- [ ] **A human comprehension pass** on the ring (does a fresh user read it as "how full", and the
      butter as "soon, and fine"?) and on 压缩 / compact. LLM proxies first. Trigger: the next
      comprehension round.
## Moving between views (D290, 2026-11-16)
- [ ] **Real devices.** The motion was tuned on the Mac tester's frames and headless Chrome; not yet
      on the iPhone app (WKWebView: View Transitions need iOS 18; the edge swipe and the sheet's
      drag), Safari in a tab (its own edge swipe, `hasUAVisualTransition`), a Pixel (the system's
      predictive back), or a real Mac window on a 120 Hz display. Trigger: the next release run on
      the author's phone and Mac.
- [ ] **Human eyes on the feel.** Durations and curves were judged from frame sequences only
      (`.shots/d290/`). Trigger: the author's review; tune `theme.Nav` and `--t-*` together.
- [ ] **The hero from places other than On hand's rows** (a task chip in the conversation, a
      notification's card, the rail beside an open task on the web). Trigger: after the review, if
      the row's hero reads well.
- [ ] **Languages beyond the two tables (D292, research/99).** Left: (1) tables for the code's own
      lines (acks the model didn't write, cards Ducter builds, pushes, words to other agents) in
      at least ko, ja, zh-Hant, es: today they read English through the fallback chain; (2) a
      zh-Hant interface table (today zh-Hant reads Simplified); (3) the inline zh/en branches still
      in `packages/protocol/test/lang-guard.allow.json`, shrunk file by file; (4) real users of
      each language, especially short Latin messages the stopword score is unsure of. Trigger: the
      next non-Chinese, non-English user report, or the first interface table after zh/en.

## Rich answers (D303)

- **More kinds:** a chart with two series, a pie or a progress ring, a small form. Trigger: three
  real asks the four kinds can't answer, or the "your own small apps" work (roadmap Later).
- **Ticks across devices** for a list that isn't pinned: a pinned list's are on the home (D381); an
  unpinned one's still stay on the device. Trigger: a person who ticks an unpinned list on one
  device and looks on the other.

## Pinned (D381, `conversation.md` "Pinned", research/150 #1)

- **A naive-rater test of 置顶 / Pin** (three users, zh and en: what happens when you tap it, what
  取消置顶 does). Trigger: before the author reviews D381, or the first misread.
- **The Mac's Unpin has no Undo** (the web's toast has 撤销). Trigger: the Mac's toast taking an action.
- **A second partner's pins** (preview, D309). Trigger: the second partner out of preview.
- **A routine keeps a pin current** ("every morning, the PRs waiting on me" as a pinned table that
  refreshes itself): a routine's run reports to the partner, who writes the block with its pin.
  Trigger: the first person who asks for it; this is the next step of "your own small apps".
- **The iPhone and Android apps' own views** draw the web's strip and sheet inside the web client;
  a native view when those apps draw the conversation natively.
- **Pinned in chat apps:** a chat app shows the plain lines of a change; no strip there. Trigger: a
  person who pins from Telegram or WeChat.
- **A real walk:** pin, tick on the phone, look on the Mac, "add …" by voice. Trigger: the next
  live walk.

## Later from the gap audit (research/150)

- **#2 A real inbox for the look-out-for-you engine:** a replay kit that runs the detectors and the
  morning note over an exported mailbox on the author's machine, nothing kept. Trigger: the author's go.
- **#3 晚点再说 / Later for what needs you:** tonight, tomorrow morning, Monday; back inside the next
  morning note, never a ping of its own. Trigger: next in line after D381.
- **#8 A feature's first meeting:** one page of three small moving cards, the first time a person
  walks into a place themselves, once per device. Trigger: a design pass with the metaphor rubric.
- **Choices in chat apps as buttons** (Telegram inline keyboard, Slack buttons) instead of typed
  lines. Trigger: the first real use of choices in a chat app.
- **The iPhone and Android apps' own views** draw the web's blocks inside the web client; a native
  view when those apps draw the conversation natively.
- **The full eval with the persona's "Rich answers"** (D175): only the `rich-*` scenarios ran, with
  `--only`. Trigger: the merge; rerun all and commit LATEST.json then.

## Voice (D305)

- **A real run on every platform**: a microphone, the recognizer, a voice, the permission prompts and
  Open Settings on a Mac, an iPhone, an Android phone and Chrome. Trigger: before the release that
  ships it. Everything so far ran with fakes.
- **Hold to talk in a task's composer.** Trigger: a person who steers tasks by voice.
- **A key to hold in a browser** (the Mac's 按住说话的键 on the web wide; which keys a browser tab can
  watch without a global hook). Trigger: a person talking to the web on a computer.
- **A full spoken conversation** (a call with the partner, hands-free, interruptible), reusing D218's
  realtime loop or an on-device one. Trigger: the first slice used daily.
- **Chrome's language pack offer** (`SpeechRecognition.install`) so a browser can stay on the device.
  Trigger: a person who asks why Chrome isn't on the device.
- **Android's level scale** is inferred (`(rmsdB + 2) / 12`). Trigger: a real phone's meter that sits
  low or pinned.

## Done for you (D300)

- **Commands a harness ran itself** (a `git push` with its own approvals off) are not in the record. Trigger: the first real case, or the gate covering shell effects. Then: list outside-looking commands seen in transcripts in their own group (`flows/G-safety.md` G5).
- **Autofill's uses are kept in the vault, capped**, not in the Log. Trigger: a person scrolling back past the cap. Then: log each use as a typed event.
- **The day's money** (what was spent, per currency) and agent usage as one more fact on the day header. Trigger: a second payment kind (a subscription, a call's cost).
- **The iPhone and Android apps** open the web's sheet; a native view when those apps get Past tasks natively.

## D313: On hand's cheer (2026-11-17)
- [x] **The web's cheer matches the Mac's**: it swells from rest to ~1.02 and back (D315). Waiting for the view transition to finish is still open. Trigger: the next On hand pass.

## D315: On hand after the review (2026-11-17)
- [ ] **The conversation's header in one word order** (「1 件等你　在做 2 件」 → 「1 件等你　2 件在做」), both clients and their tests. Trigger: the next header change.
- [ ] **今天做完's section and the strip count the same** (a done only claimed is listed but not counted, D310). Trigger: the author sees 「今天做完 1」 over a strip without it.
- [ ] **A demo with two computers** in `demo-onhand.ts`, so the shots show where on the one card that runs elsewhere. Trigger: the next On hand shots.
- [ ] **On hand in front of people**: the author, then a consumer who has never heard "agent" (research/95). Trigger: D315 reviewed.
- [ ] **The web's cheer matches the Mac's** (`oh-cheer`: wait for the view transition to finish, swell from rest to ~1.02 and back). Trigger: the next On hand pass.

## D319: the website and the download page (2026-11-17)
- [ ] **What's owed on the site** is listed in `design/site.md` "Owed": the README's hero, On hand, task and Partner shots; the landing page's On hand board redrawn as D287; Chinese for the site; a mirror for mainland China (with `install.sh`); docs search; an axe pass. Trigger: the author's review of `/download`.

## D321: what it knows about you, and the first hand-off (2026-11-17)
- [ ] **People and projects as Memory groups.** Trigger: Mem's list returns labels, or its people graph (`m identity`) leaves Labs.
- [ ] **The partner offers S2 itself** ("want me to ask your terminal Claude?"). Trigger: Mem's contacts say what a session is working on; then a persona change with its eval scenario.
- [ ] **A human comprehension test of 试试看** (does a developer paste the words into the terminal, not into Ducter?). Trigger: D321 reviewed.
- [ ] **Fix keeps the memory's content**: 改 writes the new words as title and content (D304's way). Trigger: Mem's update takes a title alone without losing what the content adds.

## Flaky under load (2026-11-17)
- [ ] **`channels-telegram.test.ts` "a picture in Telegram becomes the message's media; a blocked bot
      reads as can't connect"** failed once in a full local run while e2e and other suites ran
      (19 ms, not a timeout); it passed 14/14 alone three times and in three loaded reruns of
      core + web. Capture its error the next time it fails and fix the race. Trigger: the next failure.
- [ ] **`channels-wechat.test.ts` "their words come into the one conversation…"** fails alone, not only under
      load, on 2026-11-17 at 03:50 UTC: `wechat().openUntil` reads 03:00:00.000Z, already past `Date.now()`
      (a whole hour, so the window may be computed from a rounded or fixed time). Seen while checking D324,
      unrelated to it. Trigger: now (it fails every run at this hour).

- [ ] **D325 follow-ups (steer and held words).** (1) Done 2026-11-17 (research/116): live on
      Claude Code, Codex and pi the echo comes at the step the model reads the words, and the
      runner passes a UUID per steer as OAR's `inputId` and matches the echo by it (Claude Code,
      Codex; DeepSeek Harness by source), else by words (pi). Left: **DeepSeek Harness live**, once
      it is installed on a test Mac. (2) A worker on a Ducter before D325 sends no echo: its steers
      stay "at its next step" until the turn ends; one before this change matches by words.
      Trigger: the author's live review.

## The 0.0.70 live walk (research/124, 2026-11-17)

- [ ] **The partner doesn't see what the person says straight to a task** (F1). Live, it called the
      person's own README, NOTES and `sleep` requests unrequested, steered the task to stop, and offered
      to delete the files. Proposed: a report carries the person's own words to that task since the
      last report, marked as theirs. Needs a Dn and the partner eval (D175). Trigger: now.
- [ ] **D332 (3)'s unasked connect from a second home** (F2): a home with its own data folder on a Mac
      whose Mem has no Ducter connection connects itself. Proposed: unasked only for the default home;
      others on the switch or **Receive here instead**. Needs a Dn. Trigger: now.
- [ ] **The partner's `wait_for` description** still gives its examples as 「中文 / English」 pairs, which
      a task copied as both (F7; the task tool is fixed). Trigger: the next partner-tool change (D175's eval).
- [ ] **D348 walked live** (F8's small things, closed against the demo cores): a real wait with a long
      reason in a 544-px pane, held words after a real Stop, a locator jump in a real long session, two
      reports of one folder task saying the undo line once. Trigger: the next live walk.
## D341: 待办来源 / To-do sources (2026-11-17)
- [ ] **Jira** as an adapter (`/rest/api/3/search/jql` with `assignee = currentUser() AND statusCategory != Done`, ADF comments, done as the one workflow transition into the done category, asking when several fit or fields are required; Data Center from a worker inside the company network). Trigger: the first person who asks for Jira, or a second tracker request.
- [ ] **A company's own tracker** through an MCP or HTTP adapter (list mine, get, comment, set done, a link) on `SourceAdapter`. Trigger: a team asks with its tracker's API in hand.
- [ ] **GitHub through a connection** (the person's OpenConnector or oo GitHub) when the home has no gh. Trigger: a home with GitHub in its accounts and no gh.
- [ ] **A vault on a worker** (the Obsidian adapter runs where the vault is, like D197's folders). Trigger: someone whose vault lives on another computer than the home.
- [ ] **Undo for a tick in Done for you** (untick; the adapter already does it). Trigger: the first person who wants a tick back.
- [ ] **New ones in the morning note** (D165's limits) instead of their own line. Trigger: the author says the 3-hourly line is noise.
- [ ] **`set_todos` read by people** (D348: five LLM raters only). Trigger: the next comprehension test with people.
- [ ] **Live checks:** the author's gh and a real (copied) vault on iCloud and Obsidian Sync with the note open in Obsidian. Trigger: before calling D341 done.
- [ ] **Several GitHub accounts** (one source per home's gh today). Trigger: someone with a work and a personal account on one home.
- [ ] **D357 live:** On hand's group and fold against the author's real GitHub (557 assigned, the review requests, a mention), the hand-over landing in the repository's folder, the rate limit while typing fast in the fold's Find. Trigger: before calling D357 done.
- [ ] **D357: the review list's own count of pages** (search caps at 1000; a person with more sees "more" stop there). Trigger: someone past 1000 open in one scope.
- [ ] **D357: a mention not assigned to the person** (search `mentions:` alone) is not offered: D341 takes what is assigned. Trigger: the author asks for mentions they aren't assigned.
- [ ] **D359 live:** the sort against the author's real GitHub (557 assigned) on the real cheapest model: what it costs, how long, whether the groups are right (a hand-check of 50), and a pre-read of a real PR. Never run here. Trigger: the author's home on this build.
- [ ] **D359: humans on the pile's look and words** (research/130 is LLM raters only; the en sentence was edited after the round, not re-rated). Trigger: the first three people who connect GitHub.
- [ ] **D359: linked PRs as a signal in the sort** (an issue with an open PR of the person's, or one merged). Today the model sees only the issue's own words. Trigger: the sort puts a done-by-PR issue in "do".
- [ ] **D359: each clear a little brighter** (the nth of the day lifts a slightly warmer page; no sound). Borrowed idea, held. Trigger: the author asks for more delight in the tick.
- [ ] **D359: 这类不用告诉我 on the morning's to-dos find** mutes nothing today (the find isn't the engine's). Trigger: someone taps it.
- [ ] **D359: a decide answered "later" or a close "kept" is remembered only until the issue changes** (its verdict is made again). Trigger: the same issue asked twice.
- [ ] **D359: the pile's sheets on the phone apps** (the iPhone and Android clients show the pile only through the web view). Trigger: the phone apps' On hand.

## What changed after an update (D344)

- [ ] **Walk it live:** update a real home and the Mac app from 0.0.72 to the first release with D344; the partner's line once, in the right language, and not after reading the card's notes that day. Trigger: the first release carrying D344.
- [ ] **The Android card's See what changed** on a phone (it opens the browser; the page hears it was read). Trigger: the next Android update walk.
- [ ] **In-app notes** (a sheet with the whole section instead of the website). Trigger: someone without a browser at hand, or the site unreachable from mainland China.
- [ ] **A zh What's new page** with the zh lines (the data is parsed already). Trigger: the site goes bilingual (design/site.md).
- [ ] **Month folds** get long while every release is in one month (69 in November 2026); fold by week if a month passes ~40. Trigger: the author finds the list long.

## D345: 连上 GitHub, guided (2026-11-18)

- [ ] **Live check:** a fresh Linux home without gh, as root and as a plain user, and a Mac with and without Homebrew: 连上 → 装上 gh → the code → connected. Trigger: before calling D345 done.
- [ ] **Install on a worker:** New task's clone on a worker without gh still says how to install it by hand. Trigger: a worker without gh reported.
- [ ] **Keep the pinned gh current:** a Ducter release moves `GH_RELEASE` (`packages/core/src/gh-install.ts`), and the home replaces its own copy. Trigger: the next gh security release.

- [ ] **e2e flake (2026-11-18):** "all → done in order" (Update all finished by the restarted home) failed once at 16/17 during a network drop, passed 33/33 on rerun. Trigger: it fails again; then read the log for the plan step that stalled.

- [ ] **iOS 27 SDK before April 2027 (ITMS-90725, Apple mail on 0.0.75):** App Store Connect will refuse uploads built with an SDK older than iOS 27. The TestFlight job now picks the newest Xcode 27.x on the runner (DUCTER_XCODE=27 is a minimum), else warns and uses the default (Xcode 26.6 / iOS 26.5 SDK on macos-26 today). Trigger: GitHub adds Xcode 27 to its macOS runner images, or March 2027 at the latest: then move the job to a runner with it (or self-host) and confirm the warning is gone; iPhone Duo also needs 27.1 for full screen (D176).
- [ ] **D360: humans on the group's words and card** (research/133 is LLM raters only). Trigger: the first person whose split runs in a group.
- [x] **D360: handed-over to-dos grouped by what they share**: done by D385 (a hand-over of two or more is a group; a subject is found by meaning).
- [ ] **D360: a group by hand on the Mac** (the web has the selection bar's **放进一个分组**; the Mac has no multi-select on On hand yet, so it is the partner's words there). Trigger: the Mac's On hand gets selection.
- [ ] **D360: the keys walk a group's parts** (j/k skip the parts inside a group card on both clients; each opens by click). Trigger: the author walks On hand by keys past a group.
- [ ] **D360: a group's parts on the phone apps** (iOS, Android draw the parts as their own cards). Trigger: the next phone On hand pass.
- [x] **D365: a contrast floor for faded "not set up" marks.** Done in D374 (2026-11-19): grey and the muted ink, never transparency, 3:1 at the least (`theme/faded_test.go`).
- [x] **D374: a dark cast for `token_ink`** (the token of an agent with no coin of its own is ink on the dark card, faded or not, about 1.2:1). Done 2026-11-19 the D213 way: `token_ink_dark`, the same token re-cast in bone clay (`tools/art/coins.py` TOKENS_DARK), about 10:1 on the dark card and 7:1 faded; the Mac picks it by `theme.Clay`/`FadedClay`, the web by `coinSrc`, and a signed-out one is grey and toned, never see-through, on both (`theme/faded_test.go` keeps 3:1 for it faded and unfaded).
- [x] **D365: the server home's versions row.** Done in D374 (2026-11-19): rows under hairlines, the version and 检查更新 at the right end.
- [ ] **D365: the Settings pass in the real Mac app and the iOS Simulator** (this pass used the Mac's test renderer and headless Chrome at 390). Trigger: the next release's walk.
- [ ] **D372: an errand run live on the fast tier** (Sonnet booking and comparing on real sites vs Opus; research/142 only infers it). Trigger: the author's next hotel or flight task on the home.
- [ ] **D372: Codex's fast tier** (which of sol/terra/luna/astra is faster and lighter on the plan; nothing Ducter reads says). Trigger: Codex lists a tier, or a measured run.
- [ ] **D372: limits by kind** (keep the smartest's limit for code by the limit left, not only by kind) waits on D133's reported limits. Trigger: D133 built.
- [x] **D372: a preference only in Mem.** Done in D379 (2026-11-19) for a memory the partner's recall returns: read by code, applied, asked once to keep.
- [x] **D372: the unsaved-preference eval** (`kind-never-unsaved-zh`). Done in D379: Ducter applies it by code.
- [ ] **D379: a Mem-only saying the partner never recalls** (said to another tool, never in this conversation) still waits for a recall; a quiet Mem search for agent sayings (one query per agent, a few times a day) would catch it. Trigger: a task goes to an agent a memory says not to use, with no recall in that turn.
- [ ] **D401: a where said in passing** ("要登录的网页都在 MacBook 上做", "验证都去 haswell") is still kept only by the partner's rule_save; a rule names an agent, and a where-only saying has none. Trigger: a task opened on another computer after the person said where this kind goes.
- [ ] **D402: Discord read as the person** (a user connection, not OOMOL's bot): watch it when a source offers one with mentions and DMs. Trigger: such a connector in oo or OpenConnector.
- [ ] **D402: the morning note names an account it couldn't read** ("Discord 还读不了") once, the first morning after it stopped. Trigger: a person who never opens Settings › Accounts asks why Discord was never mentioned.
- [ ] **D379: sayings in other languages** (the parser knows zh and en words; a ko or ja saying is not read). Trigger: a person who says it in another language.

## Continuity first (D373, `conversation.md`, research/143)

- [x] **D373: a continued task moves to the computer its follow-up needs**: built by D376.
- [x] **D373: continue the person's own sessions from the conversation**: built by D376 for the home's sessions.
- [ ] **D373: watch it on the home** (how often the second look fires on separate work, and whether a long-lived continued session needs a fresh one sooner). Trigger: a week of the author's use after the release.
- [ ] **D373: Claude Code resume days later, live** (Codex verified on hel; Claude Code only per research/03). Trigger: the first Claude Code task taken up again after its session was parked a day.

## D383: 给你做的 / Made for you (`made.md`, research/152)

- [ ] **Save to… (I3)**: a made thing written into a folder or a repo's main checkout, never committed, 7-day undo (I-results IQ4). Trigger: the first "把那份放到项目里".
- [ ] **Versions of a document** (I3's 第 n 版 / What changed). Trigger: a follow-up that rewrites a document a task made.
- [ ] **Share a link (I5)**, with the pre-share check (IQ6, IQ7). Trigger: Ducter Edge.
- [ ] **Take one off the list** (not delete the file): the person's own "not this one". Trigger: a person who asks to hide one.
- [ ] **Find by what is inside a written file** the home never read (only its name, the words around it and a block's cells are searched today). Trigger: a miss in the author's use where the words were only inside the file.
- [ ] **Walk it with weeks of a real Log** (the author's home): ranking, noise from coding tasks' written docs, and the raters' line with people. Trigger: the next live walk.

## Waiting for your reply, with the reply written (D403, research/164)

- [ ] **Read OOMOL's Gmail send schema** (`oo connector schema` for `gmail.reply_to_thread` and
      `gmail.send_email`: field names only) and check `replyInput` maps them; then one real send to
      the author's own address, on his Go. Trigger: before the release that carries D403 is called verified.
- [ ] **On hel, three days after it updates:** waiting finds said per day, how many taken (Go) or
      sent, how many 撤回; the 11-12 kind of stranger relay never said. Trigger: hel on the release.
- [ ] **A drafter eval with a real cheap model** over synthetic threads (zh, en, ja): the thread's
      language, the person's voice, no invented fact, a check line when the answer needs one.
      Trigger: before widening drafts beyond Gmail.
- [ ] **Drafts for Outlook and chat DMs** (Slack, Discord), and "answered elsewhere" from the person's
      own chat messages. Trigger: the first person with Outlook connected, or a Slack find held twice.

## D407: a routine fills an app (`apps.md`)

- [ ] **Run the review board on hel**: the author's routine's next rounds with `title` and `ci` in its review_report, the offer after three, the board on his phone and Mac. Trigger: this branch merged and released.
- [ ] **CI read by Ducter, not said by the task** (the board's CI pill is the task's word at the head it looked at; a check run that turns red between rounds shows next round). Trigger: a board showing green while GitHub shows red.
- [ ] **Other routines' boards made from a template** like the review board (a price watch, a benchmark) instead of the partner writing each one. Trigger: three boards of the same kind made by the partner.
- [ ] **The report counter survives a restart** (the offer for reports counts in memory; the review offer counts rounds on disk). Trigger: an offer that came late after a restart.

## D405: 小应用 / Apps (`apps.md`, research/166)

- [ ] **Open the Mac's app window in the real app** (the test renderer draws no web view): the scheme, the long poll, the theme, a resize, Cmd-W. Trigger: the next run of the built app.
- [x] **The Mac window's own line to change it, and 改回去**: built (D410 (6)).
- [ ] **Sharing an app** with someone: a link, their own data or a shared copy, viewer-pays and a first-use consent (research/166 §3). Trigger: Ducter Edge, or the first "发给她用一下".
- [ ] **Point to change**: tap part of the app and say what to change (every reference does it). Trigger: an edit the partner applied to the wrong part twice.
- [ ] **An app made by a coding task** (several files, a library, a build) when one file is not enough. Trigger: an app over ~60K characters, or one the partner can't fit.
- [x] **A routine that fills an app** (the review routine's PR board, research/166 §2): built as D407 (the review board from review_report; app_data for other routines).
- [ ] **Offline on the phone**: the last version and data kept in the shell, writes queued. Trigger: a person who opens an app with the home away.
- [x] **Delete** an app: from 你的小应用's 「⋯」 and by asking, with 撤销 (D410 (2)).
- [ ] **An app's card in chat apps** (Telegram, Slack, iMessage get the partner's words only, no card or link). Trigger: an app made from a chat app.
- [ ] **Human raters for 小应用 / App** and its line (LLM proxies only so far). Trigger: the next naming round with people.

## D410: 你的小应用 / Your apps (`apps.md`, research/169)

- [ ] **Human raters for 你的小应用 / Your apps** against 我的小应用 and 小应用 alone (research/169 §4 is haiku, n = 6). Trigger: the next naming round with people.
- [ ] **Bring back a deleted app after its toast or card is gone** (the home keeps it 30 days; no list yet). Trigger: a person who asks for one they deleted.
- [ ] **Ideas from the calendar and routines** on the empty shelf (only noted bookings now). Trigger: an empty shelf with a calendar connected and no booking noted.
- [ ] **Arrange the shelf by hand** (order, folders). Trigger: someone with more than a dozen apps.
- [ ] **The kit on the Mac's own fonts** (an app can't load Bricolage; it falls back to the system font). Trigger: a designer review of an app window.
- [ ] **Rename and delete inside the Mac's app window** (its 「⋯」 brings the main window's shelf forward to do them). Trigger: the author uses them from the app window.
- [ ] **A real phone** walk of the shelf and the app sheet (shots are headless Chrome at 390). Trigger: the next iOS Simulator pass.

## D413: 不用问我的 / Without asking (`core/src/standing.ts`)

- [ ] **More actions than PR reviews** (issue comments outside To-do sources' own standing go, replies in a chat app, a reply to one named person's mail). Trigger: the person says "don't ask me" about one of these (the partner already says Ducter can't keep it yet).
- [ ] **The settled round card's footnote** (**说好之前，什么都不会发到 GitHub。**) still shows under a card whose drafts went as said. Trigger: the next pass on the round card.
- [ ] **On hel:** check after the upgrade that the 11-19 saying was backfilled (`[standing] kept 1 …` in the log) and the next round posts with one line. Trigger: the first release carrying D413.

## Positioning (D414)

- [ ] **Apply the GitHub description and topics** in `design/positioning.md` (by hand, `gh repo edit`). Trigger: the author approves D414.
- [ ] **Re-rate the share image** with D414's longer line at thumbnail size (the 2026-11-18 five raters). Trigger: before the next launch post.
- [ ] **Human raters for D414's line and paragraph** (LLM proxies only so far). Trigger: the next round with people.
- [ ] **Name more agents in the paragraph** as they are verified end to end (`apps/site/src/lib/agents.ts`; none named before then). Trigger: an agent moved to `today`.
- **D415's words and the live run.** 分类, 移出, 清掉旧的再试, 只开始，不留言 read by humans; the comment-first reading (`commentFirst`) on notes no rule catches (a model in the find's one call could read it); the hand-over replayed on the author's MacBook with his real nowledge-mem (the lock fix is checked only with a git that fakes hel's lock). *Trigger:* the next human panel, or the author's next hand-over.
- [ ] **Name the kit's `k-select` in the partner's app tool** (D421): the description still offers only the chips for a choice; adding it needs a fresh partner eval (D175). Trigger: the small-apps branch next changes the tool.
- [ ] **Look at the clay menus on a real Mac and iPhone** (D421; headless shots only so far): a menu near the window's edge, VoiceOver on a drawn menu, a long-press menu in the iOS Simulator. Trigger: the next release's walk.

## D422: small apps to the bar (`apps.md`, research/174)

- [ ] **An empty app that answers first.** With nothing known, a new app still opens on a zero and a form (LLM raters 1–3 of 5). Give it something true: the month so far from Done for you's payments, a first sample the person confirms. Trigger: the next apps pass, or a person's empty app.
- [ ] **A generated clay mark.** Made once in the background after an app is kept, where Codex or Antigravity is signed in (the trial: 85 s, 19–44K tokens, a cut-out step), the drawn mark until it lands and when it fails; never blocks the make. Trigger: the author asks for it, or an image harness Ducter already runs.
- [ ] **Walk 4 and 5 end to end with a real partner** (change by talking with the strip; a routine given by words). Trigger: before the next release that touches apps.
- [ ] **People as raters** for first-open value and the marks (LLM proxies only). Trigger: the next naming round with people.
- [ ] **Known items into `data`, not the file.** `app-prs-known-en` drew the four PRs into the HTML both runs (they can't be ticked across devices or read by the partner); `app-renew-zh` left out `from`. Trigger: the next app-tool change (a lint: literal list items in the file with an empty `data`).
