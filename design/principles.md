# Ducter Design Principles

> Draft 8 · 2026-11-08 · Conclusions only. Mechanics live in `design/`; evidence lives in
> `research/` (index: `research/README.md`), cited as [n].

## Physics

An LLM call is a pure function of one linear prefix. A "session" is a side effect of three
limits: the **prompt cache** (exact prefix, short TTL), the **context window**, and
**attention decay**, which sets in long before the window is full. A session is *a cached
prefix with a lifetime*; a personal AI's relationship with its human has none. Ducter keeps
the two apart, and treats the window as a **quality budget** (128K–256K by default), not
the model's maximum.

## The main AI · `design/context.md`, `design/memory.md`, `design/conversation.md`

**1. The Log is the truth; harness sessions are caches.**
Each persona owns an append-only, unbounded Log: one channel plus threads. Threads are
mirrored as normalized events, with large outputs kept as deduplicated blobs, so they stay
readable while their machine sleeps. Any session can be lost or rebuilt without loss.

**2. Every call is a deterministic projection, layered by rate of change.**
L0 harness + tools · L1 identity · L2 spine · L3 rare excerpt · L4 this turn's deltas.
Anything volatile enters only at L4, and frozen content never changes. The same Log yields the
same bytes, rendered as a few large blocks. [1][3][13]

**3. Remember like a person: a small structured digest, a bold window, and recall.**
The digest knows *what exists* and *what binds*: a TOC with pointers, decisions,
superseded→new, and the user's verbatim anchors. It does not retell. Recent turns stay
verbatim. Anything older is recalled by gated automatic retrieval or by search. Digests freeze
only after a mechanical audit and are never re-summarized. [14][15]

**4. Expire-aware resume: choose resume or re-cut by expected cost.**
Estimate whether the cache is still warm. Resume when that is cheaper; otherwise re-cut
from a clean channel cut point, even while warm once history dwarfs the rebuild. Settings
change only at a cut. A re-cut reads as an ongoing conversation, never "you were reset".
[2][12] *Built: a heuristic (55 min, 120K); the cost model is not (`context.md`).*

**5. The tail is a working set: shrink on the way in, fold when a sub-topic ends.**
Cap every read before it enters. Do bulky reads in a side context that shares the cache, and
let only the conclusion return. A read that did land is folded within a turn or two by
truncate-and-append, never by editing in place. Folding is for quality, not price. [11][12][13]

**6. One conversation, one shape: ack → job → result, whoever does the work.**
The human sees only the conversation. The ack names the action, never the outcome. Work done
in turn, in a fork, or in a Focus Window looks identical and returns the same report. The main
AI never blocks. [16]

**7. Attention is the scarce resource; unread is mutable.**
People harvest in batches. While unread, the main AI's latest report is one living message
revised in place; a read receipt freezes it. It is rendered from typed reports, with decisions
first, each carrying a default. Only decisions earn a push. "Done" is a claim backed by
evidence. [1][16] *Built: the core renders it; the partner's own words never change.*

## Focus Windows · `design/focus-window.md`, `design/focus-window-states.md`

**8. A thread is a Focus Window; context moves by pull, and waking is the last resort.**
The main AI climbs a cost ladder: card → report → transcript slices → *ask* → unfold. It
asks only when the answer needs the window's own judgment. A human inside a window talks to
it directly. [1][6]

**9. Only the main AI is sessionless.**
A window is task-bounded: an ordinary harness session under the same budget. A single deep
task may deliberately run a larger window. Subagents inside a harness stay inside it. [12]

**10. Attention and residency are separate axes, with every transition owned.**
What the human sees and what the machine does change independently. Every transition has one
actor and one trigger. Waiting, parking, and sleeping cost no attention. Park aggressively,
archive lazily: follow-ups arrive days later. [6]

**11. Handoff = a curated push plus progressive pull.**
A brief carries the user's verbatim words, the decisions, the done-criteria, the scope, the
write set, and quoted messages. Read tools let the window fetch anything else. A long job
never forks the whole channel. Each write set has one writer. [1][6]

**12. A typed report is the only way a window wakes the main AI.**
It carries state, a short summary, questions with defaults, evidence, and a transcript
pointer. The main AI answers from the Log first and escalates only what it can't. [2][6]

**13. Every window is always ready to hand off.**
Rolling checkpoints let a new window continue on the same environment when quota, a failure,
or a choice demands it, without needing the old model. [6][7]

**14. Choosing a body: candidates by rule, choice by judgment, visible to the user.**
A deterministic ranking over constraints, quota, cache continuity, and history. The main AI
picks and explains overrides. By default it needs no config. Users steer in conversation:
pin a window, or state a rule in plain language that Ducter confirms. A rules file is
optional. A pin beats a rule, and a rule beats the default. Nothing falls back silently.
[7]

## System · `design/system.md`

**15. One thin adapter contract over the latest OAR, with declared capabilities.**
Adapters declare what they can do, above all their cache scope: prefix or thread. A missing
capability costs efficiency, never correctness. One small, fixed Ducter tool server goes into
every harness. [3][5][8]

**16. Waits are code, not tokens.**
Predicates run in the control plane. Semantic checks use the cheapest capable model, and only
when their input changes. [2]

**17. Identity is user data; the harness and model are a replaceable body.**
A persona is one Nowledge Mem identity, and its windows share it. Ducter writes only its own
persona and reads the rest. Every Mem write Ducter itself makes records its provenance: the
persona's identity, `source_app = ducter`, and the window plus Log pointer; a window's own Mem
plugin writes as the persona with its agent's `source_app`. Subscriptions run only through the user's own official binaries.
Skills and harness config stay the user's, and windows inherit them, Nowledge Mem's plugin
included, as the persona; only with memory off does Ducter turn that plugin off in a window.
A user may have several personas. Each has its own conversation and identity, and they are
isolated unless the user links them. Attention aggregates per person, never per persona. [3][8][10]

**18. No per-call approvals: scope the credentials, gate the effects.**
`needs-you` is for decisions, not permissions. Windows hold only scoped credentials, never in
model context. High-stakes external effects are logged as intents under the user's policy.
Ducter is honest about how strong each environment's isolation is. [2][5]

**19. Compute sleeps; state doesn't.**
A small control plane that is always reachable holds the Log, waiters, registry, and intents.
Machines wake on demand and dial out only. Storage sits behind an append-log port: SQLite now,
HawDB later. [4][9]

**20. Simple surface, full depth on demand.**
One partner reports to you. Any window opens into a full workspace and closes again, without
new concepts.

---

**What is new:** prior art compacts or resets *one raw session*. Ducter rebuilds its main AI
from cut points in an unbounded channel, treats every harness session as a cache, and spends
human attention only where it is needed.
