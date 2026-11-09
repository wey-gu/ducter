// A minimal WebSocket client (RFC 6455) for Chrome's DevTools endpoint on 127.0.0.1 (D150).
// Why not the global WebSocket: Bun 1.3's client offers permessage-deflate, Chrome accepts, and
// Bun then failed inflating some of Chrome's frames ("Invalid compressed data", code 1002), which
// closed the browser's socket mid-task (seen in bun test, 2026-11-10). This one never offers an
// extension: text frames only, client frames masked, fragments joined, pings answered.
import { connect, type Socket } from "node:net";
import { randomBytes } from "node:crypto";

export interface MiniWs {
  send(text: string): void;
  close(): void;
  onmessage?: (text: string) => void;
  onclose?: () => void;
}

export function openMiniWs(url: string, timeoutMs = 5_000): Promise<MiniWs | undefined> {
  const u = new URL(url);
  if (u.protocol !== "ws:") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const key = randomBytes(16).toString("base64");
    const sock: Socket = connect({ host: u.hostname, port: Number(u.port || 80) });
    let done = false;
    let open = false;
    let buf = Buffer.alloc(0);
    let parts: Buffer[] = [];
    const ws: MiniWs = {
      send(text) {
        if (!open) return;
        sock.write(frame(0x1, Buffer.from(text)));
      },
      close() {
        if (!open) return sock.destroy();
        open = false;
        try {
          sock.write(frame(0x8, Buffer.alloc(0)));
        } catch {
          /* gone */
        }
        sock.end();
        setTimeout(() => sock.destroy(), 500).unref?.();
      },
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    const finish = (v: MiniWs | undefined) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (!v) sock.destroy();
      resolve(v);
    };
    sock.on("connect", () => {
      sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    sock.on("error", () => finish(undefined));
    sock.on("close", () => {
      const was = open || done;
      open = false;
      finish(undefined);
      if (was) ws.onclose?.();
    });
    sock.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (!open) {
        const end = buf.indexOf("\r\n\r\n");
        if (end < 0) return;
        const head = buf.subarray(0, end).toString();
        buf = buf.subarray(end + 4);
        if (!/^HTTP\/1\.1 101/.test(head)) return finish(undefined);
        open = true;
        finish(ws);
      }
      for (;;) {
        if (buf.length < 2) return;
        const fin = (buf[0]! & 0x80) !== 0;
        const op = buf[0]! & 0x0f;
        let len = buf[1]! & 0x7f;
        let off = 2;
        if (len === 126) {
          if (buf.length < 4) return;
          len = buf.readUInt16BE(2);
          off = 4;
        } else if (len === 127) {
          if (buf.length < 10) return;
          len = Number(buf.readBigUInt64BE(2));
          off = 10;
        }
        const masked = (buf[1]! & 0x80) !== 0;
        const mask = masked ? buf.subarray(off, off + 4) : undefined;
        if (masked) off += 4;
        if (buf.length < off + len) return;
        let payload = Buffer.from(buf.subarray(off, off + len));
        buf = buf.subarray(off + len);
        if (mask) for (let i = 0; i < payload.length; i++) payload[i]! ^= mask[i % 4]!;
        if (op === 0x8) {
          ws.close();
          return;
        }
        if (op === 0x9) {
          sock.write(frame(0xa, payload));
          continue;
        }
        if (op === 0xa) continue;
        if (op === 0x1 || op === 0x2 || op === 0x0) {
          parts.push(payload);
          if (fin) {
            payload = Buffer.concat(parts);
            parts = [];
            ws.onmessage?.(payload.toString("utf8"));
          }
        }
      }
    });
  });
}

/** One client frame: FIN set, masked as RFC 6455 requires of clients. */
function frame(op: number, payload: Buffer): Buffer {
  const mask = randomBytes(4);
  const n = payload.length;
  const head = n < 126 ? Buffer.alloc(2) : n < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  head[0] = 0x80 | op;
  if (n < 126) head[1] = 0x80 | n;
  else if (n < 65536) (head[1] = 0x80 | 126), head.writeUInt16BE(n, 2);
  else (head[1] = 0x80 | 127), head.writeBigUInt64BE(BigInt(n), 2);
  const body = Buffer.alloc(n);
  for (let i = 0; i < n; i++) body[i] = payload[i]! ^ mask[i % 4]!;
  return Buffer.concat([head, mask, body]);
}
