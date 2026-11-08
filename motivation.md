# Ducter - An Opinionated Personal AI

## Motivation

I decided to build my own Personal AI due to following things and thoughts

- conductor.build, the major AI toolchain that I had been using for more than 6 months,
is winding down due to the team got aquired by meta(happy for them), the only hardcore tooling
 that's enough for me to both ochrestrate AI subs/Models from Codex, Claude Code and Cursor seamlessly,
 yet with elegant design, GUI based conversation and durable session managemnt, mobile clients and
 built-in Cloud Env -- I need an alternative in weeks(and my cloud condcutor env need to be switched in days).

- with thinking/researching and things being done more and more heavily, i strongly felt that
 my bandwidth limitation of my attention when i having to deal with sessions, although many sessions are
 already ochestrator agent that's manipulating swarms of subagents, some are long run loops that's always
 working actually -- the new platform need to address this, help dealing with the ochrestration thing and
 only depends on my attension when needed.

- i had been using muse, openai dots and grok bot recently, with **Nowledge Mem**(to be with all wisdom and experiencese
 compounding in Mem for more than a year among all AI that i used), it's already with
 quite some aha moments in my work and life time. -- similar capabilies should be in my workflow of both
 life and work(when i used conductor), i also want those AI to be model-agnostic and token-vender neutral,
 aka, freedom of your AI subs/keys, just like what we got from **Nowledge Mem**, decouple your context or
 AI roles/identities from the ai/platforms

## Imagine Ducter

- The main object that human are dealing with in this system is an entity with a Persona, by default it's called
 Ducter but anyone can name him/her, its idenitity(agent card, persona context) are well maintained by the system
 itself all alone, user can create more than one main ai object

- The main ai can be run on both cloud and locally machines

- Most of the things for a main ai will be delegated by a "subagent", in our system, we can call it a "Focus Window",
 this is due to I want it to be used by anyone instead of those who knows what is a subagent, session or git worktree, etc.
 a Focus Window technically could be an agent session, the agent session's harness/model will be carefully
 selected by main ai, yet, can be zoomed out and control(GUI, with proper like artifact sidbar etc.
 Like herdr, but totoally GUI) any time when a user would like to, just like we
 are talking to muse or bots, but all its background sessions are fully accessible in GUI way, only if
 the user wants so -- this ensures, users like me, heavily steering things in herdr/conductor to continuely have
 such controls on day-to-day work, yet is optional for fresh, other type of ai consumers

- can have computer use/browser use/ phone use(virtually or phsically)/ Phone Call(tuwa.ai - like) env and
 durable context/credential securely maintained

- Main ai and Focus Window ai harness/model are all decoupled from your subs or harness/models.

- The Main ai's loop is native Off-the-Shelf harness based, with harness adapters maintained by use to

  - make the main ai's session infiniate, yet optima to deal with multiple Focus Windows and user's freely
    communication consistently, like, the session handling, should be like slack thread to a human, we dont see threads detail messages
    at the first glance, but will look into when needed, and when next turn that's not about that "slack thread/Focus Window" any more
    we'll make the prefix cache back to the main channel without unfolded thread info
  - we carefully maintain the identity context with the harness adapters so when user want to use Opus 5.5, the main ai
    is just claude code + our harness adapter + context our adapter maintained(and securely persistent in
    Nowledge Mem)
  - the harness adapter will do a lot of things to ensure the harness loop that's not for main ai, carefully
    adapted to do such work wisely, for instance, if a new call(resume session) got an expired cache, the harness's
    session history will start from a begining message from main channel that's reasonable(not from begning + compaction based).
    also, like muse/ dots will response user first and run subagents at the same time, all those behaviors should be
    done by our harness adapter(prompts, hooks, injections etc within each harness)
    This is just an example, we need to carefully research on this on how we could leverage a loop/harness that's for a session
    to be on such sessionless and main ai case.
  - we should have machnisms for main ai and focus window to do long run loop based tasks, or code based(symantic) waiting
    conditions etc...
  - and we should handle plugin/apps properly, where, with our harness adapter to make them wired to main ai and focus window's
    harness properly

- the UX/UI should be totoally different from tradtional POWERFUL AI -- SUPER simple, yet elegant and special -- user should just be talking to his
  reliable work partner reports to her/him. When needed he can have micro management when needed or wanted.
  Like landing into any focus window, could be a conductor like GUI of agent sessions and artifacts/browser use window,
  could be like a ghost in a phone call meeting, etc.
  To have more controlablity, we might either create super well-designed GUI/Animation showing progress of all Focus Windows,
  or even world-class GenUI based?

- user could create GUI based Apps that's with code based/gen-ui and agentic ai when needed with needed, just
  like magic, i came with this idea during a flight yesterday from shanghai to tokyo without internet and intrestingly
  i found muse had such thing called muse spaces.

- if, a heavy conductor-like ai user want ducter have more conductor view, our main ai could be in a floating GUI way, this is
  an opiotnal mode that most of users wont use.

- generally, user can access ducter on web, native mobile app or desktop app, the concept of bootstrap it,
  enroll new machines should be extremely smooth, no concept burdon or confuse

- we should, at best use both mac machines, linux servers, nowledge mem, and like CF workers/r1 to enable
  seemless experience of using ai to do things anywhere, and efficent.

## Feasibility Study

- Main AI's key design to fulfill the requirements

- Whether Harness Adapter over claude code, codex, deepseek harness, pi is feasible for Main AI

- Prototyping core GUI design and flows, styling to be extremely modern and lovely like icons from , design like  etc

- See if MyGO(ref an open-source agent app and https://github.com/egoist/mygo) + expo can be
  our stack, yet, can we use https://github.com/botiverse/oar +
  nowledge bridge for harness layer and control plane/communication within MyGO/expo
