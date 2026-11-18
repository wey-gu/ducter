# 134: Nowledge Mem in Ducter, felt from the person's side (D366)

The author asked for "和 nowledge mem 的深度集成和好的体验". Ducter already does a lot with Mem
(D141 identity, D168/D169 tasks and the plugin, D295/D304/D321 the Memory page, recall line and
fixing, D329 outbox, supersede, undo). This audit walks the three people through the moments where
Mem should be felt and asks where it is thin, invisible or plain today (main at 0.0.79), then
records which gap was closed.

Tags: **VERIFIED** (run here and seen), **DOCUMENTED** (Mem's own docs or `--help`), **INFERRED**
(from reading Ducter's code, not run). The author's real Mem was only read (`--help`, `--json`
shapes of `doctor`, `wm read`, `connect --detect-only`, `connect --dry-run`); nothing was written,
no key printed, no link redeemed.

## Setup

| | |
|---|---|
| Date | 2026-11-18 |
| nmem here | 0.10.119 (`/usr/local/bin/nmem`), Cloud backend, read only |
| VM | colima 0.10, `--vm-type vz`, Ubuntu 24.04 aarch64, no home mount, a normal user; deleted afterwards |
| Mem's guide | https://mem.nowledge.co/SKILL.md (fetched 2026-11-18, 942 lines) |

## Walk: the moments

| # | Moment | Heavy dev (the author) | Consumer | Fresh user | Today |
|---|---|---|---|---|---|
| M1 | First connect | Settings › Memory: install + one link (D225) | same | same, partner and two steps | fine; the home only |
| M2 | Partner remembers / recalls | `memory_add`, 记下了 line, 想起了 line (D304) | same | one quiet line | fine |
| M3 | See / correct | What it knows about you, Fix, Forget, Undo (D321, D329) | same | 它还不太了解你 | fine |
| M4 | A task on the home | the plugin as the persona (D168) | same | `<what_i_know>` fill-in when no plugin | fine |
| **M5** | **A task on a computer lent for tasks** | **haswell: agents from D363, no Mem at all** | a NAS lent the same way | never meets it | **gap (G1)** |
| M6 | The day's focus | Mem writes Working Memory daily; the partner never reads it | same | n/a | gap (G2) |
| M7 | "How did we fix X in Codex last week" | answered only from memories, not Mem's threads | rare | n/a | gap (G3) |
| M8 | Mem's own health | head row says connected; an expired key is not said | same | n/a | small gap (G4) |
| M9 | Another device | the phone and Mac see the same Memory page (one home) | same | same | fine |

## Findings

**G1. A computer lent for tasks never gets Nowledge Mem, and says nothing about it.** (The top gap.)
- D363 (0.0.78) puts Codex, Claude Code and pi on a bare server and signs them in from the sheet.
  Nothing puts Mem there. On such a computer `nmem` is absent, so the worker's `mem_plugins` op
  answers null, D169's per-agent line and its once-per-computer recommendation stay silent, and
  even D169's install task could not run (its brief stops when `nmem doctor` fails). **INFERRED**
  from `core/mem-plugins.ts` and `cli/worker.ts`.
- So every task there starts without the person's Context Bundle, and its session is never
  captured into Mem: work the author does on haswell is invisible to his Claude Code and Codex
  elsewhere, the opposite of "one memory". Ducter's fill-in (`<what_i_know>`, ≤ 4 notes, a
  read-only `memory_search`) still runs, so tasks are not blind, but they are thin.
- D225's install route can't help there either: a fresh Ubuntu 24.04 has `python3` 3.12 but no
  pip, no pipx, no uv, and its Python is marked externally managed; a normal user has no
  password-less sudo. **VERIFIED** in the VM: `command -v nmem uv pipx pip3` all none.
- A latent bug on the same path: the runner passed the home's `NMEM_CLI_PATH` into every task's
  session, also a task on another computer, where that path means nothing and the plugin would
  look for nmem there. **INFERRED** from `runner.ts` specFor.

**G2. Working Memory never reaches the partner.** `design/system.md` says "Working Memory enters as
an L4 delta"; no code reads it (the L1 bundle is read with `--no-working-memory`). Mem's daily
surface has focus areas, a short briefing, flags and decisions awaiting the person
(`nmem --json wm read`: `parsed.{focus_areas, briefing, flags, awaiting_rulings}`; **VERIFIED**
shape, contents not read into this report). Showing it unprompted (a start, the morning note)
would break D327's "nothing read for the first words" and D173's restraint; as an L4 line once a
day it would only make answers better, unseen. Value: medium.

**G3. The partner can't recall Mem's threads.** `memory_search` reads memories only (`m search`);
the sessions Mem's plugin captures (tasks included) are threads (`t search`), so "how did we fix
that last week in Codex" finds nothing unless something was distilled. Open since research/69 (K6).
A tool change means the haiku eval (D175). Value: medium for the heavy developer.

**G4. Mem's health on the Memory head row.** Its todo trigger ("`nmem doctor --json` gives a stable
shape") is met: `{checks: [{name, status, detail, tool}], failed}` with `credential home`, `server
reachable`, `api key`, then one line per AI tool. **VERIFIED** on 0.10.119 and 0.10.120. Small.

**G5. D169's plugin install is a model task; Mem now has a deterministic command.** `nmem connect
[<link>] --tool <id>` redeems a link (or reuses the saved credential), verifies it live, then
registers Claude Code and Codex by itself ("Claude Code and Codex are registered automatically when
their own binary is on PATH", SKILL.md, **DOCUMENTED**). `nmem --json connect --dry-run --tool
claude-code` here answered `already connected — no action` without touching anything (**VERIFIED**).
A task costs tokens and minutes and needs a signed-in agent; the command needs neither.

**G6. A per-memory link** (Open in Nowledge Mem → that memory): Mem now has `nowledgemem://`
resources (`nmem resources get`), but the desktop deep link carries no address and no web URL per
memory is documented. The todo's trigger is still not met.

## The Mem command line on a bare server, live

| Step | Result | Time |
|---|---|---|
| uv 0.13.7 musl build (released 2026-11-03), SHA-256 checked, into `~/ducter-data/tools/bin` | **VERIFIED** `OK` | 5 s |
| `uv tool install nmem-cli` with `UV_TOOL_DIR`, `UV_TOOL_BIN_DIR`, `UV_PYTHON_INSTALL_DIR`, `UV_CACHE_DIR` all inside the tools folder | **VERIFIED** nmem-cli 0.10.120, the system Python 3.12 used, `nmem` linked into `tools/bin` | 5 s |
| Size of the tools folder | **VERIFIED** 57 MB (uv 34 MB of it) | |
| `nmem --json doctor`, not signed in | **VERIFIED** exit 1; `credential home` pass (default local, no key), `server reachable` fail (127.0.0.1:14242 refused), `api key` warn; so "signed in" = server reachable **and** api key pass | |
| `nmem --json connect --detect-only` | **VERIFIED** per tool `{tool, installed, registered, binaryAvailable, action}`; no credential read | |
| `nmem connect --skip-tools <link to an unreachable host>` | **VERIFIED** `error: … dns error: failed to lookup address information`, no credential written | |
| `uv tool upgrade nmem-cli` (same env) | **VERIFIED** "Nothing to upgrade" | |
| A real link redeemed and Claude Code / Codex registered there | **NOT RUN** (it would sign a computer in to the author's Mem) | |

## What was built (D366)

The computer's own Nowledge Mem, on its card and on the lend sheet, in three plain states:
**{device} 上做事还不记得你** with **装上**, **装好了，还差登录** with a link field and **登录**, **记得你了**
naming the agents that use it. Install is Ducter's own uv plus `uv tool install nmem-cli`, all in
Ducter's tools folder; sign-in is Mem's own `nmem connect <link> --tool codex-cli --tool
claude-code`; readiness is Mem's own `nmem doctor`. When it turns ready the home reads Mem's plugin
check there at once, so the agents' Mem lines and the task runtime's `present()` follow, and tasks
there run with the plugin (D168). Shown only to someone whose home already has Mem (D169 (6)). The
home's `NMEM_CLI_PATH` no longer goes to a task on another computer.

## Implications for Ducter

- Mem on a lent computer is the same three steps the home has, carried to where the person is;
  the link is the only thing they fetch, and it never stays anywhere.
- `nmem connect --tool` can replace D169's install task everywhere (no tokens, no signed-in agent
  needed); left as a todo so D169's tested path isn't changed blind.
- Ducter's uv route also fixes D225's dead end on a bare **home** ("install pipx first"): todo.
- G2 (Working Memory as a once-a-day L4 line) and G3 (thread recall) are the next two, both
  invisible by design; G3 needs the haiku eval.

**Summary.** Ducter's Mem integration is deep on the home and silent everywhere else: a computer
lent for tasks (D363) got agents but no Mem, so its tasks ran without the person's memory and left
nothing in it. D366 puts Mem there in two taps and a pasted link, verified on a bare Ubuntu for the
install half (10 s, 57 MB); the sign-in half is Mem's own documented command, not run live.
