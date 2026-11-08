# Flows G: Safety You Can See (放心)

> Draft 1 · 2026-11-09 · Status: **drafted, not reviewed**. Covers scenarios G1–G7
> (`product-model.md` §6 "G. Safety", widened). Builds on principle 18, D16 (no per-call
> approvals), D26 (push and PR defaults), D27 (draft copies), D47/D48 and `system.md`
> (env-gate, credentials, isolation), `research/25` (vault, per-site policy, audit),
> D52 Q6 (draft PR countdown on personal repos) and Q12 (quiet hours), D3 in
> `D-decisions-attention.md` (quiet hours for attention), B5 in `B-kinds-of-work.md` (sign-in
> by takeover), and `I-results.md` (the Sent out line).
>
> Tags: **[doc]** already stated in a design note or decision; **[I]** this draft's proposal,
> not yet decided; **[ext]** outside evidence not yet in `research/`. Nothing here is a Dn
> decision.

## 0. The safety model on one page

**What the user should feel.** Not "this AI is locked down", but "I can see exactly what it
can reach, it asks me before anything goes to other people or costs money, it tells me
honestly what can be taken back, and I can see everything it did today."

**Rule 1. No per-call approvals** [doc D16, principle 18]. Harnesses run with approvals off.
Safety comes from three layers, each visible:
1. **What a task holds:** its place (worktree, folder, sandbox, browser profile) and scoped
   credentials, never in model context [doc].
2. **What a task may touch:** 可以碰 / May touch, the same field routines already have
   (B9), shown on every task [I].
3. **What leaves:** outside effects pass the gate as intents, under the user's policy [doc].

Why not approvals [I, evidence thin]: prompts that interrupt every call train people to click
through. The best-known measurement is browser security warnings, which users clicked through
at high rates (Akhawe & Felt, USENIX Security 2013 [ext, from memory, not re-verified here]).
An approval asked fifty times a day carries no information by the fiftieth. A dedicated
research report on approval fatigue and undo-send is worth writing (proposed as the next free report number, `research/31`; 29 is now the VPS-logins report).

**Rule 2. Asks are rare and earned** [I]. Ducter asks before an effect only when it does at
least one of these:
- **reaches other people** (an email, a post, a PR comment, a link);
- **can't be taken back** (once sent, merged, paid);
- **spends money**;
- **goes beyond 可以碰 / May touch**.

Everything else runs, is recorded, and shows up in the result's Sent out line and in the day's
record. Silence still means success.

**Rule 3. The effect ladder (defaults)** [doc where tagged, else I]:

