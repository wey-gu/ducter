// research/124: a connect that failed showed `Couldn't connect: {"error":"…"}` on the pane.
import { expect, test } from "bun:test";
import { detailIn } from "../src/bridge-link.ts";

test("a failed nmem answer in JSON shows its words, never its braces", () => {
  expect(detailIn('{\n  "error": "not_found",\n  "id": "x"\n}\n', "")).toBe("not found");
  expect(detailIn("", '{"error":"blocked here"}')).toBe("blocked here");
  expect(detailIn('{"message":"Space is read-only"}', "")).toBe("Space is read-only");
  expect(detailIn('{"error":{"message":"quota reached"}}', "")).toBe("quota reached");
  expect(detailIn('{"detail":"Mem said no"}', "")).toBe("Mem said no");
  expect(detailIn("", "plain words\n")).toBe("plain words");
});
