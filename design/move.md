# Moving Ducter to another computer (`ducter move`, D504)

> 2026-11-24 · **Decided (D504), first slice built: `ducter move --plan [--to <computer>]`,
> read-only, tested over a fake home (`packages/cli/test/move.test.ts`).** The later slices
> (receive, bundle, import, handover, cut-over, rollback) are designed here and owed
> (`design/todo.md` "Moving Ducter"). Labels: **VERIFIED** (code read this session),
> **DOCUMENTED** (a design note or vendor page says so), **INFERRED** (judgment).

The first reason Ducter exists (`motivation.md`): the author's cloud environment "had to move
within days". A Ducter that can't leave the computer it started on repeats that trap, one level
down. research/218 §1 row "Runs anywhere" lists `ducter move` as unbuilt; `todo.md` had the
author's Mac → server case of 2026-11-10 as a one-paragraph sketch. This note is the design.

**Words.** On screen the home is never "the home" and never 住 / lives (glossary, D358): it is
**{name} 在 {computer} 上运行 / {name} runs on {computer}**. Moving it is **搬到另一台电脑 /
move to another computer**; the verb 搬 is already the glossary's for a task (D157's
**搬到 {device} 上了**). The command is `ducter move`.

## 1. Who, what they feel, how it starts

- **The heavy developer (the author first).** Started on the MacBook, wants Ducter on a server
  that never sleeps (hel, a Hetzner box) and the MacBook to go back to being a laptop that does
  tasks for it. *Before:* a reinstall means losing the conversation, every partner's history,
  paired phones, chat bots, Mem handover, routines; or a hand-copied `~/.ducter` that silently
  breaks Autofill (its key is in the Mac's keychain), double-polls Telegram (409s) and leaves two
  homes answering one Bridge mailbox (D324's bug). *After:* one plan that says exactly what goes,
  what he redoes and why, then one move with a verified count, and the same phone app on the new
  address without pairing again. 放心 is the emotional value: nothing is lost and he knows it.
- **The consumer** whose Mac at home is being replaced, or who was told by the partner that a
  server keeps it awake. *Before:* fear ("will it forget me?"). *After:* the partner's own words:
  everything it knows goes with it; three sign-ins to do again, each named.
- **The fresh user** never meets this until they buy a new Mac. First contact is the Mac app's
  Settings › 在哪儿运行 / Where it runs (a later slice), or the partner when they say "我换电脑了".
  Zero concepts: the plan is the explanation.

**North star.** 好用: one command (later one row in Settings). 顺滑: devices follow by themselves.
赏心悦目: the plan reads as a short letter, sections in the person's language, sizes beside
each line. 放心: the plan first, nothing written; a verified count; 30 days to go back. 惊喜: the
phone in your pocket just keeps working on the new address.

## 2. What a home is made of (VERIFIED from code, 2026-11-24)

Everything below lives in `<dataDir>` (default `~/.ducter`) unless said.

| Part | Where | Moves? | How / why |
|---|---|---|---|
| The Log (conversation, every task, routines, decisions, waits) | `ducter.db` (+ `-wal`) | **Yes** | A consistent snapshot (`VACUUM INTO` after the freeze); verified by event count and the hash of the last event's `(seq, kind, body)` on both sides |
| Partners | `persona.json` (name, `mem` identity binding), `partners.json`, `partners/<id>/` | Yes | Plain files |
| Settings, projects, marks, ambient, outside, Mem plugins, paused, records, app offers | `settings.json`, `projects.json`, `marks.json`, … | Yes | Plain files |
| Routines | in the Log (`routine`, `routine_run`) | Yes, with the Log | A run due during the freeze runs late on the new home (routines.ts' own `lateLine`) |
| Keys the person pasted | `keys.env` (D102) | Yes | Values never shown; the plan names only the variable |
| Account connections | `connection-tokens.json` (D96) | Yes | Tokens, not sign-ins: valid from any computer |
| Autofill | `saved/<persona>.enc`; key in the Mac's keychain or `saved/key` (D191) | **Yes, re-locked** | Decrypted on the old home, re-encrypted under the bundle key, re-encrypted on the new home under its own keychain or key file. The old key never leaves |
| Paired devices and the home's key | `devices.db`, `home-key.pem` (D293) | **Yes** | This is what makes every device follow without pairing again (research/97 §5.4): tokens stay valid, the pinned key proves the new address is the same home |
| Chat apps | `channels.json` (tokens, Telegram `offset`, WeChat `buf`/`ctx`) | Yes | All three **pull** (Telegram `getUpdates`, Slack Socket Mode, WeChat `getupdates`): there is **no webhook** to re-point. The cursors move with the freeze, so nothing is read twice or missed |
| Notifications | `push.json` (VAPID keys, subscriptions), `apns.json` | Yes | Web Push subscriptions are bound to the VAPID key, not to the sending server; the iPhone's relay handle is home-independent (D159) |
| Mem identity binding | `persona.json` `mem` | Yes | No re-enrolment: same identity, same Mem ("one Mem everywhere") |
| Bridge connection | `bridge-connection.json` (D205, D324) | **Handed over** | A connection is per home (`<identity>-on-<home>-<key tag>`), see §4 |
| Helpers | `helpers.json` (D494), each with one connection | Handed over | Same as Bridge, one at a time |
| Made for you, pictures, evidence | `media`, `media-in`, `apps`, `evidence`, `snapshots` | Yes | Plain files |
| Cloudflare tunnel | `anywhere/` (credentials, state) (D228) | **Yes** | Tunnel credentials run from any computer: the hostname stays, nothing re-points |
| Ducter's own browser | `browser-profiles/<name>` (D151) | **Same system only** | Chrome runs with `--password-store=basic` (and `--use-mock-keychain` on a Mac), so cookies are locked with a fixed per-system key: Linux → Linux and Mac → Mac open; across systems they don't (INFERRED from Chromium's OSCrypt; checked live in the bundle slice) |
| Address book | `reach.json`, `public-url` | Partly | The tunnel way goes with the tunnel; a domain needs its DNS record changed; a Tailscale name belongs to the old machine (a new one is made) |
| Caches, tools, logs | `bin`, `tools`, `updates`, `scratch`, `*.log`, `checks` | **No** | Made again on the new computer |
| AI agents' sign-ins | each agent's own (`~/.claude`, `~/.codex`, Keychain) | **No: redo** | Not Ducter's (principle 17); except Claude Code when `CLAUDE_CODE_OAUTH_TOKEN` is in `keys.env` |
| GitHub sign-in | `gh`'s own | No: redo | `ducter git login` there (D272) |
| Mem sign-in | Mem's credential home | No: redo | Never in Ducter's folder (D393: "read per request, never written") |
| Working copies and local repos | `~/ducter/worktrees`, the person's repos (D204) | **Stay** | Code stays; a repo task pushes its branch (D157's `moveTask`) |
| Mac-only abilities | the person's Chrome (D130), computer use (D235), Ducter's own phone (D217), iMessage (D277) | **Stay** | Only a Mac does them. The old Mac becomes a computer that does tasks for the new home (D155), so they keep working. iMessage is the Mac app's (a client), so it follows by itself |

## 3. Work under way

At the freeze (§5 step 3) every task on the home gets one of four fates, said per task in the plan:

- **On another computer** (a worker): keeps going; its computer reconnects to the new address
  (D293's blip grace covers the switch).
- **No place, or a browser place**: pauses after its current step and carries on on the new
  home from its saved progress (`runner.moveTask`'s path).
- **A repo with a remote**: its branch is pushed first, then it carries on there; uncommitted
  changes stay (D157: uncommitted work stops a move, so the task is asked to commit at its step end).
- **A folder on this computer, or a repo with nowhere to push**: carries on here, because this
  computer keeps doing tasks for the new home. If the person declines that, the plan says such
  tasks wait for it and lists them.

Default: wait for the tasks on the home to reach a turn end, up to 10 minutes, then park the rest
(the plan says the count). Routines whose place is on this computer stay here the same way.

## 4. Mem, Bridge and helpers: one connection, handed over

D324 already built the move for one connection: **改由这台收 / Receive here instead** connects
the new home for the same identity, then revokes the other, one Go for both. The move reuses it
as a step, never asking: (1) the new home connects (`bridge connections connect`, its own key
tag in the label); (2) once Mem confirms, the old home revokes its own; (3) the same for each
helper. Between (1) and (2) both are connected for seconds, but only the new one reads (the old
one is frozen), so no message is taken by the wrong home. If the new home can't connect (no Mem
sign-in there yet), the old connection stays and the plan's "Sign in to Nowledge Mem" is the one
thing between them; the move doesn't cut over until it's done or the person says go without it.
Tasks on workers reach Mem through the home's relay (D393): they follow the address with their
worker; their task keys stay valid because `mcp.secret` moves.

## 5. The move, slice by slice

1. **Plan (built).** `ducter move --plan [--to <computer>]`: §2–§4 read from this data folder, in
   the person's language; `--json` for the app later. Writes nothing (the test compares every
   file's size and mtime). `--to` naming a computer that already does tasks for this home uses its
   paired system and says the move can go over that connection; any other name is assumed a
   Linux server, said once.
2. **Receive.** On the new computer, `ducter move --receive` (or the installer's last line): an
   empty Ducter that refuses if it already has a Log, makes an X25519 key, and shows a one-time
   move code (D83's alphabet, 10 minutes, one use) with its address. A computer that already does
   tasks for this home skips the code: the request goes over its authenticated worker socket.
3. **Freeze.** On the old home, after the person's Go: new turns are held (D325's queue),
   routines stop their timers, chat apps stop polling (cursors written), new tasks queue, tasks
   on the home reach a step end (§3). The partner says one line in the conversation first.
4. **Bundle.** A snapshot (`VACUUM INTO` of `ducter.db` and `devices.db`; every other file
   copied), a manifest with each file's SHA-256 and the Log's count and last-event hash; Autofill
   re-locked (§2). **Encrypted at rest**: AES-256-GCM under a key from X25519 between the two homes,
   the move code authenticating the exchange (the new home's public key fingerprint rides with
   the code), so a bundle file copied off the wire or the disk opens nothing. Sent over HTTPS or
   the worker socket in resumable chunks; the bundle on either disk is deleted after import.
5. **Import.** The new home checks every hash and the Log's count and last-event hash, writes the
   files with their modes (0600 secrets), puts the Autofill key into its keychain or key file,
   and starts in *receiving* state (no pollers, no routines yet).
6. **Handover.** §4, then the tunnel: the old home stops cloudflared, the new home runs it with
   the same credentials (same hostname). A domain way: the plan's DNS line, checked by the
   new home's own `/.well-known/ducter-home` before it counts.
7. **Cut-over.** The old home sends every socket `{t:"ways"}` with the new home's ways first,
   then a `moved` frame, and stops. Apps, the CLI and workers race the new ways, verify the same
   key, and connect (D293); their tokens are in the moved `devices.db`. The new home starts its
   pollers, routines and the parked tasks. Counts in the conversation: **搬好了：{n} 条记录都在。/
   Moved: all {n} entries are here.**
8. **After.** The old computer, by default, joins the new home as a computer that does tasks
   (D155, one Go, default yes when it has local work or Mac abilities). Its old data folder is
   kept frozen 30 days; its Ducter answers only in *moved* mode: a web page shows where Ducter
   went, a socket gets the ways and `moved`. Then it deletes the frozen folder, the home key last.
9. **Rollback.** `ducter move --back` (and a row on the new home) is the same move in reverse,
   carrying only the Log after the freeze's seq plus changed files, so it takes seconds. If the
   new computer is gone, `ducter move --undo` on the old one starts it again from its frozen
   point after the person confirms, naming what is lost (entries after the freeze, by count).
   Only one home serves at a time: `--undo` first tells the new home to stop if it can reach it.

**Zero loss, measured.** Equal Log count and last-event hash; every manifest hash; chat cursors
continuous; one Bridge connection at the end (Mem's list); every paired device seen on the new
home within a day, or listed.

## 6. Risks and what is not decided

- **The home key on two disks** for the 30 days. Alternative: a fresh key with a succession
  statement signed by the old one (clients would need it in Go, Swift and Kotlin). Moving the key
  works with every client today; the frozen copy goes when the 30 days end.
- **A device that sleeps through the cut-over** keeps the old ways. The old home in *moved* mode
  hands them the new ways for 30 days; after that, it pairs again. Listed in the plan (not seen
  in over a month).
- **A web page's address changes** unless the tunnel moves; push still arrives (VAPID moves), but
  a tap opens the old address, which says where Ducter went.
- **Cross-system browser sign-ins** (INFERRED, §2): redo is the safe default until checked live.
- **Autofill on a server** is kept in a key file, said in the plan's risks.
- **Disk space** on the new computer: the plan says the size; the receive step checks free space.

## 7. Verified

- `packages/cli/test/move.test.ts`: a fake Mac home (two partners, five tasks in four kinds of
  place, two routines, four devices, Telegram, Bridge and a helper, Autofill, a browser profile):
  every section and its order, the Log counted, no secret's value anywhere in the plan, `--to` a
  known worker vs a new name, Linux → Linux carrying the browser, zh and en, and every file's size
  and mtime unchanged after the plan.
- Not run on the author's real home (it would only read; the brief forbade touching `~/.ducter`).
