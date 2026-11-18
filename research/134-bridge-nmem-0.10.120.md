# 134 · Nowledge Bridge after nmem 0.10.120: the CLI that asks for Mem's linked shape

> 2026-11-18. Public. Evidence for D364 (the next free number on this branch; it may be renumbered at
> merge). The author: 「bridge 好像也有新的进展，你全力往前推进哈」. Follows research/66 §8 (Mem Cloud runs
> nowledge-co/mem #10278, but nmem 0.10.119 predates it) and §10.
>
> Tags: **VERIFIED** run or read by me this session · **DOCUMENTED** from Nowledge's own notes ·
> **INFERRED** my reading. Nothing was sent, connected, enrolled or written to the author's Mem: the
> only live calls were `nmem --version`, `nmem bridge --help`, `nmem bridge inbox --help`, `nmem --json
> status` (its `update` block only) and two Mem searches. The new CLI was not run: its wheel was
> downloaded from PyPI into the session scratchpad and read as a file (the package is MIT; only
> interface strings are cited, no code).

## 1. What is new

| Fact | Tag |
|---|---|
| `nmem-cli` 0.10.120 is on PyPI, uploaded 2026-11-16 18:10 UTC (0.10.119: 2026-11-14 23:56). | VERIFIED (PyPI JSON) |
| This Mac still runs 0.10.119; `nmem --json status` says `update.latest: 0.10.120`, `update_available: true`, `command: pipx upgrade nmem-cli`. | VERIFIED |
| The author's home server already runs 0.10.120 (D338 recorded it there on 2026-11-17, with `agents context select` answering 404 in every team Space). | VERIFIED (D338, by the author's run) |
| Mem's public changelog lists 0.10.120 as "Coming next" (the app), with one Bridge line: "Native Bridge can wait briefly for a busy session to become available, without resending your original operation." Nothing about senders or replies. 0.10.119's Bridge lines: setup finds contexts kept by `connections connect`; sessions work through authenticated local servers and Access Anywhere. | DOCUMENTED (mem.nowledge.co/changelog, fetched 2026-11-18) |
| The package README is the same in both versions apart from the version line. | VERIFIED (diff of the two wheels' METADATA) |

### 1.1 Inside the 0.10.120 binary (strings, against 0.10.119)

| Fact | Tag |
|---|---|
| New: the media type `application/vnd.nowledge.bridge-presentation.v1+json` and the header name `x-nmem-bridge-presentation-reader`, next to "Selected Bridge request exceeds its byte limit": the CLI asks Mem for a Bridge "presentation". Absent from 0.10.119. | VERIFIED |
| New types: `CloudSenderPresentation` (3 fields), `CloudMessagePresentation` (4), `CloudOwnPresentation`, `CloudImPresentation`; a field `member` appears in the read/observe field list. | VERIFIED |
| New: `mailbox_available` (beside `contact`, `retry_args`, `coverage_scope`, `spaces_cursor`, the contacts answer), `bridge_session_journal_busy`, and "Mailbox: registered" / "Mailbox: not registered" in the human setup output. | VERIFIED |
| These are exactly #10278's parts as its description gave them (research/66 §8): an opt-in read representation the CLI asks for, `sender` and `in_reply_to` on `inbox`/`open`, `agent_id` and `mailbox_available` on cards, `bridge_session_journal_busy` for a busy native session. So **0.10.120 is the first CLI with #10278**. | INFERRED (strong: every named part is present, none in 0.10.119) |
| The exact field names of `sender` can't be read from strings; #10278 named them `{actor_id, member?, agent?, agent_id?}` (4) while the struct has 3 fields, so one may be nested or dropped. Ducter reads every one of them tolerantly already (D294). | INFERRED |
| Unchanged: the `bridge inbox` argument struct; `--wait`, `--all-spaces` and `all_spaces` occur equally often in both binaries (they belong to other commands). No sign of an inbox long-poll or of one inbox across Spaces (nowledge-co/mem #10402). | VERIFIED (counts), INFERRED (meaning) |

## 2. What still holds

| Fact | Tag |
|---|---|
| One context reads one Space; on 0.10.120 Mem answers 404 to `select` in team Spaces (D338). #10402 is not released. | VERIFIED (D338) |
| A native session's sender is "Bridge agent" unless the presentation names it otherwise; whether `sender.agent` says which terminal is still unknown (research/66 §8.3 (4)). | INFERRED |
| Local Bridge (the app, a Vault): no changelog line says it answers with a place yet. | DOCUMENTED (absence) |
| Mem's Bridge feature flag can refuse an account with `feature_disabled` ("Nowledge Bridge isn't enabled for this account"); research/66 §10 saw `cloud_agent_context_authority_denied` on the `ducter` context on 2026-11-18. Whether the trial's fresh identity is allowed is only known by running it. | DOCUMENTED (README), VERIFIED (§10's refusal) |

## 3. Implications for Ducter

1. **The live rerun is unblocked on Mem's side.** The trial (D324: its own throwaway identity) needs nmem
   0.10.120 on the computer that runs it. The preflight now treats 0.10.120 as the first version that
   carries Mem's sender and `in_reply_to` (it said "after 0.10.119"), and S2 reports whether Mem's
   linked shape arrived at all.
2. **D249's maybe-answered rule can step aside where Mem links replies**, without waiting on a version
   guess: a message whose `in_reply_to` is `null` is Mem saying "an original, not an answer". Only a
   message from the old shape (no key at all) can still be the unlinked answer to a question.
3. **Say the update where it pays off.** On a connected home with an nmem before 0.10.120 and Mem
   saying a newer one is out, Talk with your other agents offers the update by what it gives: the partner
   can tell which agent wrote and which message answers what it asked.
4. **The fake Bridge answers in Mem's linked shape from 0.10.120**, so tests and the fake trial follow
   the release, while `NMEM_FAKE_SHAPE=released` keeps the bare shape.
5. **Not yet:** per-Space contexts, the 404 back-off and the long-poll stay as they are (#10402 and an
   inbox wait are not in 0.10.120). Bridge's default stays where D332 put it (the person's own home
   connects by itself when Mem is ready); the gate in `design/bridge.md` is the live trial.

## 4. The fake run in 0.10.120's shape (VERIFIED)

`NMEM_FAKE_VERSION=0.10.120 bun run bridge:live` (fake Bridge, real haiku partner and peer), three runs on
2026-11-18: S2 5/5 every time it ran, X1 3/3, S3 3/3 once the driver counted the code's one follow-through line
(its "followed" mark) instead of any partner sentence with 还没回 (twice the partner's own answer to "CI 那边怎么样"
also said the question was unanswered, which the old check read as a second line), and the closing check "Mem
marks an original as one" passed. S1 4/6 and 3/4: haiku's card named the user ("转来 Weyl 的活", the known S1 miss
of 2026-11-16) and once asked for the repo's folder instead of opening the task; neither touches D364. Transcripts
in the session scratchpad, not kept.

**Summary.** nmem 0.10.120 (PyPI, 2026-11-16) is the first CLI that asks Mem Cloud for #10278's
presentation: its binary carries the presentation media type, the sender and message presentation
types, `mailbox_available` and `bridge_session_journal_busy`, none of which 0.10.119 has. #10402 (one
inbox per identity) and an inbox long-poll are not in it. Ducter now reads `in_reply_to: null` as
"not an answer", offers the update on the connected pane, and its fake follows 0.10.120; the live trial
is ready for the author to run.
