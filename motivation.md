# Ducter: an opinionated personal AI

## Why I'm building it

I decided to build my own personal AI for three reasons.

- **The tool I relied on is going away.** For more than six months my main AI workbench was
  conductor.build. Its team was acquired by Meta (happy for them), and the product is winding
  down. It was the only serious tool that let me orchestrate subscriptions and models from
  Codex, Claude Code and Cursor side by side, with an elegant design, a GUI for every
  conversation, durable sessions, mobile clients and a built-in cloud environment. I needed an
  alternative within weeks, and my cloud environment had to move within days.

- **My attention became the bottleneck.** As more and heavier thinking, research and building
  ran through AI, I felt the limit of my own attention every time I had to tend to sessions.
  Many of those sessions were already orchestrators driving swarms of subagents; some were
  long-running loops that never stopped working. The next platform has to take over that
  orchestration and ask for my attention only when it is really needed.

- **Personal AI already changed my days, and it should not lock me in.** I have been using
  Muse, OpenAI Dots and the Grok bot, together with **Nowledge Mem**, where more
  than a year of knowledge and experience from every AI I use has compounded. They have given
  me real "aha" moments at work and in life. I want the same powers in my everyday workflow, for
  life and for work, and I want them model-agnostic and vendor-neutral: freedom to use whichever
  subscriptions and keys I have. Nowledge Mem already gives me that freedom for context: my
  context and my AI's identity are decoupled from any one model or platform.

## Imagine Ducter

- **You talk to one partner with a persona.** By default it is called Ducter, but anyone can
  rename it. Its identity (its card and persona context) is maintained by the system itself. A
  person can have more than one partner.

- **It runs anywhere:** in the cloud or on your own machines.

- **Most work is handed to a task** (early on I called it a Focus Window), which is what a
  developer would call a subagent. I want Ducter to work for people who have never heard of
  subagents, sessions or git worktrees. Technically a task is an agent session, and the partner
  carefully chooses its harness and model. You can zoom into any task and take control at any
  time, in a real GUI with an artifact sidebar and so on (think of a terminal multiplexer for
  agents, but fully graphical). Day to day it feels like talking to Muse or a chat bot, yet
  every background session is fully open to you whenever you want it. People like me, who
  steer a lot of work by hand, keep that control; for everyone else it stays optional.

- **It can act in the world:** computer use, browser use, phone use (virtual or physical) and
  phone calls, with durable context and credentials kept securely.

- **No lock-in.** The partner and every task are decoupled from your subscriptions, harnesses
  and models.

- **The partner's loop is an off-the-shelf harness**, with harness adapters that Ducter
  maintains. The adapters:

  - make the partner's session feel endless, while it stays good at juggling many tasks and an
    open-ended conversation with you. It should work the way a Slack thread does for a person:
    you don't read every message in a thread at first glance, you open it when you need it,
    and when the next turn is no longer about that thread, the prompt cache goes back to the
    main channel without the thread unfolded;
  - carefully maintain the partner's identity context, so that when you choose, say, Opus 5.5,
    the partner is simply Claude Code plus Ducter's adapter plus the context the adapter keeps
    (stored securely in Nowledge Mem);
  - adapt a harness loop that was never designed to be a long-lived assistant. For example,
    when a resumed session finds its cache expired, its history restarts from a sensible
    message in the main channel rather than from the very beginning plus a compaction. And, the
    way Muse does, the partner answers you first while its tasks start in parallel. All of this
    lives in the adapter (prompts, hooks and injections in each harness). These are only
    examples; how to turn a per-session harness into a sessionless partner needs careful
    research;
  - give the partner and its tasks ways to run long loops and to wait on conditions expressed
    in code or in plain language;
  - wire plugins and apps into the partner's and each task's harness properly.

- **The interface should feel nothing like a traditional "powerful AI" tool.** It is very
  simple, yet elegant and distinctive: you are just talking to a reliable partner who reports
  to you, and you can micro-manage whenever you need or want to. Landing in a task might look
  like a conductor-style view of agent sessions with artifacts and a browser window, or like
  sitting silently in on a phone call. For more control, there could be beautifully designed
  views and animation showing the progress of every task, or even world-class generative UI.

- **You can make your own apps:** small GUI apps built from code or generative UI, with agentic
  AI inside when they need it, as if by magic. The idea came to me on a flight from Shanghai to
  Tokyo with no internet, and I later found that Muse has something similar, called Muse Spaces.

- **A conductor-style view for heavy users.** Someone who wants more of a workbench can keep the
  partner in a floating window. It is an optional mode most people won't use.

- **Everywhere you are:** on the web, in a native mobile app and in a desktop app. Setting it up
  and adding a new machine should be extremely smooth, with no concepts to learn and nothing to
  get confused by.

- **Use what you already have, well:** Macs, Linux servers, Nowledge Mem, and edge services like
  Cloudflare Workers and R2, so that using AI to get things done feels seamless and efficient
  wherever you are.

## What to find out first

- The key design of the partner, so it can meet everything above.
- Whether a harness adapter over Claude Code, Codex, DeepSeek's harness and pi is feasible for
  the partner.
- Prototypes of the core screens and flows. The look should be modern and lovable: soft,
  puffy, matte clay shapes with rounded silhouettes, a warm and sunny palette, gentle depth
  from soft shadows, and calm, bouncy motion. Friendly like a toy, never childish, and quiet
  enough to live with all day.
- Whether [MyGo](https://github.com/egoist/mygo) plus Expo can be our client stack, and whether
  [OAR](https://github.com/botiverse/oar) plus the Nowledge bridge can serve as the harness layer
  and the control plane between them.
