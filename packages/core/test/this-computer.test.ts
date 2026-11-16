// D310: the name this computer goes by when the person gave Ducter none.
import { describe, expect, test } from "bun:test";
import { thisComputer } from "../src/this-computer.ts";

describe("this computer's name (D310)", () => {
  test("the Mac's Computer Name first, else the host name without its domain", () => {
    expect(thisComputer(undefined, { mac: () => "Wey’s MacBook Pro", hostname: () => "Mac.lan" })).toBe("Wey’s MacBook Pro");
    expect(thisComputer(undefined, { mac: () => undefined, hostname: () => "Mac.lan" })).toBe("Mac");
    expect(thisComputer(undefined, { mac: () => undefined, hostname: () => "hel.example.com" })).toBe("hel");
    expect(thisComputer(undefined, { mac: () => undefined, hostname: () => "" })).toBe("localhost");
  });
  test("a name given wins, read the same way", () => {
    expect(thisComputer("studio.lan")).toBe("studio");
    expect(thisComputer("Wey's Mac")).toBe("Wey's Mac");
  });
  test("whatever this machine is, never a DNS domain", () => {
    expect(thisComputer()).not.toMatch(/\.(lan|local|home|internal|com)$/i);
  });
});
