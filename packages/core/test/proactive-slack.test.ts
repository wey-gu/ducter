// D230: on hel, Slack was looked at 110 times and gave nothing. OOMOL's slack.search_messages
// answers `matches` of { matchId, channelId, ts, userId, username, text, ... }: no mention or DM
// flag, so every match was dropped as "not addressed to you". And the window went as `after` and
// `limit`, fields the action doesn't have (it wants the window in the query, `count`). Shapes from
// the live action (types only); the people and words are made up.
import { expect, test } from "bun:test";
import { chatItem, itemsOf } from "../src/proactive/items.ts";
import { lookFor } from "../src/proactive/watch.ts";

const t = { connectionId: "c", source: "oo" as const, service: "slack", title: "Slack", me: ["wey"] };
const match = (channelId: string, ts: string) => ({ matchId: `m${ts}`, channelId, channelName: "x", ts, userId: "U0MIA", username: "mia", text: "Could you look at the deck?", permalink: "https://example.slack.com/p1", teamId: "T0", type: "message" });

test("Slack's search asks with the window in the query, by day, newest first", () => {
  const spec = lookFor("slack")!;
  const since = Date.parse("2026-11-12T09:00:00Z");
  const [input] = spec.inputs(since, since + 600_000, { action: "slack.search_messages" });
  expect(input).toEqual({ query: "to:me after:2026-11-11", count: 50, sort: "timestamp" });
});

test("a match in a D… channel is a DM; its author is the username; the thread is the channel", () => {
  const dm = chatItem(t, match("D0AB", "1794486113.874479"))!;
  expect(dm).toMatchObject({ dm: true, from: "mia", thread: "D0AB", subject: "Could you look at the deck?" });
  expect(dm.at).toBe(Math.round(1794486113.874479 * 1000));
  expect(chatItem(t, match("C0AB", "1794486114.1"))!.dm).toBeUndefined();
});

test("itemsOf reads the matches list", () => {
  const items = itemsOf(t, "chat", { query: "to:me", matches: [match("C0AB", "1.1"), match("D0AB", "1.2")], total: 2, pagination: {} });
  expect(items.map((i) => i.id)).toEqual(["1.1", "1.2"]);
});
