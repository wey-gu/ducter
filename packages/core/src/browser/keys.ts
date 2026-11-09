// The keys a task (browser_press) or the live view (live_input key) can send, as CDP key events.
import type { LiveKey } from "@ducter/protocol";

export const KEYS: Record<LiveKey, { key: string; code: string; keyCode: number; text?: string }> = {
  Enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
  Tab: { key: "Tab", code: "Tab", keyCode: 9 },
  Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
  Delete: { key: "Delete", code: "Delete", keyCode: 46 },
  Escape: { key: "Escape", code: "Escape", keyCode: 27 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  Home: { key: "Home", code: "Home", keyCode: 36 },
  End: { key: "End", code: "End", keyCode: 35 },
  PageUp: { key: "PageUp", code: "PageUp", keyCode: 33 },
  PageDown: { key: "PageDown", code: "PageDown", keyCode: 34 },
  Space: { key: " ", code: "Space", keyCode: 32, text: " " },
};

export const isKey = (k: unknown): k is LiveKey => typeof k === "string" && Object.hasOwn(KEYS, k);

/** keyDown then keyUp for one key on a page session. */
export async function pressKey(send: (m: string, p: object) => Promise<unknown>, k: LiveKey, shift = false): Promise<void> {
  const d = KEYS[k];
  const base = { key: d.key, code: d.code, windowsVirtualKeyCode: d.keyCode, nativeVirtualKeyCode: d.keyCode, modifiers: shift ? 8 : 0 };
  await send("Input.dispatchKeyEvent", { type: d.text ? "keyDown" : "rawKeyDown", ...base, ...(d.text ? { text: d.text, unmodifiedText: d.text } : {}) });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}
