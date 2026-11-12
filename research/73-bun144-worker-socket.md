# 73: A worker socket closed under Bun 1.4.4: re-entering the server's frame parser

Asked (2026-11-13): `packages/core/test/worker-mac-abilities.test.ts` (D234, D235: a Linux home
with a MacBook worker over the real `/worker` socket) passes 10/10 on Bun 1.3.1 and fails 6/10
on Bun 1.4.4, the Bun CI and releases use (`BUN_VERSION` in `.github/workflows/ci.yml` and
`release.yml`). The worker's socket closes, then every home call fails with "MacBook Pro is not
connected". Is it Ducter, the test, or Bun, and can it hit a real worker?

Tags: VERIFIED (measured here, macOS arm64), DOCUMENTED (Bun's source at the release tags,
read only through the GitHub API), INFERRED.

## 1. What closes, and when

- **The home closes it, not the MacBook.** The home's socket close handler gets code 1006 with
  reason "Received new message inside a fragmented message". The MacBook's frames are all
  well formed: a raw TCP server that does the handshake by hand and parses every byte the Bun
  1.4.4 client writes sees only `fin=1 op=1 masked=1` frames with the right lengths (VERIFIED).
  A raw TCP client writing the same frames to a bare `Bun.serve`, whole, one by one, or one byte
  at a time, never trips it (VERIFIED). So the bytes are fine and the parser state is not.
- **The close happens inside the test's own call stack.** A stack trace in the close handler
  ends at `await expect(call("phone_tap", { ref: 2 })).rejects` (VERIFIED). The sequence: the
  MacBook answers `screen` (frame 4); the home's message handler resolves the pending call; the
  test resumes in a microtask that is still inside that native handler; it calls `phone_tap`,
  which sends a request; `expect(pending).rejects` then runs the event loop synchronously until
  the promise settles; in that nested loop the MacBook's answer (frame 5) is read, and the
  parser for the same socket runs again before the outer one has finished frame 4.
- **First bad version: 1.4.4.** The file passes 10/10 on 1.3.14, 1.4.0, 1.4.1, 1.4.2 and
  1.4.3, and fails 6/10 on 1.4.4 (VERIFIED).

## 2. Why 1.4.4 and not before

Bun PR #45223 ("WebSocket: real closing handshake, one failure path…", in 1.4.4) changed the
interleaving check in `packages/bun-uws/src/WebSocketProtocol.h` `consumeMessage` (DOCUMENTED):

```cpp
// 1.4.3
if (wState->state.opStack == 1 || (!wState->state.lastFin && getOpCode(src) < 2))
// 1.4.4
if (wState->state.opStack == 1 || (getOpCode(src) < 3 && wState->state.opStack != -1))
```

`opStack` is pushed to 0 when a data frame starts and popped back to -1 only after
`handleFragment` (which calls the JS message handler) returns. A parse re-entered from inside the
handler sees `opStack == 0`. 1.4.3 looked at `lastFin`, already 1 for a complete frame, and let
the nested frame through; 1.4.4's stricter check fails the connection with
`FAIL_INTERLEAVED_MESSAGE` (DOCUMENTED, consistent with the measured close reason). The strict
check is right for a real peer; the bug is that the parser can be re-entered at all.

Why the earlier experiments missed it (INFERRED from the above): an in-process TCP proxy adds a
hop, so the answer is not yet at the home's socket during the nested loop; standalone repros
never ran the loop from inside a handler.

## 3. Can it hit a real worker

Re-entry needs something that runs the event loop synchronously inside a server WebSocket
handler (or a microtask it drains). In bun:test that is `expect(promise).rejects` / `.resolves`
on a pending promise. Product code does not import `bun:test`. The synchronous calls product
code does use don't run the loop: with a pending answer in flight, `Bun.spawnSync`,
`child_process.spawnSync`, `execSync` and `Bun.sleepSync` inside the handler's microtask all
leave the socket open and the next answer arrives normally (VERIFIED, `bun 1.4.4`, scratch
script). The real worker (`packages/cli/src/worker.ts`) is another process talking to the
home's `Bun.serve`; nothing there runs a nested loop. So production is not affected (INFERRED
from the mechanism, with the APIs above VERIFIED).

The other `/worker` tests pass on 1.4.4 because none of them awaits `expect(...).rejects` on a
call that starts inside a worker message handler and needs another worker frame to settle.

## 4. Minimal repro (for an upstream issue; not filed)

Save as `nested.test.ts`, run `bun test nested.test.ts`. Bun 1.4.3: 1 pass. Bun 1.4.4: the
server socket closes with 1006 "Received new message inside a fragmented message" and the test
times out waiting for "three".

```ts
// Bun 1.4.4 regression: a server WebSocket is failed with 1006 "Received new message inside a
// fragmented message" when the event loop runs synchronously from inside its message handler
// and the next frame from the same client is read meanwhile. The handler resolves a promise; the
// code awaiting it continues in a microtask (still inside the native handler), asks the client
// for more, and waits with expect(pending).rejects, which runs the event loop until it settles.
// Bun 1.4.3 and earlier: passes. Bun 1.4.4: the answer closes the socket.
import { expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";

test("a frame read while the server's message handler is still on the stack", async () => {
  let closed: [number, string] | undefined;
  let peer!: ServerWebSocket<unknown>;
  const waiting: ((s: string) => void)[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: (req, s) => (s.upgrade(req) ? undefined : new Response("no", { status: 400 })),
    websocket: {
      open: (ws) => void (peer = ws),
      message: (_ws, m) => void waiting.shift()?.(String(m)),
      close: (_ws, code, reason) => void (closed = [code, reason]),
    },
  });
  // The client answers every ask with "re <ask>".
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/`);
  ws.onmessage = (m) => ws.send(`re ${m.data}`);
  await new Promise((r) => (ws.onopen = r));
  const ask = (q: string) => new Promise<string>((res) => (waiting.push(res), peer.send(q)));

  expect(await ask("one")).toBe("re one");
  // We are now in a microtask inside the server's message handler for "re one".
  const two = ask("two").then((s) => Promise.reject(new Error(s)));
  await expect(two).rejects.toThrow("re two");
  expect(await ask("three")).toBe("re three");
  expect(closed).toBeUndefined();
  ws.close();
  server.stop(true);
}, 3000);
```

## Implications for Ducter

- Not a product bug: no workaround in `workers.ts` or the worker client.
- In tests that drive a real socket, await a tool call before asserting on its rejection
  (`expect(await rejection(p)).toMatch(…)`) instead of `await expect(p).rejects`, wherever the
  call can start inside a socket handler. `worker-mac-abilities.test.ts` does this now.
- Worth reporting upstream: a nested loop run from a handler re-enters the per-socket parser
  (since 1.4.4 it fails the connection; before it parsed nested frames out of order).

## Summary

Bun 1.4.4's uWS frame parser fails a connection when a data frame starts while `opStack` is not
-1. In the test, `await expect(pending).rejects` runs the event loop synchronously from inside
the home's `/worker` message handler, the next worker frame is parsed re-entrantly, and the home
closes the socket with 1006. Product code never runs the loop that way; the test now awaits its
calls before asserting, and passes 5/5 on 1.4.4 and on 1.3.1.
