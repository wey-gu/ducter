# 141: What Nowledge Mem's Connectors page really gives, and what `nmem connect` takes (D370)

The author pasted what Nowledge Mem gave him into D366's sign-in field on a lent computer (haswell)
and Ducter refused it: 「这不像 Nowledge Mem 的连接链接，它应该以 https:// 开头，带着 nmem_connect。
%!(EXTRA string=haswell)」. Two faults: D366 (and D225 on the home) asked for a bare link, but Mem now
gives a whole prompt; and the Mac app printed an extra argument after a sentence that has no blank.
This note records what Mem gives and what its command line accepts. Read-only: `--help`, `--dry-run
--skip-tools` with a made-up token against a scratch copy of the CLI (no credential redeemed, read or
written; the dry run only names the config path), Mem's public SKILL.md, and the binary read as a file.
The author's real token was never used or copied.

## 1. What Mem gives

- **F1 (the author's screenshot, VERIFIED by him).** Settings › Connectors › **Any AI agent** ›
  **Generate connect link & copy prompt** copies a prompt, not a link. Its shape:
  - Step 1: `POST <origin>/api/remote-access/redeem-connect-token`, `Content-Type:
    application/json`, `X-Nmem-Space-Protocol: exact-v1`, body `{"token":"nmem_ct_<64 hex>"}`;
    success is `{"api_key":"…","url":"<origin>"}`; 410 means ask for a fresh link. Single use, 15
    minutes.
  - Step 2: `nmem config client set --url <origin> --api-key <api_key from step 1>`, never printing
    the key; install `nmem` first if it isn't there.
  - Step 3: read `https://mem.nowledge.co/SKILL.md` and follow it.
  No `?nmem_connect=` link appears in it, so D225/D366's check (a URL with `nmem_connect`) refused it.
- **F2 (DOCUMENTED, SKILL.md "Path A", fetched 2026-11-18).** "The prompt carries a one-time connect
  link, or an origin plus a token and a redeem URL… If the prompt gave you the origin and the token as
  separate values, assemble `<origin>/app?nmem_connect=<token>` and run the same command"
  (`nmem connect "<link>"`). If the prompt says to redeem it yourself, the POST above is the same call,
  then `nmem connect --url <origin> --api-key <key>`. 410 means used, expired or never valid, by
  design indistinguishable; do not retry. A Cloud workspace link lasts 15 minutes, a desktop login
  link 60 seconds. "Do not fall back to a default address" (Path B, for a URL and key).

## 2. What the command line takes (nmem 0.10.120, PyPI wheel in the scratchpad; 0.10.119 the same)

- **F3 (VERIFIED, `nmem connect --help`).** `nmem connect [LINK]`: "a one-time login link
  (`…?nmem_connect=<token>`) or a workspace URL carrying a key (`…/connect?key=…`, `…?nmem_api_key=…`).
  Mutually exclusive with --url/--api-key." No flag or stdin form takes a bare token or a prompt. There
  is no `redeem` subcommand. `--dry-run` "does not redeem, so a one-time link survives".
- **F4 (VERIFIED, dry runs with a made-up `nmem_ct_` + 64 zeros).** For
  `https://cloud.nowledge.co/app?nmem_connect=<T>` and `https://cloud.nowledge.co/?nmem_connect=<T>`
  nmem says `server https://cloud.nowledge.co` and "would redeem at
  https://cloud.nowledge.co/api/remote-access/redeem-connect-token". For
  `https://example.invalid/prefix/app?nmem_connect=<T>` it says server `https://example.invalid/prefix`
  and redeems at `…/prefix/api/remote-access/redeem-connect-token`: it strips a trailing `/app` and keeps
  any path before it. So `<origin>/app?nmem_connect=<token>` redeems at exactly the prompt's POST URL.
  0.10.119 answers the same.
- **F5 (VERIFIED, `nmem config client set --help`).** `set [KEY] [VALUE]` or `--url` / `--api-key`;
  the key goes on argv. No stdin or file form. `NMEM_API_KEY` in the environment overrides the config
  per process (SKILL.md "What nmem connect does" 2) but `config client set` does not read it to store.
- **F6 (INFERRED, the binary's strings).** The redeem path is a literal `/api/remote-access/
  redeem-connect-token` joined to the server; the strings `/app?nmem_connect=` and `X-Nmem-Space-Protocol`
  are present; whether the redeem call itself carries `exact-v1` is not provable from strings.

## 3. Choosing the route

| Route | Token seen by | Key seen by | On argv | Verdict |
|---|---|---|---|---|
| A. Assemble `<origin>/app?nmem_connect=<token>`, run `nmem connect <link> --tool …` (Mem's own Path A) | Ducter (home → worker → nmem) | nmem only | the link, for the seconds the redeem takes | **chosen**: the key never passes through Ducter at all; one command does redeem, store, live check and plugin registration |
| B. Ducter POSTs the redeem itself, then `nmem config client set --url --api-key` | Ducter | Ducter, then nmem | the long-lived key | rejected: a long-lived secret in Ducter's memory and on argv (F5), and a second code path for what nmem already does |
| C. B with `NMEM_API_KEY` in the environment of `nmem connect --url` | Ducter | Ducter | nothing | rejected: still holds the key, and whether `connect` persists an env key is undocumented |

The token on argv (A) is what D366 already accepted: single use, 15 minutes, burned by that call.

**Bare token.** Only Mem's Cloud prompt carries `nmem_ct_` tokens in this shape (F1), so a token pasted
alone is redeemed at `https://cloud.nowledge.co`. This is a default address, which SKILL.md warns
against for URL-and-key pairs; for a single-use token the worst case is a 410 that asks for the whole
prompt. A token from a self-hosted Mem pasted alone would be sent to Mem Cloud, the same vendor; the
words ask for the whole prompt, which always carries its own origin.

**Plain http.** An origin over plain http is accepted only for this computer (127.0.0.1, localhost), as
D225's check already did; otherwise the token goes to Mem Cloud, never to a plain-http host.

## 4. The Mac's `%!(EXTRA …)`

- **F7 (VERIFIED, Go view tests).** `a.L.T("wmem.failed."+reason, name)` passed the computer's name to
  every reason; `bad_link`, `used`, `unsupported` and `failed` print no `%s`, so Go's `Sprintf` appended
  `%!(EXTRA string=haswell)`. A guard over every view test (an `OnExtraArg` hook beside the existing
  `OnEmptyArg`) found two more families with the same fault: `bridge.refused.unavailable` /
  `bridge.refused.unknown` (Settings › Talk with your other agents) and `result.acting.open_pr` (a task
  opening a draft PR). The web's `t()` never shows extras (it replaces blanks only).

## Implications for Ducter

1. Accept what Mem gives: the whole prompt, a bare token, or a link; make the link by code
   (`connectLinkFrom`, `packages/core/src/mem-cli.ts`) on the home and again on the worker, so an older
   worker takes it too. Junk is refused before anything runs.
2. Let `nmem connect` redeem: Ducter never sees the API key. Scrub tokens, links and key shapes from any
   line shown.
3. Words name Mem's real button and say to paste the whole thing; 410 says expired (15 minutes) or used
   with the way back (the box stays); 401/403 says Mem didn't accept it.
4. `T` in the Mac app drops extra arguments and the view tests fail on them; families keyed at run time
   use `TFamily`.

**Summary.** Mem's Connectors page copies a prompt (POST a `nmem_ct_` token, then store the key), not a
link. `nmem connect` takes only links, but Mem's own guide says to assemble `<origin>/app?nmem_connect=
<token>` from the prompt, and a dry run shows nmem redeems that at exactly the prompt's POST URL. So Ducter
extracts the token and origin and hands nmem the link; the API key never touches Ducter.
