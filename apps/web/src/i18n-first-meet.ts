// D451: 第一次 / The first time, one line in the partner's own words under a thing it can't say
// for itself. The same keys and words as the Mac (apps/desktop/internal/i18n/firstmeet.go);
// apps/web/test/first-meet.test.ts keeps them equal. Read by naive raters (research/196).
export const firstMeetWords: { zh: Record<string, string>; en: Record<string, string> } = {
  zh: {
    "first.loop": "它会一直按时跑。停了我会让它接着跑，跑不了会在这里告诉你。",
    "first.find": "这是我从你那句话里读出来的。点掉一个，就不按它找了。",
    "first.look": "给你之前，我请另一个 AI 对着你的话看过一遍。改好的不再提，这里是还没改好的。",
    "first.pages": "我做的文档，会一页一页看过再给你。这里是还没改好的。",
  },
  en: {
    "first.loop": "It keeps running on time. If it stops, I start it again; if it can't run, I tell you here.",
    "first.find": "This is what I read from your words. Tap one away to stop finding by it.",
    "first.look": "Before it reached you, I had another AI check it against your words. What got fixed isn't shown; this is what's left.",
    "first.pages": "I look at every page of a file I make before you get it. This is what's still off.",
  },
};
