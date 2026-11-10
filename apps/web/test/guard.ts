// Preloaded for every `bun test` (bunfig.toml): copy drawn with an empty placeholder ("这是  上的
// 浏览器看到的网页") fails the test that drew it, right where it drew it. The desktop's twin is
// apps/desktop/internal/views/main_test.go.
import { guardEmptyArgs } from "../src/i18n.ts";

guardEmptyArgs((key, arg) => {
  throw new Error(`copy drawn with an empty placeholder: ${key} (placeholder ${arg + 1}); fill it, or don't draw the line`);
});