| Effect | Example (author's work) | Reaches people | Comes back? | Default |
|---|---|---|---|---|
| Commit in the task's worktree | HawDB `ducter/checkpoint-30s` | no | yes | Runs, not shown as outside [doc] |
| Push `ducter/*`, personal repo | `wey-gu/ducter` | no | yes (delete the branch) | Runs at checkpoints; recorded [doc D26] |
| Push `ducter/*`, org repo | `nowledge-co/mem` | org members can see it | yes | Ask once per repo, then runs [doc D26] |
| Push to any other branch; force-push | `main` | maybe | hard | Always ask, no countdown [I] |
| Open a draft PR, personal repo | `wey-gu/ducter` | barely | yes (close it) | Ask with a 30-min countdown, then opens [doc D52 Q6] |
| Open a draft PR, org repo | `nowledge-co/mem` | watchers | yes | Waits for Go [doc D52 Q6] |
| PR comment, mark ready, request review | HawDB #1601 | yes (notifications) | no | Ask, no countdown [I] |
| Merge | | yes | revert only | Never, unless a Rule allows it [doc] |
| Email or chat message to a person | load-test numbers to a HawDB contributor | yes | 30 s before it leaves, then no | Ask, no countdown; 30 s Undo after Go [I] |
| Social post | an X post about Ducter going open source | yes | 30 s, then delete only | Draft first; ask, no countdown; rate limits and a stop after 2 write errors [doc research/25] |
| Form submit in the browser | | maybe | usually no | Ask, with the filled form shown [doc system.md env-gate] |
| Payment | renewing a domain | — | no | **The user pays, by taking over the screen. Ducter never pays, and no Rule can change that** [doc system.md] |
| Sign in | Cloudflare dashboard | — | sign out | **Ducter never types a password**: takeover, or a vault fill with the agent paused [doc D48, B5] |
| Share link | the Bun research | anyone with it | turn off (not unread) | Ask; expires in 7 days (I5) [I] |
| Write outside a worktree on your device | `~/Notes/hawdb-bench/` | no | yes | Draft copy + one Go, unless the folder is trusted [doc D27] |
| Delete many files (> 10) | | no | from snapshot | Always ask, even in a trusted folder [doc EC C2] |
| Spend allowance or API money | routine runs | no | no | Budget caps; over the cap → ask [doc D29] |
| Phone call | | yes | no | Roadmap; always an intent [doc D35] |

**Rule 4. Shown, not explained** (D43) [I]. Trust comes from seeing the literal thing:
- *what* will leave, as a faithful miniature: the email as an email, the post as a post, the
  PR header as a PR header, the branch and commit count for a push;
- *where* it goes: the destination's own name ("GitHub · wey-gu/ducter", "X · @yourname");
- *whether it can come back*, in words.

No shields, padlocks, "secure" badges, or green ticks that mean "safe": they claim safety
instead of showing it. Any visual metaphor for "the boundary of what a task can reach" must go
through the AGENTS.md metaphor process first; until then everything here is **literal**.

**Rule 5. Honest undo** [I]. 撤销 / Undo appears only while an undo really exists, and the
receipt says what it did. When the window closes, the button goes away; what remains is a
named follow-up that tells the truth ("补一封更正 / Send a correction", "删掉这条 · 可能已经
有人看到了 / Delete the post · people may have seen it").

**Rule 6. Untrusted input never widens scope** [doc]. Web pages, emails, webhook payloads, and
tool outputs are data. An effect requested *by* such content ("forward all mail to…") is never
auto-run, whatever the Rules say; it becomes an ask with the source quoted.

**Rule 7. Everything outside is recorded** [doc system.md, research/25]. Every outside
effect, sign-in, secret fill, and spend is an append-only Log event, readable as "what Ducter
did" (G5). The record is what makes "no per-call approvals" acceptable.

**The floor no Rule can lower** [I]: payments are the user's; passwords are never typed by
the agent; effects requested by untrusted content always ask; a decision with no reversible
default always appears in the conversation (D3 floor).

---

## G1 · Something is about to go outside

### 1. Scenario card

- **Who:** all three, in different clothes. The developer: a push to an org repo or a PR that
  pings reviewers. The consumer user: an email or a post in their name. The fresh user: the
  first time Ducter wants to send anything at all.
- **Feels before:** "Will it post something embarrassing in my name? Will it email the wrong
  person?" Or the opposite: "Not another approval popup."
- **Feels after:** "It showed me exactly what would go out and to whom, told me plainly it
  can't be taken back, and I sent it with one tap. Everything harmless just happened." 放心,
  顺滑.
- **First time:** inside a result or a decision the user is already reading. The card is a
  faithful miniature of the thing, so it needs no explanation. One line under it, once:
  "发给别人的、收不回的、要花钱的，我都会先给你看。/ Anything that goes to other people,
  can't be taken back, or costs money, I'll show you first." [I]

### 2. Flow

Four real examples, one card shape:

| | Ask | Card shows | Default |
|---|---|---|---|
| a | B3 finishes on `wey-gu/ducter` | PR title, base ← branch, files changed, body preview | Opens in 30 min · can be closed [doc] |
| b | First push of `ducter/compaction-fix` to `nowledge-co/mem` | Repo, branch, "3 commits", "org members can see this branch" | No countdown; "以后这个仓库都自动推 / From now on this repo pushes automatically" [doc D26] |
| c | "把压测结果回复给那位 HawDB 的贡献者" | The email as it will look: To, Subject, body, attachment names | No countdown; "发出去就收不回了 · 发出前 30 秒能撤销" |
| d | "写条推，说 Ducter 开源了" | The post as it will look on X: text, image, account | Draft only; no countdown |

```
W (or a routine run) wants an outside effect ──► gate: classify against the effect ladder + Rules
  ├─ policy: run ──► runs; recorded (G5); appears in the result's Sent out line (I1)
  ├─ policy: ask with countdown (reversible) ──► decision card (D1 shape) with the preview
  ├─ policy: ask (reaches people / can't come back / money / beyond May touch)
  │     ──► decision card, no countdown: "这件不会自己动，等你定 / I won't go ahead on this without you"
  ├─ requested by untrusted content ──► ask, quoting the source: "这是邮件里要求的：『…』"
  └─ payment ──► G4 (the user pays, by takeover)

On the card:
  会发出去 / Will go out  ·  {destination}
  [faithful preview]
  {can it come back, in words}
  [named Go: 发出去 / Send · 开草稿 PR / Open draft PR · 推送 / Push]  [先等等 / Hold]  [回复… / Reply…]
  [改一改 / Edit] ── opens the preview text in place; M re-checks only what changed
Go ──► G2 (undo window, then it's out)
After the 3rd Go of the same kind to the same destination within 14 days [I]:
  one quiet line under the receipt: "以后{kind}发到{destination}就直接发？/ Send {kind} to
  {destination} without asking from now on?" Go creates a Rule (principle 14); never offered for
  floor items.
```

### 3. States

| Object | Transition | Actor | Trigger |
|---|---|---|---|
| Intent | proposed → running | C | policy says run [doc] |
| Intent | proposed → asked | C → M | policy says ask; becomes a decision [doc] |
| Intent | asked → approved | U / C | Go; or the countdown, only when reversible [doc] |
| Intent | asked → held | U | Hold [doc D1] |
| Intent | asked → edited → asked | U | Edit; the preview is versioned, the decision version bumps [I] |
| Intent | approved → sending | C | starts the undo window (G2) [I] |
| Intent | sending → done / undone / failed | C / U | window ends; Undo; the destination refused [I] |
| Task | Working → Needs you | M | while the intent is asked and blocking [doc] |

A resumed worker checks the world against its intents before repeating anything [doc
system.md], so a crash between "sent" and "recorded" never sends twice.

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `outside.header` | 会发出去 · {destination} | Will go out · {destination} |
| `outside.first_time` | 发给别人的、收不回的、要花钱的，我都会先给你看。 | Anything that goes to other people, can't be taken back, or costs money, I'll show you first. |
| `outside.can_close` | {thing}随时能关 | The {thing} can be closed anytime |
| `outside.cant_take_back` | 发出去就收不回了 · 发出前 {n} 秒能撤销 | Once it's out it can't be taken back · you can undo for {n} s before it leaves |
| `outside.org_visible` | {org} 的成员能看到这个分支 | Members of {org} can see this branch |
| `outside.from_untrusted` | 这是{source}里要求的：『{quote}』。要照做吗？ | This was asked for in {source}: "{quote}". Do it? |
| `outside.go.send` | 发出去 | Send |
| `outside.go.push` | 推送 | Push |
| `outside.go.post` | 发布 | Post |
| `outside.edit` | 改一改 | Edit |
| `outside.learn_rule.q` | 以后{kind}发到{destination}就直接发？ | Send {kind} to {destination} without asking from now on? |
| `outside.draft_only` | 先写成草稿，你说发再发 | Drafted only; it goes out when you say so |

Reused: `decision.*`, `decision.no_default_line`, `intent.pr_draft.*`, `intent.push.q`
(B3), `pr.never_merge` (C5).

### 5. Motion

- The preview card is drawn as the real thing in miniature (an email's header rows, a post's
  avatar and text). It enters with the decision card's usual fade-up; nothing about it is
  playful.
- **Edit:** the preview's text becomes editable in place (no modal); the Go button dims until
  M has re-checked the change (≤ 1 s), then brightens.
- **Go:** press-and-settle on the button; the card then hands over to G2's sending row.
- **Reduced motion:** cross-fades only.

### 6. Edge cases

- **Two effects in one step** (B4: two draft PRs in dependency order): one card, both
  previews, one Go named with the count [doc B4].
- **The preview would show a secret** (an `.env` value in a diff body or an email): the gate
  redacts it in the preview *and* blocks the send until it is removed from the payload [I].
- **The destination changed after the ask** (the PR base moved; the email thread got a new
  reply): the card re-renders with "有变化 / Changed since you saw it" and the countdown, if
  any, restarts [I].
- **The user says "直接发" in the conversation without opening the card:** M echoes which
  intent it applies, in one line, before it goes (as D2's typed "好").
- **An org repo with branch protection** that blocks even pushes of `ducter/*`: the card
  says so and proposes pushing to the user's fork [doc C5].
- **A routine's effect** outside its 可以碰: always an ask, even if the same effect would run
  in a normal task [doc B9].

### 7. v1 tonight vs later

- **Tonight:** none of the gate exists yet; the runner does not push. The client must not
  claim more than it knows: decision cards say "能撤销 / can be undone" only when the
  decision is reversible, and show no countdown otherwise (desktop change 1 in the report).
- **Next:** the `intent` Log event and gate in the runner for `git push` and `gh pr create`
  (the developer's two common effects); the push and draft-PR cards with previews.
- **Later:** email, posts, forms via the env-gate; Edit; the learned-rule offer.

---

## G2 · Undo windows, and what's honest after

### 1. Scenario card

- **Who:** everyone who has ever hit Send and immediately seen the typo.
- **Feels before:** "If I tap the wrong thing, it's gone."
- **Feels after:** "I had a moment to take it back, and when that moment passed, it told me
  the truth about what I could still do." 放心.
- **First time:** the first Go on an outside effect. The sending row shows the ring and the
  word Undo; nothing else to learn.

### 2. Flow

Prior art: Gmail holds a sent email for 5–30 s with "Undo" ([ext], Gmail settings); Apple
Mail has a similar delay. Ducter applies the same idea to every effect that can be held [I]:

| Effect | Undo window | After the window |
|---|---|---|
| Email / chat message | 30 s held before it leaves | No undo. Follow-up: 补一封更正 / Send a correction (a new G1 card) |
| Social post | 30 s held before it posts | 删掉这条 / Delete the post, with "可能已经有人看到了 / people may have seen it" |
| Push `ducter/*` | none needed | 撤销 removes the branch from the remote (it's Ducter's own branch) |
| Draft PR | none needed | 关掉 PR / Close the PR |
| Draft copy applied (D27) | 7 days [doc EC C2] | Then gone |
| Share link | none | 关掉链接 / Turn off the link (I5) |
| Form submit, payment | none: the ask happens before | — |

```
Go ──► sending row replaces the card:
       "{n} 秒后发出 · 撤销 / Sending in {n} s · Undo", with a ring around Undo
  ├─ Undo within the window ──► intent → undone; the card returns as it was, with Edit open;
  │                             receipt "没发，还在这儿 / Not sent; it's right here"
  └─ window ends ──► sends ──► row settles: "发出去了 · 14:02 / Sent · 14:02" + destination link
        ├─ the destination accepted ──► recorded (G5); Sent out line updated (I1)
        └─ the destination refused (bounce, rate limit, 403) ──► "没发出去：{reason} / Didn't
              go out: {reason}" with 再试一次 / Try again; no automatic retry [doc D5, research/25]
```

The window runs on the control plane, not the client: closing the app does not cancel a Go,
and an Undo tapped offline counts only if it reaches C before the window ends [I]. If it
arrives late, the row says what happened, never "too late".

### 3. States

As G1's intent: `approved → sending → done | undone | failed`. The window length is stored on
the intent so every device shows the same remaining time [I].

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `outside.sending` | {n} 秒后发出 | Sending in {n} s |
| `outside.undo` | 撤销 | Undo |
| `outside.undone` | 没发，还在这儿 | Not sent; it's right here |
| `outside.sent` | 发出去了 · {time} | Sent · {time} |
| `outside.pushed` | 推上去了 · {branch} · {time} | Pushed · {branch} · {time} |
| `outside.failed` | 没发出去：{reason} | Didn't go out: {reason} |
| `outside.correction` | 补一封更正 | Send a correction |
| `outside.delete_post` | 删掉这条 | Delete the post |
| `outside.delete_post.note` | 可能已经有人看到了 | People may have seen it |
| `outside.close_pr` | 关掉 PR | Close the PR |
| `outside.undo_late` | 你点撤销的时候已经发出去了。要补一封更正吗？ | It had already gone out when your Undo arrived. Send a correction? |

### 5. Motion

- **Sending row:** a thin ring around Undo drains once over the window (continuous, not
  ticking). The preview shrinks to a one-line row and slides a few pixels toward the
  destination's name (180 ms), so "it is leaving" reads without a metaphor icon. Whether this
  slide counts as a metaphor that needs the AGENTS.md process is open question GQ11.
- **Undo:** the row springs back into the full card (bouncy, 320 ms).
- **Sent:** the ring completes, the row settles (press-and-settle without the press), the
  destination name becomes a link. No confetti, no sound.
- **Reduced motion:** a static "{n} s" countdown in text, updated per second; cross-fades.

### 6. Edge cases

- **Two devices:** the ring and Undo show on both; the first Undo to reach C wins.
- **Quiet hours** start during the window: the send still goes; it was the user's Go (G6).
- **The app crashes during the window:** C holds the window; on relaunch the row shows the
  outcome.
- **A routine sends every Monday:** each send gets the same window, and the routine card's
  "May touch" line names the destination.

### 7. v1 tonight vs later

- **Tonight:** none (no outside effects tonight beyond what a harness does on its own; see G5).
- **Next:** windows for push and draft PR (trivially reversible, so the window is a receipt
  with Undo).
- **Later:** held sends for email and posts through the env-gate.

---

## G3 · A credential request

### 1. Scenario card

- **Who:** the developer (a Cloudflare API token so a task can `wrangler deploy` the Ducter
  Edge; a GitHub sign-in on a new Linux box); the consumer user (a site the browser profile
  has never seen).
- **Feels before:** "Do I paste my token into the chat? Where does it go? Who else can use
  it?"
- **Feels after:** "I put it somewhere the AI never sees, I can see exactly where it lives and
  which tasks use it, and I can take it away with one tap." 放心.
- **First time:** the first task that needs something it doesn't hold. It arrives as a
  Needs-you item with a plain ask, never as a settings screen.

### 2. Flow

```
W hits a missing credential (auth error, a site login wall, a CLI asking to log in)
  ──► report needs_input (typed: credential_needed {service, why, smallest_scope})
  ──► M looks for a narrower path first [I]:
        - the device's own login (git via the device's credential helper, D26)
        - an existing sign-in in the browser profile (B5)
        - a vault item that matches (1Password / Bitwarden / local, research/25)
      ├─ found ──► uses it; one line in the record (G5); the user sees nothing now
      └─ not found ──► Needs you:
           "要部署 ducter-cp，得用你的 Cloudflare 账号。给它一个只能部署这个 Worker 的 token？"
           [放进去 / Add it]  [接手登录 / Take over to sign in] (sites only)  [先等等]  [回复…]
           + a link: "怎么建一个只够用的 token / How to make a token with just enough access"
Add it ──► a secure sheet, not the conversation: one masked field + where it will live:
           "存在 Linux 盒子上 · {persona} 的 · 给部署用 / Kept on the Linux box · {persona}'s ·
           for deploys" ──► stored in the vault (credd) [doc system.md]; never in model env,
           args, files, or the Log; the gate injects it at use
Take over to sign in ──► B5 flow (Screen, the agent paused, 2FA on the phone)
After ──► the task resumes; the item becomes a row on the "{name} 能用的账号 / Accounts
          {name} can use" page: service, scope, device, last used, by which task,
          [不让用了 / Stop using it]
```

**Secret pasted into the conversation** [I]. The Log is append-only and is distilled into
memory; a secret that enters it is effectively permanent. So the client checks the draft
before sending: text that looks like a key (`ghp_…`, `sk-…`, `AKIA…`, `xox…-`, a PEM block,
a long high-entropy token) is held, not sent, with "这像是密钥。别发在对话里，我不需要看到它。
/ This looks like a key. Don't send it in the conversation; I never need to see it." and two
buttons: 放进去 / Add it (opens the secure sheet with it pre-filled) and 仍然发送 / Send
anyway.
If a secret reaches the Log anyway (another client, a task echoing one): C redacts it with a
superseding redaction event and deletes the blob; the partner says so and recommends
rotating it: "已经从记录里去掉了，但它到过一次 AI，建议换一个新的。/ I removed it from the
record, but it reached the AI once. I'd replace it with a new one." This is a narrow
exception to "never delete" and needs a decision (GQ6).

### 3. States

| Object | Transition | Actor | Trigger |
|---|---|---|---|
| Task | Working → Needs you | M | credential needed and no narrower path [I] |
| Credential | (none) → stored | U | Add it, or a takeover sign-in that the probe confirms [doc research/25] |
| Credential | stored → used | C (gate) | each injection, recorded [doc] |
| Credential | stored → removed | U | Stop using it; sessions signed out where the site allows [doc research/25] |
| Credential | stored → needs sign-in again | C | probe finds it expired [doc] |
| Draft message | composing → held | client | secret-shaped text [I] |

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `cred.need.q` | 要{why}，得用你的 {service} 账号。给它一个只够用的{kind}？ | To {why}, it needs your {service} account. Give it a {kind} with just enough access? |
| `cred.add` | 放进去 | Add it |
| `cred.how_scope` | 怎么建一个只够用的{kind} | How to make a {kind} with just enough access |
| `cred.sheet.where` | 存在 {device} 上 · {persona} 的 · 给{use}用 | Kept on {device} · {persona}'s · for {use} |
| `cred.sheet.never_seen` | AI 看不到它，只有用的那一刻会填进去 | The AI never sees it; it's filled in only at the moment of use |
| `cred.accounts.title` | {name} 能用的账号 | Accounts {name} can use |
| `cred.accounts.row` | {service} · {scope} · {device} · 上次用：{when}（{task}） | {service} · {scope} · {device} · last used {when} ({task}) |
| `cred.stop` | 不让用了 | Stop using it |
| `cred.stopped` | {service} 不让用了。已经在那边退出登录。 | {name} can't use {service} anymore. Signed out there too. |
| `cred.expired` | {service} 要重新登录了 | {service} needs signing in again |
| `secret.held` | 这像是密钥。别发在对话里，我不需要看到它。 | This looks like a key. Don't send it in the conversation; I never need to see it. |
| `secret.add_instead` | 放进去 | Add it |
| `secret.send_anyway` | 仍然发送 | Send anyway |
| `secret.redacted` | 已经从记录里去掉了，但它到过一次 AI，建议换一个新的。 | I removed it from the record, but it reached the AI once. I'd replace it with a new one. |

Reused: `login.*`, `screen.*` (B5).

### 5. Motion

- **Secure sheet:** slides up from the composer's position (it is "instead of sending"), with
  a solid surface and no transcript visible behind it, so it reads as a different room.
- **Stored:** the sheet folds into a small row that drops into the "Accounts" entry on the
  device's card (where it lives, shown literally: D43), 300 ms.
- **Held secret:** the composer's text blurs to dots (not deleted) and the warning line grows
  above it (220 ms). Send anyway restores it.

### 6. Edge cases

- **The smallest scope isn't available** (a service with only full-access keys): the card
  says so: "{service} 只有全权限的 key / {service} only offers full-access keys", and the
  Accounts row is marked full access.
- **A task on device A needs a credential stored on device B:** never copied silently;
  "要把它也放到 {device} 上吗？/ Also keep it on {device}?" default Hold [I].
- **The secret detector is wrong** (a git SHA, a UUID): Send anyway costs one tap; the
  patterns favor recall for known prefixes and require high entropy plus length otherwise.
- **Two personas:** credentials are per persona per device [doc research/25]; a second
  persona never inherits the first's.
- **The user revokes a credential mid-task:** the gate refuses the next use; the task goes to
  Needs you with "{service} 被你停用了 / You stopped {service}".

### 7. v1 tonight vs later

- **Tonight:** the composer's secret hold (desktop change 2 in the report). Harnesses use
  the device's own logins (Claude Code, Codex, git) as today.
- **Next:** typed `credential_needed`, the secure sheet with a local vault, the Accounts page.
- **Later:** 1Password / Bitwarden sources, Log redaction (after GQ6), per-site sign-out.

---

## G4 · The browser never signs in, pays, or submits on its own

### 1. Scenario card

- **Who:** the consumer user (Muse habits: "renew it for me", "post this"); the developer
  running a social account for a project, the D48 case.
- **Feels before:** "It has my logged-in browser. What stops it from buying something or
  posting nonsense?"
- **Feels after:** "It did all the tedious clicking, stopped at exactly the right moment, and
  I paid myself in ten seconds." 放心, 惊喜 (it stopped at the right step without being told).
- **First time:** the first browser task that reaches a pay or submit button.

### 2. Flow

Example: "把 ducter.dev 这个域名续一年" (the Ducter Edge custom domain, D46).

```
browser task works (B5 shape) ──► reaches a step the env-gate classifies [doc system.md]:
  ├─ sign-in ──► B5 (takeover or vault fill with the agent paused); never typed by the agent
  ├─ submit (a form that sends data) ──► G1 card with the filled form as the preview:
  │       field: value rows; sensitive fields masked; "提交后通常改不了 / Usually can't be
  │       changed after submitting"; Go "提交 / Submit"
  ├─ post / publish ──► draft first [doc research/25]: G1 card with the post's preview; Go
  │       "发布 / Post"; per-site rate limit with jitter; a stop after 2 consecutive write
  │       errors ("{site} 连着两次没发成，我先停下 / {site} refused twice in a row, so I
  │       stopped")
  └─ pay ──► Needs you, no default, no countdown:
          "到付款这步了：ducter.dev 续费一年，$12.18。付款要你自己来。/ This is the payment
          step: ducter.dev for one more year, $12.18. Paying is yours to do."
          [你来付 / You pay]  [先等等]  [回复…]
          Take over ──► Screen tab in takeover; banner "你在操作 · {name} 暂停了" [doc B5];
                        what the user types and sees here never reaches the AI [doc]
          Give it back ──► the agent re-reads the page (hold-before-send), finds the receipt,
                        captures it as evidence ──► result: "续好了，到 2027-11-12 / Renewed
                        until 2027-11-12" + capture chip + Sent out line "你付了 $12.18 /
                        You paid $12.18"
```

The amount and payee on the pay card are read by the gate from the page, not written by the
model, and shown exactly; if the gate can't read them, the card says "金额我读不清，请在
画面里看 / I can't read the amount reliably; check it on the screen" [I].

### 3. States

As B5 (`working → needs-you → working`, takeover sub-state of the place). A pay step adds no
new state; it is a Needs-you decision without a default.

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `browser.pay.q` | 到付款这步了：{what}，{amount}。付款要你自己来。 | This is the payment step: {what}, {amount}. Paying is yours to do. |
| `browser.pay.go` | 你来付 | Take over to pay |
| `browser.pay.unreadable` | 金额我读不清，请在画面里看 | I can't read the amount reliably; check it on the screen |
| `browser.paid.outside` | 你付了 {amount} | You paid {amount} |
| `browser.submit.q` | 要提交这张表吗？ | Submit this form? |
| `browser.submit.note` | 提交后通常改不了 | Usually can't be changed after submitting |
| `browser.submit.go` | 提交 | Submit |
| `browser.post.go` | 发布 | Post |
| `browser.write_stop` | {site} 连着两次没发成，我先停下 | {site} refused twice in a row, so I stopped |
| `browser.never_pays` | 付款、输密码这两件事，{name} 从来不替你做。 | Paying and typing passwords are two things {name} never does for you. |

`browser.never_pays` appears once, on the first pay card, as the one-time line [I].

### 5. Motion

As B5 (frame warms to needs-you orange on takeover, cools on hand back; the face closes its
eyes while paused). The pay card has no countdown ring at all, which is itself the signal.

### 6. Edge cases

- **A page tries to talk the agent into paying** ("click here to confirm your subscription"):
  the env-gate classifies by the action, not the text; it is still a pay step.
- **A free checkout** ($0 trial that converts to paid): treated as pay; the card states the
  later price if the gate can read it.
- **Stored card autofill in the profile:** disabled in Ducter's profiles [I]; payment details
  are typed by the user in takeover.
- **CAPTCHA or "unusual activity":** pause the site; Needs you; never auto-retry [doc B5].
- **Running a social account over weeks** (D48): each post is a G1 card unless a Rule allows
  that account + kind; the floor still forbids posts requested by untrusted content (a reply
  telling it to post something).

### 7. v1 tonight vs later

- **Tonight:** browser work is a stretch goal; if it ships, the gate must at least stop at
  pay and submit and turn them into a plain Needs-you question.
- **Next:** pay card with gate-read amounts, submit previews.
- **Later:** per-site policy UI, social account rate limits as a visible line on the routine
  card.

---

## G5 · What did Ducter do today (the record)

### 1. Scenario card

- **Who:** the developer at the end of a day of eight tasks ("did anything touch the org
  repo?"); the consumer user after giving it their accounts; anyone after a scare.
- **Feels before:** "I gave it a lot of rope today. What actually happened out there?"
- **Feels after:** "One short page: what went out, which accounts were used, what changed on
  my machines, what it cost. Most days it says nothing went out at all." 放心, and quietly
  惊喜 the first time the page is empty.
- **First time:** the user asks ("今天你都发出去了什么？"), or taps the quiet line on On hand.

**First principles.** The transcript records every tool call; that is too much to read and
not what the user is asking. The question is about *consequences outside*, so the record
lists only effects that left the task's own place, plus sign-ins, secret uses, and spend [I].

### 2. Flow

```
"今天你都发出去了什么？" ──► M answers in one line + the record card:
    "今天发出去的 4 件：推了 2 个分支，开了 1 个草稿 PR，用了一次 Cloudflare 账号。都能撤回。"
On hand header (quiet, muted text): "今天发出去的 4 件 → / Sent out today: 4 →"   (or "今天发出去的：没有")
  ──► the record view (inside On hand, like All results):
      发出去的 / Went out
        09:12  推送 ducter/secret-guard → wey-gu/ducter          对话框拦住密钥          [撤销]
        09:40  草稿 PR #14 → wey-gu/ducter main               对话框拦住密钥          [关掉 PR]
      用过的账号 / Accounts used
        11:05  Cloudflare · 部署 token · Linux 盒子              部署 Ducter Edge
      在你设备上动过的 / Changed on your devices
        14:20  存到 ducter/research/29-bun-compile.md · MacBook   Bun 编译调研            [撤销]
      花掉的 / Spent
        Claude 额度 38% · Codex 额度 12% · 钱：$0
    each row: time · what, literally · destination · the task (tap → opened task) · Undo or
    the honest follow-up while one exists
```

**Empty day** [I]: "今天什么都没发出去。/ Nothing was sent out today." with the day's
task count beneath ("做完了 6 件，都在你的设备上 / 6 tasks finished, all on your devices").
The empty state is designed as carefully as the full one.

**Other days:** a day switcher (yesterday, a date). Weeks later the same question works in
the conversation ("上周四推过 mem 吗？").

**Honesty about coverage** [I]. The record lists what passed Ducter's gate. A harness running
with approvals off on the user's Mac could still run, say, `git push` itself. Until the gate
covers it, the record also lists outside-looking commands seen in transcripts, in their own
group, labelled "它的记录里看到的 / Seen in its log", and the view says so once: "这里
是经过 {name} 的；在你 Mac 上直接跑的命令，我从对话记录里尽量找出来了。/ This lists what
went through {name}; for commands run directly on your Mac, I've picked out what I could from
the transcripts."

### 3. States

No new states. The record is a read view over Log events: `intent` (done/undone/failed),
`credential_used`, `saved_to_place`, `share_link`, spend from usage events, and (until the
gate is complete) `seen_command` derived from tool calls [I].

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `record.ask_answer` | 今天发出去的 {n} 件：{summary}。{undo_note} | Sent out today: {n}. {summary}. {undo_note} |
| `record.all_undoable` | 都能撤回。 | All of it can be undone. |
| `record.entry` | 今天发出去的 {n} 件 → | Sent out today: {n} → |
| `record.entry_none` | 今天发出去的：没有 | Sent out today: nothing |
| `record.title` | {name} 今天发出去的做了什么 | What {name} did outside today |
| `record.group.went_out` | 发出去的 | Went out |
| `record.group.accounts` | 用过的账号 | Accounts used |
| `record.group.devices` | 在你设备上动过的 | Changed on your devices |
| `record.group.spent` | 花掉的 | Spent |
| `record.group.seen` | 它的记录里看到的 | Seen in its log |
| `record.empty` | 今天什么都没发出去。 | Nothing was sent out today. |
| `record.empty_sub` | 做完了 {n} 件，都在你的设备上 | {n} tasks finished, all on your devices |
| `record.coverage_note` | 这里是经过 {name} 的；在你 Mac 上直接跑的命令，我从对话记录里尽量找出来了。 | This lists what went through {name}; for commands run directly on your Mac, I've picked out what I could from the transcripts. |
| `record.day.yesterday` | 昨天 | Yesterday |
| `record.money` | 钱：{amount} | Money: {amount} |

Allowance figures reuse 额度 / Allowance [doc glossary].

### 5. Motion

- Entry line on On hand: static, muted; the count changes with a cross-fade, never a badge
  (the record never asks for attention).
- Opening the record: the line widens into the view (FLIP, 320 ms), like All results.
- Undo in the record: the row strikes through softly and a receipt line slides in under it.

### 6. Edge cases

- **Something went out that the user didn't expect:** each row links to the task and the
  exact moment in its transcript, so "why did it do that?" is one tap. If the effect came from
  untrusted content, the row says so.
- **Multiple personas:** one record per person, with persona faces on rows (attention and
  accountability aggregate per person [doc]).
- **A routine:** its effects show under its name; a routine with nothing outside today is not
  listed.
- **Export:** "存成文件 / Save as file" (CSV/Markdown) for the user's own audits [I, later].
- **Retention:** forever, like the Log.

### 7. v1 tonight vs later

- **Tonight:** per task, an "发出去的 / Sent out" card in the opened task's dossier, listing
  outside-looking commands found in its transcript (`git push`, `gh pr …`, `npm publish`,
  `curl -X POST`, `ssh`, `wrangler deploy` …), labelled "它的记录里看到的", with "还没有
  发出去任何东西 / Nothing sent out yet" when there are none (desktop change 3).
- **Next:** intents from the gate; the On hand entry line and the day view.
- **Later:** accounts used, spend, day switcher, export.

---

## G6 · Quiet hours and outside effects

### 1. Scenario card

- **Who:** the developer who leaves tasks running overnight; the consumer user whose partner
  manages their accounts.
- **Feels before:** "If it finishes at 3 a.m., will it email people in my name at 3 a.m.?"
- **Feels after:** "Work kept going, but nothing went to other people while I slept; it was
  all waiting for me with one tap in the morning." 放心.
- **First time:** the first night with a pending people-facing effect. Nothing to set up:
  quiet hours already exist (D3), and this rule rides on them.

D3 covers notifications during quiet hours. This scenario covers *effects*.

### 2. Flow [I]

| During quiet hours | Behaviour |
|---|---|
| Reversible, in-scope effects (push `ducter/*`, a draft PR whose countdown ends) | Run on time [doc D3: reversible defaults fire] |
| People-facing effects that would go out **by default or from a routine** (email, post, PR comment, mark ready, request review) | Wait until quiet hours end + 30 min, shown as "免打扰里发给别人的，我留到 {time} / Anything going to other people during quiet hours waits until {time}" |
| People-facing effects the user Go'd **in the moment** | Go now. It was their call |
| Effects with no default (irreversible) | Already wait for the user [doc D1] |

Why [I]: a reversible push at 3 a.m. harms no one, but an email or post at 3 a.m. is seen by
other people as *the user* acting at 3 a.m., and the user can't use an undo window while
asleep. A Rule can lift it ("周报定时 7 点发，免打扰也发 / send the weekly report at 7 even
in quiet hours").

```
routine "每周一 08:30 把周报发给团队" fires at 08:30; quiet hours end 09:00
  ──► the draft is ready; the send waits ──► On hand forecast: a tick at 09:30 on the quiet band
  ──► 09:30 the G1 card (or the routine's Rule-allowed send with its G2 window) goes ahead
```

### 3. States

Intent `approved → waiting(quiet)` → `sending` at quiet end [I]. Shown as a waiting reason,
not a new state (as with pause, D52 Q3).

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `quiet.outside_wait` | 免打扰里发给别人的，我留到 {time} | Anything going to other people during quiet hours waits until {time} |
| `quiet.outside_reason` | 在等 · 免打扰过了再发 | Waiting · sends after quiet hours |
| `quiet.outside_rule` | 规则：{rule} | Rule: {rule} |

### 5. Motion

On the forecast band (D3 `DQuietForecast`), held people-facing sends are small pebbles
labelled with the destination's name, stacked at the band's right edge with the held
notifications; at quiet end they slide to "now" with them.

### 6. Edge cases

- **Travel:** quiet hours follow the user's local time [doc D3].
- **A deadline the user set** ("周一 8 点前一定要发出去"): the deadline wins; the card says
  it will go inside quiet hours because the user said so.
- **The recipient's time zone:** not considered in v1 [I]; a later Rule could hold sends
  until the recipient's morning.

### 7. v1 tonight vs later

- **Tonight:** none (no people-facing effects tonight).
- **Next / Later:** with the gate and routines.

---

## G7 · Honest about where a task can reach

### 1. Scenario card

- **Who:** the developer, who knows exactly what "approvals off on my Mac" means and wants it
  said plainly; the fresh user, who should never be told "secure" when it isn't.
- **Feels before:** either blind trust or vague worry.
- **Feels after:** "It told me the truth once, in plain words, and showed me the stricter
  option. I chose." 放心.
- **First time:** the first task that runs directly on the user's Mac (not in a sandbox),
  as one line under that task's chip, once per device [I].

### 2. Flow

Every task shows 可以碰 / May touch in its dossier, literally [I]:

| Where it works | May touch (zh / en) |
|---|---|
| Worktree on your device | 这个分支上的改动 · 你在这台 {device} 上能碰的文件也能碰到 / Changes on this branch · it can also reach any file you can on {device} |
| A sandbox (gVisor Linux, Lume VM) | 碰不到你的文件 / Can't touch your files |
| A non-git folder, draft copy | 草稿副本；原文件要你说好才改 / A draft copy; originals change only when you say Go |
| A trusted folder | 这个文件夹，直接改 / This folder, directly |
| The browser profile | 这个浏览器里登录过的网站 / Sites signed in to in this browser |
| Your real Chrome (v1.x opt-in) | 你的真 Chrome，不隔开 / Your real Chrome, no separation (red chip) [doc system.md] |

First task directly on the Mac, once, under the chip [I]:
"提醒一句：在这台 Mac 上做事时，它能碰到你能碰的文件。要更严的，可以让它碰不到你的文件。/
Heads-up: working on this Mac, it can reach any file you can. For stricter limits, have it
keep it away from your files." with [以后都别碰我的文件 / Keep it off my files from now on] (becomes a Rule) and
[知道了 / Got it].

### 3. States

None. `Place.isolation` is a typed field already proposed in `system.md` hooks [doc].

### 4. Copy

| i18n key | zh | en |
|---|---|---|
| `reach.title` | 可以碰 | May touch |
| `reach.worktree` | 这个分支上的改动 · 你在这台 {device} 上能碰的文件也能碰到 | Changes on this branch · it can also reach any file you can on {device} |
| `reach.sandbox` | 碰不到你的文件 | Can't touch your files |
| `reach.draft_copy` | 草稿副本；原文件要你说好才改 | A draft copy; originals change only when you say Go |
| `reach.trusted` | 这个文件夹，直接改 | This folder, directly |
| `reach.browser` | 这个浏览器里登录过的网站 | Sites signed in to in this browser |
| `reach.real_chrome` | 你的真 Chrome，不隔开 | Your real Chrome, no separation |
| `reach.first_mac` | 提醒一句：在这台 Mac 上做事时，它能碰到你能碰的文件。要更严的，可以让它碰不到你的文件。 | Heads-up: working on this Mac, it can reach any file you can. For stricter limits, have it work in a sandbox. |
| `reach.use_sandbox` | 以后都别碰我的文件 | Keep it off my files from now on |
| `reach.got_it` | 知道了 | Got it |

### 5. Motion

None beyond the line fading in once. Isolation is a fact, not an event.

### 6. Edge cases

- **No sandbox available on this device** (no gVisor, Lume not installed): the button reads
  "在 {other device} 上做，碰不到你的文件 / Do it on {other device}, away from your files", or is hidden with no
  apology if none exists.
- **Multi-repo task:** May touch lists each writable repo.
- **The consumer user who has never heard the word sandbox:** the line carries its own
  meaning ("can't reach your files"); the word itself is open question GQ8.

### 7. v1 tonight vs later

- **Tonight:** the opened task's Where card can state the worktree line literally
  (`reach.worktree`), since every v1 task runs in a worktree on the Mac.
- **Next:** the once-per-device line and its Rule.
- **Later:** sandbox places, the real-Chrome red chip.

---

## Proposed glossary additions (not in the glossary; need the change loop)

| Concept (internal) | zh / en | Used in | Note |
|---|---|---|---|
| outside effects | 发出去的 / Sent out | G1–G6, I1 | One word for "left your devices"; alternatives 外面 / 出去的 are weaker |
| intent card header | 会发出去 / Will go out | G1 | The glossary already shows intents as "要推送到… / Will push to…"; this is the generic header |
| edit an outgoing preview | 改一改 / Edit | G1 | |
| send / push / post / submit (named Go) | 发出去 / Send · 推送 / Push · 发布 / Post · 提交 / Submit | G1, G4 | Named Go labels [doc D1 allows naming] |
| can't take back | 收不回 / Can't be taken back | G1, G2 | Literal; used only where true |
| correction / delete post / close PR | 补一封更正 / Send a correction · 删掉这条 / Delete the post · 关掉 PR / Close the PR | G2 | Honest follow-ups after an undo window |
| credential (account access) | 账号 / Account; heading 能用的账号 / Accounts {name} can use | G3 | Avoids 凭据/credential |
| secret (key, token) | 密钥 / Key | G3 | |
| add a credential | 放进去 / Add it | G3 | |
| revoke | 不让用了 / Stop using it | G3 | Not 撤销: revoking is not undoing |
| take over to pay | 你来付 / You pay | G4 | Builds on 接手 [doc D51] |
| the record | 今天发出去的 / Sent out today; groups 发出去的 · 用过的账号 · 在你设备上动过的 · 花掉的 | G5 | |
| seen in transcripts | 它的记录里看到的 / Seen in its log | G5 | Honest label for detected (not gated) effects |
| sandbox | 碰不到你的文件 / Can't touch your files | G7 | Always followed by its plain meaning; see GQ8 |
| May touch on tasks | 可以碰 / May touch | G7 | Already in the glossary for routines [doc D51]; extended to tasks |

## Open questions (recommendation first; answer "按建议" to take all)

| # | Question | Recommendation (default) | Why it matters |
|---|---|---|---|
| GQ1 | Adopt the effect ladder in §0 Rule 3 as v1's default policy? | **Yes**, as written | It is the whole of "what asks and what doesn't" |
| GQ2 | People-facing effects during quiet hours | **Wait until quiet end + 30 min**, unless the user Go'd them in the moment or a Rule/deadline says otherwise | Nothing goes to other people "from you" at 3 a.m. |
| GQ3 | Undo window for emails and posts | **30 s**, held on the control plane | Matches Gmail's longest setting [ext]; long enough to catch a slip |
| GQ4 | Offer "do this without asking from now on"? | **After 3 Go's of the same kind to the same destination within 14 days**, never for floor items | Asks must stay rare without the user writing rules |
| GQ5 | The floor no Rule can lower | **Payments (the user pays), passwords (never typed by the agent), effects requested by untrusted content, no-default decisions always visible.** Merge stays Rule-allowed [doc] | Some things must never be configurable away |
| GQ6 | A secret that reached the Log: redact? | **Yes: a superseding redaction event plus blob deletion, and advise rotation.** A narrow exception to "never delete" (principle 1) | An append-only log otherwise keeps a secret forever |
| GQ7 | Until the gate covers harness commands, list outside-looking commands from transcripts? | **Yes, in their own group labelled "Seen in its log"**, with the coverage note | Approvals are off on the Mac today; honesty requires showing what we can see |
| GQ8 | The word for a sandbox | **碰不到你的文件 / Can't touch your files, always followed by its plain meaning** ("can't reach your files"); run the fresh-user comprehension proxy before final | Technical word, consumer audience |
| GQ9 | On hand entry line for the record | **Always shown, muted**: "今天发出去的：没有" is itself the reassurance | Visibility vs clutter |
| GQ10 | PR comments, mark ready, request review | **Ask, no countdown** by default; a Rule can allow | They notify people and can't be unsent |
| GQ11 | The sending row's slide toward the destination: motion or metaphor? | **Treat it as motion**, check it in prototype review; if raters read it as anything but "leaving", drop it | AGENTS.md metaphor rule |
| GQ12 | Extend 可以碰 / May touch from routines to every task's dossier | **Yes**, same word, same meaning | One concept for scope everywhere |
| GQ13 | Write `research/31` (the draft said 29, now taken; approval fatigue, undo-send, prior art for audit views) before review? | **Yes, short report**; the Rule 1 evidence is currently from memory | The principle's evidence is thin |

## Artboards (proposed, not built)

| File | Size | Shows |
|---|---|---|
| `GOutsideCards.dc.html` | desktop 1440×900 | The four G1 cards side by side: personal draft PR (countdown), org push (ask once), email (no countdown), X post (draft) |
| `GSending.dc.html` | phone 390×844 | The sending row with the undo ring; undone; sent; refused |
| `GCredential.dc.html` | desktop 1440×900 | Cloudflare token ask → secure sheet → Accounts row; the held-secret composer |
| `GPay.dc.html` | desktop 1440×900 | Pay card with no countdown → Screen takeover → receipt result with "You paid $12.18" |
| `GRecord.dc.html` | desktop 1440×900 | "What Ducter did outside today": a full day and an empty day |
| `GReach.dc.html` | desktop 1440×900 | Opened task dossier with May touch for a worktree on the Mac, and the once-per-device line |
