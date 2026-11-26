# Sign in with a one-time code (D599)

A task's work sometimes needs a CLI signed in on the computer it runs on: `gh auth login` on
haswell before it can clone a private repository, `codex login --device-auth` on a server,
`az login --use-device-code`. These print a page and a one-time code; the person opens the page
anywhere, enters the code and confirms; the command, waiting in the background, finishes. This
note is how that reaches the person and how it ends. The decision is D599.

## The moment

**Who:** the heavy developer whose tasks sign CLIs in on a server or a worker; the consumer whose
errand needs a GitHub or Microsoft sign-in; the fresh user, who has never heard of a device code.

**Before D599** a task wrote the page and the code into its question, and every client drew that
as the card's title: 「请打开 https://github.com/login/device，输入设备码 8694-B656 并在 GitHub 网页上授权。
完成后请回复「已授权」。」 with 好，继续. The person could not click the link or copy the code (on the
Mac the title wasn't even selectable), then had to type a word that only stood for something the
machine could see itself; tapping 好，继续 too early made the task ask again.

**After:** one tap opens the page with the code already copied; the card turns into
**已登录 GitHub / Signed in to GitHub** by itself and the task goes on. 好用, 顺滑, 放心 (how long
the code still works, and one way on once it ran out).

## The card

| State | What it shows |
|---|---|
| Waiting | **登录 {service}**; **打开 {service} 的页面，填入这个码。登好了我会自己看到，不用回我。**; the code large in mono on the sunken well with **复制** (`codeToCopy` / `CodeToCopy`); **打开 {service}** where Go stands, then 先不用 and 回复… as on every ask (D482); the wait, alive (D425): **等你在 {service} 上确认**, **这个码还能用 {n} 分钟** |
| Copied | the Copy button says **已复制** for a moment (Open copies first too) |
| Ran out | **这个码过期了。再要一个，我接着等你。**; the code faded and struck through, no Copy; **再要一个码** where Open stood |
| Seen through | **已登录 {service}** with the drawn check |

No default, never 晚点再问我 (the code runs out), never answered for the person (D499). In the
conversation the partner's own word stands above the card, as for every ask (D129). On a phone,
Open is a link to a new window, which the iPhone app's shell opens in Safari.

## How it ends

Ducter runs the CLI's own status command where the task runs (its computer and folder, through the
same checks a wait uses), every 5 seconds until the code runs out or the card closes:

| CLI | Service | Status command | Signed in when |
|---|---|---|---|
| `gh` | GitHub | `gh auth status` | exit 0 |
| `codex` | ChatGPT | `codex login status` | exit 0 |
| `claude` | Claude | `claude auth status` | `loggedIn` is true |
| `az` | Microsoft | `az account show` | exit 0 |
| `gcloud` | Google Cloud | `gcloud auth list --filter=status:ACTIVE --format=value(account)` | an account is listed |
| `wrangler` | Cloudflare | `wrangler whoami` | it says "You are logged in" |

The table is code's (`packages/protocol/src/device-signin.ts`), never the task's words; the
checks allow exactly these reading forms. The exits and words are INFERRED from each CLI's
documentation (`todo.md` holds the live check). When the command says signed in, the card settles
(`decision_resolved` by "ended", `settled`, `signedIn`) and the task hears it: in the call it waits
in, or as Ducter's message. A CLI not in the table is settled by the task's own word
(`sign_in_with_code` with `signed_in`) once its command ends and D515 wakes it.

**再要一个码** tells the task the code ran out and to run the sign-in again; the new code takes the
old card's place.

## How a card is asked for

- **The task tool** `sign_in_with_code` (url, code, service, cli, minutes, signed_in): puts the card
  up and waits in the call as `ask_for_key` does (D233); returns signed in, or "end your turn, you'll
  be resumed". Its description and the brief say: never the link or code in words, never ask the
  person to reply that they did it.
- **The runner's recognizer** for the common CLIs' own lines: a `needs_input` question (or its
  summary, when it has none) holding a sign-in page of GitHub, OpenAI, Microsoft, Google, Anthropic
  or Cloudflare and the code beside it gets the same card. It reads a page address and a code's
  shape, never what a sentence means (principle 21). The question's words are not shown on that card.

## Every ask's words

Apart from sign-ins, a task's question may hold a link or a command. Every ask's words are now
selectable, a link opens the browser, and a code (in backticks, or a one-time code as CLIs print
it) is its own piece on the inline code tint with the drawn copy mark: one click copies it and
says so (`askText` / `AskText`, cut by `packages/protocol/src/ask-text.ts`). The card's own titles
(a key, a payment, a where) stay plain.
