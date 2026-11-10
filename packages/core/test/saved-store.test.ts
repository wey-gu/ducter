// D191: Autofill's store: encrypted at rest with the key apart from it, never a secret in a view,
// the security code never kept, details split into readable and fill-only, uses recorded.
import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cardBrand, luhn, onSite, siteOf } from "@ducter/protocol/src/saved.ts";
import { fileKey, keychainKey, keySource, KEYCHAIN_SERVICE } from "../src/saved/key.ts";
import { openSaved, scrub } from "../src/saved/store.ts";
import { tempDir } from "./helpers.ts";

const PAN = "4242424242424242"; // Stripe's test Visa
const PASSWORD = "correct-horse-battery-staple-9";
const NOW = new Date("2026-11-11T09:00:00Z");

const open = (dir: string) => openSaved({ dataDir: dir, persona: "default", key: fileKey(join(dir, "saved")) });

describe("cards and sites", () => {
  test("Luhn, the network, the site", () => {
    expect(luhn(PAN)).toBe(true);
    expect(luhn("4242424242424241")).toBe(false);
    expect(cardBrand("5555555555554444")).toBe("mastercard");
    expect(cardBrand("378282246310005")).toBe("amex");
    expect(cardBrand("6200000000000005")).toBe("unionpay");
    expect(siteOf("https://www.GitHub.com/login?x=1")).toBe("github.com");
    expect(onSite("accounts.google.com", "google.com")).toBe(true);
    expect(onSite("google.com.evil.io", "google.com")).toBe(false);
    expect(onSite("github.com", "gist.github.com")).toBe(false);
  });
});

