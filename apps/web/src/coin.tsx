// An AI agent's clay coin (tools/art/coins.py, D183): the agent's own mark sculpted as a small clay
// object (Claude Code's starburst, Codex's cloud, DeepSeek's whale, pi's blocks); an unknown agent
// gets the generic clay token. The agent's name and model are always text beside it; the coin
// never says anything words don't.

/** How a coin moves (D77: clay may move, status and words never): a gentle rock on its base while
 *  that agent is working, a small bob while it waits on you, still otherwise. Reduced motion: still. */
export type CoinMotion = "still" | "working" | "needs_you";

const COINS: Record<string, string> = {
  "claude-code": "claude_code",
  codex: "codex",
  pi: "pi",
  "deepseek-harness": "deepseek_harness",
};

/** The coin's image for an agent; off: signed out or not installed (the same object in grey clay).
 *  A sculpted mark reads at every size, so the size doesn't pick the image. */
export function coinSrc(harness: string, off = false): string {
  const id = COINS[harness];
  if (!id) return "app/art/token_ink.webp";
  return `app/art/coin_${id}${off ? "_off" : ""}.webp`;
}

export function Coin({ harness, size, off = false, motion = "still" }: { harness: string; size: number; off?: boolean; motion?: CoinMotion }) {
  const known = harness in COINS;
  const m = off ? "still" : motion;
  return (
    <span class={`coin-art${known ? "" : " generic"}${off ? " off" : ""}${m !== "still" ? ` m-${m}` : ""}`} style={{ width: `${size}px`, height: `${size}px` }} aria-hidden="true">
      <img src={coinSrc(harness, off)} alt="" width={size} height={size} />
    </span>
  );
}
