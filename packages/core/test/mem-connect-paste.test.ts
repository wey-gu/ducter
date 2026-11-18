// D370: what the person pastes from Nowledge Mem's Connectors page is a whole prompt (a token, the
// POST that redeems it, the nmem line that stores the key), not a bare link. The link `nmem connect`
// takes is made from it by code. Every token here is made up.
import { describe, expect, test } from "bun:test";
import { connectLinkFrom, connectLinkOk, MEM_CLOUD } from "../src/mem-cli.ts";

const TOKEN = `nmem_ct_${"0123456789abcdef".repeat(4)}`;

/** The prompt Mem copies (Settings › Connectors › Any AI agent › Generate connect link & copy prompt). */
const prompt = (origin = "https://cloud.nowledge.co", token = TOKEN) => `Connect Nowledge Mem for this AI tool.

Step 1: Redeem the one-time connect link (single use, expires in 15 minutes):
POST ${origin}/api/remote-access/redeem-connect-token
Content-Type: application/json
X-Nmem-Space-Protocol: exact-v1
Body: {"token":"${token}"}
A successful response looks like {"api_key":"…","url":"${origin}"}. On 410, ask me for a fresh connect link.

Step 2: Store the credential (never print, quote, or echo the api_key):
If the nmem command already exists on this machine, skip straight to the config line below. Otherwise install it: on a desktop, the Nowledge Mem app; on a server, \`pipx install nmem-cli\`.
nmem config client set --url ${origin} --api-key <api_key from step 1>

Step 3: Read https://mem.nowledge.co/SKILL.md and follow the instructions to install or update Nowledge Mem for this AI tool.`;

describe("D370 the link from what Mem copies", () => {
  test("the whole prompt: the token at the POST line's Mem", () => {
    const l = connectLinkFrom(prompt());
    expect(l).toBe(`https://cloud.nowledge.co/app?nmem_connect=${TOKEN}`);
    expect(connectLinkOk(l!)).toBe(true);
  });

  test("a self-hosted Mem under a path: that origin, path kept (nmem redeems at <origin>/api/…)", () => {
    expect(connectLinkFrom(prompt("https://mem.example.com/mem"))).toBe(`https://mem.example.com/mem/app?nmem_connect=${TOKEN}`);
  });

  test("the prompt flattened onto one line (a single-line box drops the newlines)", () => {
    expect(connectLinkFrom(prompt("https://mem.example.com").replace(/\n/g, " "))).toBe(`https://mem.example.com/app?nmem_connect=${TOKEN}`);
  });

  test("no POST line: the --url of the config line", () => {
    const only = `nmem config client set --url https://mem.example.org --api-key <key>\nBody: {"token":"${TOKEN}"}`;
    expect(connectLinkFrom(only)).toBe(`https://mem.example.org/app?nmem_connect=${TOKEN}`);
  });

  test("a bare token: Mem Cloud's", () => {
    expect(connectLinkFrom(`  ${TOKEN}\n`)).toBe(`${MEM_CLOUD}/app?nmem_connect=${TOKEN}`);
  });

  test("the older link shapes go through as they are", () => {
    const old = `https://cloud.nowledge.co/app?nmem_connect=${TOKEN}`;
    expect(connectLinkFrom(old)).toBe(old);
    expect(connectLinkFrom(`here: ${old}.`)).toBe(old);
    expect(connectLinkFrom("https://mem.example.com/connect?key=abc")).toBe("https://mem.example.com/connect?key=abc");
  });

  test("a plain-http Mem other than this computer is never trusted with the token: Mem Cloud's instead", () => {
    expect(connectLinkFrom(prompt("http://evil.example"))).toBe(`${MEM_CLOUD}/app?nmem_connect=${TOKEN}`);
    expect(connectLinkFrom(prompt("http://127.0.0.1:14242"))).toBe(`http://127.0.0.1:14242/app?nmem_connect=${TOKEN}`);
  });

  test("junk: nothing", () => {
    for (const j of ["", "   ", "just some words", "https://mem.nowledge.co/SKILL.md", "nowledgemem://login?x=1", "nmem_ct_", "POST https://cloud.nowledge.co/api/remote-access/redeem-connect-token"]) expect(connectLinkFrom(j)).toBeUndefined();
  });
});
