// An AI agent's clay coin (tools/art/coins.py, design/art/LOGOS.md): each agent Ducter knows
// has its own, an unknown one gets the generic clay token. The agent's name and model are always
// text beside it; the coin never says anything words don't.

/** How a coin moves (D77: clay may move, status and words never): a slow light over its rim while
 *  that agent is working, a small bob while it waits on you, still otherwise. Reduced motion: still. */
export type CoinMotion = "still" | "working" | "needs_you";

const COINS: Record<string, string> = {
  "claude-code": "claude_code",
  codex: "codex",
  pi: "pi",
  "deepseek-harness": "deepseek_harness",
};

/** Below this many CSS pixels a coin's print is a smudge: the plain body is shown. */
const PRINT_MIN = 32;

/** The coin's image for an agent at a size; off: signed out or not installed. */
export function coinSrc(harness: string, size: number, off = false): string {
  const id = COINS[harness];
  if (!id) return `app/art/${harness === "claude-code" ? "token_orange" : "token_ink"}.webp`;
  return `app/art/coin_${id}${off ? "_off" : size < PRINT_MIN ? "_plain" : ""}.webp`;
}

export function Coin({ harness, size, off = false, motion = "still" }: { harness: string; size: number; off?: boolean; motion?: CoinMotion }) {
  const known = harness in COINS;
  const m = off ? "still" : motion;
  return (
    <span class={`coin-art${known ? "" : " generic"}${off ? " off" : ""}${m !== "still" ? ` m-${m}` : ""}`} style={{ width: `${size}px`, height: `${size}px` }} aria-hidden="true">
      <img src={coinSrc(harness, size, off)} alt="" width={size} height={size} />
      {m === "working" && <img class="sheen" src="app/art/coin_sheen.webp" alt="" width={size} height={size} />}
    </span>
  );
}
