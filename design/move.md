# Moving Ducter to another computer (`ducter move`, D504)

> 2026-11-24, updated 2026-11-27 · **Decided (D504), first slice built: `ducter move --plan
> [--to <computer>]`, read-only. Second slice built (D621): `ducter move --bundle <file>` and
> `ducter move --receive <file>`, one encrypted file carried by hand. Third slice built
> (D627): `ducter move --receive --listen` and `ducter move --to <address> --code <code>`,
> the freeze, and the same bundle sent over one X25519 connection; `ducter move --unfreeze` is
> the way back. Tested over fake homes on localhost (`packages/cli/test/move.test.ts`,
> `packages/cli/test/move-bundle.test.ts`, `packages/cli/test/move-send.test.ts`,
> `packages/core/test/move-receiving.test.ts`, `packages/core/test/move-freeze.test.ts`).** Still
> owed: the Mem/Bridge handover, cut-over, rollback, the known-worker shortcut and resumable
> chunks, the app's row (`design/todo.md` "Moving Ducter"). Labels: **VERIFIED** (code read this
> session), **DOCUMENTED** (a design note or vendor page says so), **INFERRED** (judgment).

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
| The Log (conversation, every task, routines, decisions, waits) | `ducter.db` (+ `-wal`) | **Yes** | A consistent snapshot through SQLite's backup API (after the freeze for a network send); verified by event count and the hash of the last event's `(seq, kind, body)` on both sides |
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
2. **Bundle, a file carried by hand (built, D621).** `ducter move --bundle <file>
   [--to <computer>] [--passphrase-stdin]`: one encrypted archive of §2's "Yes" rows. A
   passphrase is made and shown once, or read from stdin; it is never an argument and never
   written to disk. AES-256-GCM under a scrypt key, the header bound as AAD (a copied file opens
   nothing; a wrong passphrase and a changed file are refused before anything is written). The
   Log and `devices.db` are consistent snapshots through SQLite's backup API, never a copy of a
   live file; every other file is read and hashed, then streamed once into the cipher, so a
   change during the write aborts it. Autofill is opened with this home's key and re-locked
   inside the bundle; the old key, `kept-keys`, `task-keys` and `key-grants.json` stay. The
   bundle lists what is redone and what stays; the home keeps running and is only read.
