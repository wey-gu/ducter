// A small forward proxy on this Mac for the E2E VM (DUCTER_E2E_PROXY=1, scripts/e2e/linux.ts).
//
// On an IPv6-only network with 464XLAT (macOS shows the interface as CLAT46), this Mac reaches
// IPv4 hosts but the colima VM's IPv4 NAT does not: apt, npm and the browser download time out
// inside the VM (2026-11-11). The VM can still reach this Mac, so its traffic goes through here:
// CONNECT tunnels for https, plain forwarding for http. It listens on this Mac's loopback only:
// lima's host.lima.internal (192.168.5.2 in the VM) arrives at 127.0.0.1 here, so nothing on the
// network can use it. It lives for the length of one test run.
import { connect } from "node:net";
import { createServer, request } from "node:http";

export function startProxy(port: number): { stop: () => void } {
  const server = createServer((req, res) => {
    // Plain http: the request line carries the absolute URL.
    let url: URL;
    try {
      url = new URL(req.url ?? "");
    } catch {
      res.writeHead(400).end();
      return;
    }
    // One request per connection: a second request on a kept-alive client socket stalls under
    // Bun's node:http (apt stopped after a few files, 2026-11-11), so both sides are told to close.
    const headers = { ...req.headers, connection: "close" };
    delete headers["proxy-connection"];
    delete headers["keep-alive"];
    const up = request({ host: url.hostname, port: url.port || 80, path: url.pathname + url.search, method: req.method, headers, agent: false }, (r) => {
      const h = { ...r.headers, connection: "close" };
      delete h["keep-alive"];
      res.writeHead(r.statusCode ?? 502, h);
      r.pipe(res);
      r.on("end", () => req.socket.end());
    });
    up.on("error", () => (res.headersSent ? res.destroy() : res.writeHead(502).end()));
    req.pipe(up);
  });
  server.on("connect", (req, client, head) => {
    const [host, p] = (req.url ?? "").split(":");
    const up = connect(Number(p) || 443, host, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) up.write(head);
      up.pipe(client);
      client.pipe(up);
    });
    const end = () => {
      up.destroy();
      client.destroy();
    };
    up.on("error", end);
    client.on("error", end);
  });
  server.listen(port, "127.0.0.1");
  return { stop: () => server.close() };
}

if (import.meta.main) {
  const port = Number(process.argv[2] ?? 47999);
  startProxy(port);
  console.log(`proxy on :${port}`);
}
