// D371: DeepSeek Harness's sign-ins, read from its own credential file by presence only, and the
// model route each one runs (research/140).
import { expect, test } from "bun:test";
import { dshAppPaths, dshCredentialsFile, dshModel, dshSignIns } from "../src/dsh.ts";

// The shape DeepSeek Harness.app 0.2.2-rc.3 writes (values replaced; research/140 §3).
const BOTH = [
  "version: 1",
  "refs:",
  "  DEEPSEEK_API_KEY: sk-not-a-real-key",
  "records:",
  "  client-connection/browser-session:",
  "    kind: plain",
  "    payload:",
  "      version: 1",
  "      secret: not-real",
  "  deepseek-account-platform/device:",
  "    kind: plain",
  "    payload:",
  "      id: not-real",
  "  deepseek-account-platform/default:",
  "    kind: grant",
  "    payload:",
  "      version: 1",
  "      token: not-a-real-token",
  "      issuer: https://platform.deepseek.com",
  "",
].join("\n");

test("a key, an account, both or neither", () => {
  expect(dshSignIns(BOTH)).toEqual({ key: true, account: true });
  expect(dshSignIns(BOTH.replace(/^ {2}DEEPSEEK_API_KEY.*\n/m, ""))).toEqual({ key: false, account: true });
  // Signed out in the app: the grant is gone, the device record stays.
  expect(dshSignIns(BOTH.replace(/ {2}deepseek-account-platform\/default:[\s\S]*$/, ""))).toEqual({ key: true, account: false });
  // A token line under another record is not the account's.
  expect(dshSignIns("records:\n  other/default:\n    payload:\n      token: x\n  deepseek-account-platform/default:\n    kind: grant\n")).toEqual({ key: false, account: false });
  expect(dshSignIns(undefined)).toEqual({ key: false, account: false });
  expect(dshSignIns("refs:\n  DEEPSEEK_API_KEY:\n")).toEqual({ key: false, account: false });
});

test("the route: the key's, or the account's when only the account is signed in", () => {
  expect(dshModel("deepseek-flash", false)).toBe("deepseek-official/deepseek-flash");
  expect(dshModel("deepseek-flash", true)).toBe("deepseek-account/deepseek-flash");
  expect(dshModel("deepseek-official/deepseek-v4-pro", true)).toBe("deepseek-account/deepseek-v4-pro");
  expect(dshModel("deepseek-official/deepseek-v4-pro", false)).toBe("deepseek-official/deepseek-v4-pro");
  expect(dshModel("moonshot/kimi", true)).toBe("moonshot/kimi");
  expect(dshModel(undefined, false)).toBeUndefined();
  expect(dshModel(undefined, true)).toBe("deepseek-account/deepseek-flash");
});

test("where its files are", () => {
  expect(dshCredentialsFile({}, "/Users/w")).toBe("/Users/w/.dsh/.credentials.yaml");
  expect(dshCredentialsFile({ DSH_HOME: "/x" }, "/Users/w")).toBe("/x/.credentials.yaml");
  expect(dshAppPaths("/Users/w")).toEqual(["/Applications/DeepSeek Harness.app", "/Users/w/Applications/DeepSeek Harness.app"]);
});