3. **Receive, a file carried by hand (built, D621).** `ducter move --receive <file>` on the
   new computer: refuses a data folder that already has work (a fresh install, not started),
   checks the passphrase, every file's SHA-256, and the Log's count and last-event hash, and
   writes 0600 files and 0700 folders into a staging folder renamed into place only when every
   check passes. Autofill is re-encrypted under the new home's own keychain or key file; a
   `move-receiving.json` marker says this home is received but not switched over, and `startCore`
   refuses to start it (two homes on one chat app is D324's bug). It prints the sign-ins to redo
   (agents that share one reason are one line, GitHub its own), the Mem line and the devices line
   in `--plan`'s words. Its last line promises no way back this slice has not built: the old
   computer is untouched and still the one running. No pollers, no routines, no network, no
   cut-over.
4. **Freeze and send (built, D627).** On the new computer, `ducter move --receive
   --listen` makes an ephemeral X25519 key, prints one one-time code (D83's alphabet, 10 minutes,
   one use) with its address, and waits for exactly one sender; after its answer it stops. On the
   old home, `ducter move --to <address> --code <code>` connects to the running core and freezes
   it: routines, tasks in rounds, waits and Keeps hold (a held clock and a Keeps hold, never a
   killed turn), chat apps stop polling with their cursors written, Bridge turns stay quiet, a
   doorbell answers "moving", and a new task is refused. It then reports every running task and
   waits for them to reach a turn end (10 minutes), asking before going on if any remain. Only
   then does it take the same bundle as §5.2, with a random passphrase never shown, and send it
   through the X25519 channel (AES-256-GCM under an HKDF key bound to both nonces and the code;
   the move code is proven by HMAC, never sent). The new side writes the received bundle to a
   0600 temp file and calls **the same `readBundle` `--receive <file>` uses**; every SHA-256, the
   Log's count and last-event hash, the non-empty refusal and the Autofill re-lock are the same.
   The temp bundle is deleted on both sides. The old home stays frozen and still owns everything,
   and a `move-frozen.json` marker keeps it frozen across a restart; `ducter move --unfreeze`
   lifts it (the way back for this slice). One request carries the whole bundle: resumable chunks,
   and the known worker's code-free socket, are next.
5. **Handover.** §4, then the tunnel: the old home stops cloudflared, the new home runs it with
   the same credentials (same hostname). A domain way: the plan's DNS line, checked by the
   new home's own `/.well-known/ducter-home` before it counts.
6. **Cut-over.** The old home sends every socket `{t:"ways"}` with the new home's ways first,
   then a `moved` frame, and stops. Apps, the CLI and workers race the new ways, verify the same
   key, and connect (D293); their tokens are in the moved `devices.db`. The new home starts its
   pollers, routines and the parked tasks. Counts in the conversation: **搬好了：{n} 条记录都在。/
   Moved: all {n} entries are here.**
7. **After.** The old computer, by default, joins the new home as a computer that does tasks
   (D155, one Go, default yes when it has local work or Mac abilities). Its old data folder is
   kept frozen 30 days; its Ducter answers only in *moved* mode: a web page shows where Ducter
   went, a socket gets the ways and `moved`. Then it deletes the frozen folder, the home key last.
8. **Rollback.** `ducter move --back` (and a row on the new home) is the same move in reverse,
   carrying only the Log after the freeze's seq plus changed files, so it takes seconds. If the
   new computer is gone, `ducter move --undo` on the old one starts it again from its frozen
   point after the person confirms, naming what is lost (entries after the freeze, by count).
   Only one home serves at a time: `--undo` first tells the new home to stop if it can reach it.

**Zero loss, measured.** Equal Log count and last-event hash; every manifest hash; chat cursors
continuous; one Bridge connection at the end (Mem's list); every paired device seen on the new
home within a day, or listed. The local bundle slice already measures the first two and the
per-file hashes on both sides; the network send adds the same checks at the receiving end, and
cut-over is what adds the rest.

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
- **A passphrase carried by hand** (D621): until the two-home X25519 exchange, the person has
  to keep the passphrase somewhere safe and lose it if they lose the paper. The home is untouched
  either way; the next slice's bundle can be made again.
- **A bundle taken while the home runs is not a freeze** (D621): the Log and `devices.db` are
  consistent snapshots and every file is hashed before it is streamed, but a chat cursor or a
  settings write can land between two files. The network slice freezes first; the file slice
  still says it does not.
- **One request, no resume** (D627): the bundle crosses as one encrypted body. A drop
  leaves the old home frozen on purpose (nothing is half-switched), and `--unfreeze` is the way
  back; resumable chunks are next.
- **The known worker's shortcut** (D627): a computer that already does tasks for the home
  could skip the code over its authenticated worker socket (move.md's choice when both ends know
  each other). This slice always uses the address and the code, which works for any computer;
  the shortcut is next.
- **A running partner turn is not counted** (D627): the wait list is tasks at work or
  queued, not the partner's own turn. Its Bridge triggers are held, and no new task starts; a
  partner turn already in flight finishes like a task's.

## 7. Verified

- `packages/cli/test/move.test.ts`: a fake Mac home (two partners, five tasks in four kinds of
  place, two routines, four devices, Telegram, Bridge and a helper, Autofill, a browser profile):
  every section and its order, the Log counted, no secret's value anywhere in the plan, `--to` a
  known worker vs a new name, Linux → Linux carrying the browser, zh and en, and every file's size
  and mtime unchanged after the plan.
- Not run on the author's real home (it would only read; the brief forbade touching `~/.ducter`).
- `packages/cli/test/move-bundle.test.ts` (D621): a fake Mac home (tasks, a Keep, a routine,
  an app, an Autofill secret, keys, a tunnel address, a browser profile) bundled and received into
  a fresh temp home: the same events in the same order, the same `readLog` projection, the same
  key files, the app and media bytes, the Keep, and an Autofill vault that opens under the new
  key (the old key file is not copied); a made passphrase shown once and absent from the file; a
  wrong passphrase, a changed byte after the header, and a target with work refused with nothing
  written; bundling a home with its Log still open leaves every file's size and mtime unchanged
  and still receives every event; zh and en words for the sign-ins, the Mem line and "no pairing
  again". Not run on the author's real home; not tried across two real computers.
- `packages/core/test/move-freeze.test.ts` (D627): a fake clock and runner: a routine due
  during the freeze does not start and starts after `unfreeze`; a new task is refused with the
  moving line and opens after; the running list names a task at work; a freeze survives a restart
  through `move-frozen.json` until `--unfreeze`.
- `packages/cli/test/move-send.test.ts` (D627): two temp homes on localhost, a real one-shot
  listener and a fake core host: the send round-trips the same events, `readLog` projection and
  files; a wrong code is refused with nothing written; a dropped connection leaves the old home
  frozen and `--unfreeze` restores it; the listener stops after one use; a non-empty target refuses
  before listening. Not tried across two real computers; no cut-over.
