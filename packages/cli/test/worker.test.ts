import { describe, expect, test } from "bun:test";
import { systemdUnit } from "../src/remote.ts";
import { parseJoin } from "../src/worker.ts";

describe("worker", () => {
  test("parseJoin takes an address or the whole link", () => {
    expect(parseJoin("d.example.com")).toEqual({ base: "https://d.example.com" });
    expect(parseJoin("https://d.example.com/pair#c=K7QM-4XPA")).toEqual({ base: "https://d.example.com", code: "K7QM-4XPA" });
    expect(parseJoin("http://192.168.104.2:8080/")).toEqual({ base: "http://192.168.104.2:8080" });
    expect(parseJoin("127.0.0.1:7777")).toEqual({ base: "http://127.0.0.1:7777" });
    expect(parseJoin("wss://d.example.com/worker")).toEqual({ base: "https://d.example.com" });
  });

  test("a worker unit runs `ducter worker`, not the main process", () => {
    const u = systemdUnit({ execStart: ["/home/me/.local/bin/ducter"], dataDir: "/home/me/.ducter", path: "/usr/bin", port: 7777, worker: true });
    expect(u).toContain("Description=Ducter (worker)");
    expect(u).toContain("ExecStart=/home/me/.local/bin/ducter worker\n");
    expect(u).not.toContain("--headless");
  });
});
