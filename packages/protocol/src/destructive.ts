// D340: a card whose Go deletes, wipes or throws away never has Go as its default. Silence on such a
// card keeps things as they are (research/124 F1: a delete card about the person's own files defaulted
// to 「好，删掉」). Read from the card's own words (question and Go label), in any of the languages
// the partner writes cards in most; a card it misses still waits when the asker said it can't be undone.
const WORDS = [
  /\b(delete|deleting|deleted|erase|wipe|discard|destroy|purge|remove|removing|uninstall|rm\s+-rf?)\b/i,
  /(can'?t|cannot) be (undone|recovered|restored)|\bfor good\b|\bpermanently\b/i,
  /删|清空|清除|清掉|抹掉|丢掉|丢弃|扔掉|卸载|销毁|找不回|无法恢复|不能恢复|恢复不了|撤不回/,
];

/** Whether a card's words say its Go removes something. */
export function destructiveChoice(...texts: (string | undefined)[]): boolean {
  const all = texts.filter(Boolean).join("\n");
  return WORDS.some((re) => re.test(all));
}