describe("the store", () => {
  test("encrypted at rest: neither the file nor the folder holds a secret in clear; key 0600", () => {
    const td = tempDir();
    const s = open(td.dir);
    s.put({ kind: "signin", site: "github.com", username: "ada@example.com", password: PASSWORD }, NOW);
    s.put({ kind: "card", name: "Ada Lovelace", number: "4242 4242 4242 4242", expMonth: 8, expYear: 29 }, NOW);
    s.put({ kind: "detail", values: { passport_number: "E12345678", seat: "window" } }, NOW);
    const file = readFileSync(join(td.dir, "saved", "default.enc"), "utf8");
    for (const secret of [PAN, PASSWORD, "E12345678", "ada@example.com", "window"]) expect(file).not.toContain(secret);
    expect(statSync(join(td.dir, "saved", "default.enc")).mode & 0o777).toBe(0o600);
    expect(statSync(join(td.dir, "saved", "key")).mode & 0o777).toBe(0o600);
    // Reopened from disk, with the same key: the same things.
    const again = open(td.dir);
    expect(again.view().items.map((x) => x.handle)).toEqual(["signin:github.com", "card:visa-4242"]);
    expect(again.secret("card:visa-4242", "number")).toBe(PAN);
    td.cleanup();
  });

  test("a view never carries a secret, and the security code is never kept", () => {
    const td = tempDir();
    const s = open(td.dir);
    s.put({ kind: "signin", site: "https://www.booking.com/sign-in", username: "ada@example.com", password: PASSWORD }, NOW);
    s.put({ kind: "card", name: "Ada Lovelace", number: PAN, expMonth: 8, expYear: 2029, cvc: "123" } as never, NOW);
    s.put({ kind: "detail", values: { name: "Ada Lovelace", passport_number: "E12345678", birthday: "1815-12-10", seat: "aisle" } }, NOW);
    const v = JSON.stringify(s.view());
    expect(v).not.toContain(PASSWORD);
    expect(v).not.toContain(PAN);
    expect(v).not.toContain("E12345678");
    expect(v).not.toContain("1815-12-10");
    expect(v).toContain("••4242");
    expect(v).toContain('"value":"Ada Lovelace"'); // a readable detail
    expect(v).toContain('"hint":"•••678"');
    expect(readFileSync(join(td.dir, "saved", "default.enc"), "utf8")).not.toContain("123\"");
    expect(() => s.secret("card:visa-4242", "cvc")).toThrow(/never kept/);
    const card = s.view().items.find((x) => x.kind === "card")!;
    expect(card).toMatchObject({ label: "Visa ••4242", last4: "4242", exp: "08/29", name: "Ada Lovelace" });
    expect(s.view().items[0]!.site).toBe("booking.com");
    td.cleanup();
  });

  test("checks what is saved: a wrong number, an expired card, a sign-in without its site", () => {
    const td = tempDir();
    const s = open(td.dir);
    expect(() => s.put({ kind: "card", name: "A", number: "4242424242424241", expMonth: 1, expYear: 30 }, NOW)).toThrow(/doesn't look right/);
    expect(() => s.put({ kind: "card", name: "A", number: PAN, expMonth: 10, expYear: 26 }, NOW)).toThrow(/expired/);
    expect(() => s.put({ kind: "card", name: "", number: PAN, expMonth: 10, expYear: 30 }, NOW)).toThrow(/name/);
    expect(() => s.put({ kind: "signin", site: "", username: "a", password: "b" }, NOW)).toThrow(/site/);
    expect(() => s.put({ kind: "signin", site: "x.com", username: "a" }, NOW)).toThrow(/password/);
    expect(() => s.put({ kind: "detail", values: { shoe: "42" } as never }, NOW)).toThrow(/unknown/);
    td.cleanup();
  });

  test("edit keeps the secret unless a new one is given; handles stay unique; remove", () => {
    const td = tempDir();
    const s = open(td.dir);
    const a = s.put({ kind: "signin", site: "github.com", username: "ada", password: PASSWORD }, NOW) as { id: string };
    const b = s.put({ kind: "signin", site: "github.com", username: "ada-work", password: "other-password-1" }, NOW) as { handle: string };
    expect(b.handle).toBe("signin:github.com#2");
    s.put({ kind: "signin", id: a.id, site: "github.com", username: "ada.l" }, NOW);
    expect(s.secret("signin:github.com", "password")).toBe(PASSWORD);
    expect(s.secret("signin:github.com", "username")).toBe("ada.l");
    s.remove(a.id);
    expect(s.resolve("signin:github.com")).toBeUndefined();
    expect(() => s.remove("nope")).toThrow(/nothing saved/);
    s.put({ kind: "detail", values: { seat: "window" } }, NOW);
    s.remove("me.seat");
    expect(s.view().details.find((d) => d.key === "seat")!.kept).toBe(false);
    td.cleanup();
  });

  test("first-use OKs per site, payments per site, the uses list, forgetting a site", () => {
    const td = tempDir();
    const s = open(td.dir);
    s.put({ kind: "signin", site: "github.com", username: "ada", password: PASSWORD }, NOW);
    s.put({ kind: "card", name: "Ada", number: PAN, expMonth: 8, expYear: 29 }, NOW);
    s.put({ kind: "detail", values: { passport_number: "E12345678", seat: "window" } }, NOW);
    expect(s.okOn("signin:github.com", "github.com")).toBe(false);
    expect(s.okOn("me.seat", "ana.co.jp")).toBe(true); // readable: no OK needed
    expect(s.okOn("me.passport_number", "ana.co.jp")).toBe(false);
    s.allow("signin:github.com", "github.com");
    s.allow("me.passport_number", "ana.co.jp");
    expect(s.okOn("signin:github.com", "github.com")).toBe(true);
    expect(s.okOn("me.passport_number", "ana.co.jp")).toBe(true);
    expect(s.okOn("me.passport_number", "evil.example")).toBe(false);
    expect(s.okOn("card:visa-4242", "shop.example")).toBe(false); // a card: every payment asks
    s.record({ handle: "signin:github.com", label: "github.com", site: "github.com", what: "filled", taskId: "t1", task: "Star the repo" });
    s.record({ handle: "signin:github.com", label: "github.com", site: "github.com", what: "filled", taskId: "t1", task: "Star the repo" });
    s.record({ handle: "card:visa-4242", label: "Visa ••4242", site: "shop.example", what: "approved", taskId: "t2", amount: "USD 12.00" });
    const uses = s.view().uses;
    expect(uses.map((u) => u.what)).toEqual(["approved", "filled"]); // newest first; two fills are one line
    expect(s.view().items.find((x) => x.kind === "signin")!.usedAt).toBeTruthy();
    const id = s.view().items.find((x) => x.kind === "signin")!.id;
    s.forgetSite(id, "github.com");
    expect(s.okOn("signin:github.com", "github.com")).toBe(false);
    td.cleanup();
  });

  test("scrub hides saved values, in the card's usual spacings too", () => {
    const td = tempDir();
    const s = open(td.dir);
    s.put({ kind: "signin", site: "github.com", username: "ada", password: PASSWORD }, NOW);
    s.put({ kind: "card", name: "Ada", number: PAN, expMonth: 8, expYear: 29 }, NOW);
    const text = `pw ${PASSWORD}; card 4242 4242 4242 4242 / 4242-4242-4242-4242 / ${PAN}; ends in 4242`;
    const out = scrub(text, s.scrubList());
    expect(out).not.toContain(PASSWORD);
    expect(out).not.toContain("4242 4242 4242 4242");
    expect(out).not.toContain(PAN);
    expect(out).toContain("ends in 4242");
    td.cleanup();
  });

  test("an empty store reads without making a key", () => {
    const td = tempDir();
    const s = open(td.dir);
    expect(s.view().items).toEqual([]);
    expect(s.scrubList()).toEqual([]);
    expect(() => statSync(join(td.dir, "saved", "key"))).toThrow();
    td.cleanup();
  });
});

describe("where the key lives", () => {
  test("under test, even on a Mac, a key file and never the keychain", () => {
    const td = tempDir();
    expect(keySource({ dataDir: td.dir, dir: join(td.dir, "saved"), platform: "darwin" }).keptIn).toBe("file");
    expect(keySource({ dataDir: td.dir, dir: join(td.dir, "saved"), platform: "darwin", env: {} }).keptIn).toBe("keychain");
    expect(keySource({ dataDir: td.dir, dir: join(td.dir, "saved"), platform: "darwin", env: { DUCTER_SAVED_KEY: "file" } }).keptIn).toBe("file");
    expect(keySource({ dataDir: td.dir, dir: join(td.dir, "saved"), platform: "linux", env: {} }).keptIn).toBe("file");
    td.cleanup();
  });

  test("the keychain: looked up by its service and an account per data folder, made once (a fake security)", () => {
    const calls: string[][] = [];
    let stored: string | undefined;
    const exec = (argv: string[]) => {
      calls.push(argv);
      if (argv[1] === "find-generic-password") return stored ? { code: 0, out: stored + "\n" } : { code: 44, out: "" };
      stored = argv[argv.indexOf("-w") + 1];
      return { code: 0, out: "" };
    };
    const k = keychainKey("/tmp/some-data", exec);
    expect(k.get(false)).toBeUndefined();
    const made = k.get(true)!;
    expect(made.length).toBe(32);
    expect(keychainKey("/tmp/some-data", exec).get(false)!.equals(made)).toBe(true);
    expect(calls[0]).toContain(KEYCHAIN_SERVICE);
    expect(calls[0]!.find((a) => a.startsWith("dataDir-"))).toMatch(/^dataDir-[0-9a-f]{16}$/);
  });
});
