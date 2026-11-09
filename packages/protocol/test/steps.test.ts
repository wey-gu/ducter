// A tool call as one step line (D127): every harness's tools land on the same kinds. The desktop
// (apps/desktop/internal/views/steps_test.go) passes the same cases (fixtures/steps.json).
import { expect, test } from "bun:test";
import cases from "../fixtures/steps.json";
import { keyCombo, mainCommand, stepOf, unwrapShell } from "../src/steps.ts";

for (const c of cases) {
  test(`${c.harness} ${c.tool.name} ${JSON.stringify(c.tool.input).slice(0, 60)}`, () => {
    expect(stepOf(c.harness, c.tool)).toEqual(c.want as never);
  });
}

test("shell wrappers and preambles go", () => {
  expect(unwrapShell(`/bin/zsh -lc "echo \\"hi\\""`)).toBe(`echo "hi"`);
  expect(mainCommand("cd x && FOO=1 sudo make build")).toEqual(["make", "build"]);
  expect(keyCombo("cmd+shift+4")).toBe("⌘⇧4");
  expect(keyCombo(["ctrl", "return"])).toBe("⌃Return");
});
