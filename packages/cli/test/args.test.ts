import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/args.ts";

const ok = (argv: string[]) => {
  const r = parseArgs(argv);
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r.error)}`);
  return r.args;
};
const err = (argv: string[]) => {
  const r = parseArgs(argv);
  if (r.ok) throw new Error("expected an error");
  return r.error;
};

describe("parseArgs", () => {
  test("no command means up, with the desktop", () => {
    expect(ok([])).toEqual({ command: "up", desktop: true, json: false });
  });

  test("each command", () => {
    for (const c of ["up", "open", "doctor", "status", "version", "help"] as const) expect(ok([c]).command).toBe(c);
  });

  test("aliases", () => {
    expect(ok(["--version"]).command).toBe("version");
    expect(ok(["-v"]).command).toBe("version");
    expect(ok(["-h"]).command).toBe("help");
    expect(ok(["start"]).command).toBe("up");
    expect(ok(["status", "--help"]).command).toBe("help");
  });

  test("options in either position and form", () => {
    expect(ok(["up", "--port", "7783", "--no-desktop"])).toEqual({ command: "up", port: 7783, desktop: false, json: false });
    expect(ok(["--port=7783", "status", "--json"])).toMatchObject({ command: "status", port: 7783, json: true });
    expect(ok(["-p", "1"]).port).toBe(1);
    expect(ok(["up", "--data-dir", "/tmp/d"]).dataDir).toBe("/tmp/d");
    expect(ok(["up", "--data-dir=/tmp/x y"]).dataDir).toBe("/tmp/x y");
  });

  test("bad ports", () => {
    expect(err(["--port", "0"])).toEqual({ key: "err.badPort", vars: { value: "0" } });
    expect(err(["--port", "65536"]).key).toBe("err.badPort");
    expect(err(["--port", "77a"]).key).toBe("err.badPort");
    expect(err(["--port=-1"]).key).toBe("err.badPort");
  });

  test("missing values", () => {
    expect(err(["--port"])).toEqual({ key: "err.missingValue", vars: { flag: "--port" } });
    expect(err(["--data-dir", "--json"]).key).toBe("err.missingValue");
  });

  test("unknown commands and flags", () => {
    expect(err(["launch"])).toEqual({ key: "err.unknownCommand", vars: { cmd: "launch" } });
    expect(err(["up", "status"]).key).toBe("err.unknownCommand");
    expect(err(["--verbose"])).toEqual({ key: "err.unknownFlag", vars: { flag: "--verbose" } });
  });
});
