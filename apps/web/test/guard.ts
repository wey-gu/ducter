// Preloaded for every `bun test` (bunfig.toml): copy drawn with an empty placeholder ("这是  上的
// 浏览器看到的网页") fails the test that drew it, right where it drew it; so does copy drawn with a
// placeholder left unfilled (「%s 要求修改」, D519). The desktop's twin is
// apps/desktop/internal/views/main_test.go.
import { guardEmptyArgs, guardMissingArgs } from "../src/i18n.ts";

guardEmptyArgs((key, arg) => {
  throw new Error(`copy drawn with an empty placeholder: ${key} (placeholder ${arg + 1}); fill it, or don't draw the line`);
});
// A test reading a template itself (comparing the words with the Mac's) is not drawing it: only a
// call from the client's own code is held to this.
const fromTest = () => {
  const lines = (new Error().stack ?? "").split("\n").slice(1);
  const caller = lines.find((l) => !l.includes("/src/i18n.ts") && !l.includes("/test/guard.ts"));
  return !!caller && /\/test\/[^/]+\.test\.tsx?/.test(caller);
};
guardMissingArgs((key, verbs, args) => {
  if (fromTest()) return;
  throw new Error(`copy drawn with a placeholder left unfilled: ${key} (prints ${verbs}, given ${args}); a raw %s would reach a person`);
});
