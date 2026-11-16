// D310: a computer's name as a person reads it (fixtures/computer-name.json, shared with the Go
// twin in apps/desktop/internal/computer).
import { describe, expect, test } from "bun:test";
import cases from "../fixtures/computer-name.json" with { type: "json" };
import { computerName, sameComputer } from "../src/computer-name.ts";

describe("computer name", () => {
  test("a host name loses its DNS domain; a chosen name stays", () => {
    for (const [raw, want] of cases.name) expect({ raw, got: computerName(raw!) }).toEqual({ raw, got: want });
  });
  test("two names of one computer", () => {
    for (const [a, b, want] of cases.same) expect({ a, b, same: sameComputer(a as string, b as string) }).toEqual({ a, b, same: want as boolean });
  });
});
