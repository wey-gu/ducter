// The Isles (D81), as the Devices view and the site draw them: a sky over a hazy horizon, a clay
// sea, every computer on its own island, plank bridges from home. Two scenes use it:
// 4 · the hand-off: the AI agents' coins peel off Ducter together and fly, with the equip's
//     peel → arc → snap, to the islands they're signed in on; each lands with a squash and
//     sparkles, its sheen starts (D146: working), parcels start crossing the bridges and the
//     planks light under them. Everything starts at once: the agents work in parallel.
// 9 · the whole world: the iPhone's island rises and the phone drops on, under the tagline.
import type { ReactNode } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useCopy } from "../copy";
import { C } from "../theme";
import { Art, Fill, Headline, Sparkles, Tag, clamp, easeOut, useSpring, useSquare, useT } from "../ui";

type Pt = { x: number; y: number };
const HZ = 360; // the horizon, in the 1920×1080 design space

const LAYOUT = {
  wide: { home: { x: 960, y: 690 }, mini: { x: 320, y: 610 }, cloud: { x: 1600, y: 610 }, phone: { x: 960, y: 450 }, scale: 1.06, top: 10 },
  square: { home: { x: 960, y: 630 }, mini: { x: 560, y: 900 }, cloud: { x: 1360, y: 900 }, phone: { x: 960, y: 430 }, scale: 0.74, top: 30 },
};

const Sea = () => {
  const frame = useCurrentFrame();
  const clouds = [[300, 190, 380], [820, 130, 300], [1340, 210, 420], [1760, 150, 280]];
  return (
    <>
      <div style={{ position: "absolute", left: -900, right: -900, top: -900, bottom: -1200, background: `linear-gradient(${C.skyTop} 0px, ${C.skyTop} 900px, ${C.sky} ${900 + HZ * 0.7}px, ${C.haze} ${900 + HZ - 2}px, ${C.seaFar} ${900 + HZ + 6}px, ${C.sea} ${900 + HZ + 380}px, ${C.seaNear} ${900 + 1080}px, ${C.seaNear} 100%)` }} />
      {clouds.map(([x, y, w], i) => (
        <div key={i} style={{ position: "absolute", left: x - w / 2 + Math.sin(frame / 90 + i) * 30, top: y, width: w, height: w * 0.28, borderRadius: "50%", background: "radial-gradient(closest-side, #FFFDF8, rgba(255,253,248,0.6) 55%, rgba(255,253,248,0))" }} />
      ))}
      <div style={{ position: "absolute", left: -600, right: -600, top: HZ - 18, height: 36, background: "radial-gradient(closest-side, #FFF6EA, rgba(255,246,234,0))" }} />
      {Array.from({ length: 22 }, (_, i) => {
        const gx = ((i * 0.381 + 0.07) % 1) * 2400 - 240, gy = HZ + 30 + ((i * 0.617 + 0.13) % 1) * 1000;
        const d = Math.min(1, (gy - HZ) / 780);
        const w = 30 + 60 * d;
        return <div key={i} style={{ position: "absolute", left: gx - w / 2 + Math.sin(frame / 30 + i) * 10 * (0.4 + d), top: gy, width: w, height: w * 0.12, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(255,255,250,0.9), rgba(255,255,250,0))", opacity: 0.45 + 0.35 * Math.sin(frame / 18 + i * 1.7) }} />;
      })}
    </>
  );
};

const Island = ({ at, w, big, children, rise = 1 }: { at: Pt; w: number; big?: boolean; children?: ReactNode; rise?: number }) => {
  const frame = useCurrentFrame();
  const h = big ? w * (614 / 1280) : w * (754 / 1280);
  const dy = Math.sin(frame / 26 + at.x) * 4 + (1 - rise) * 120;
  return (
    <div style={{ opacity: Math.min(1, rise * 1.6) }}>
      <div style={{ position: "absolute", left: at.x - w * 0.62, top: at.y + h * 0.36, width: w * 1.24, height: h * 0.5, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(255,255,255,0.45), rgba(255,255,255,0))" }} />
      <div style={{ position: "absolute", left: at.x - w * 0.42, top: at.y + h * 0.5, width: w * 0.84, height: h * 0.16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.7)" }} />
      <div style={{ position: "absolute", left: at.x - w / 2, top: at.y - h / 2 + dy, width: w, height: h }}>
        <Art src={big ? "clay/island_big.png" : "clay/island_small.png"} style={{ width: "100%" }} />
      </div>
      <div style={{ position: "absolute", left: at.x, top: at.y + dy }}>{children}</div>
    </div>
  );
};

const sag = (t: number) => Math.sin(t * Math.PI) * 26;

/** A plank and rope bridge from home; planks glow warm where a parcel is crossing. */
const Bridge = ({ from, to, show = 1, lit = [] }: { from: Pt; to: Pt; show?: number; lit?: number[] }) => {
  const n = 22;
  const dx = to.x - from.x, dy = to.y - from.y;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const planks = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (t > show) break;
    const glow = Math.max(0, ...lit.map((p) => 1 - Math.abs(p - t) * 7));
    planks.push(
      <div key={i} style={{ position: "absolute", left: from.x + dx * t - 7, top: from.y + dy * t + sag(t) - 16, width: 14, height: 32, borderRadius: 3, background: glow > 0 ? `color-mix(in srgb, #FFE2A8 ${Math.round(glow * 100)}%, ${C.plank})` : C.plank, boxShadow: `0 3px 0 ${C.plankDark}${glow > 0 ? `, 0 0 ${16 * glow}px rgba(255,214,140,${0.8 * glow})` : ""}`, transform: `rotate(${ang}deg)` }} />,
    );
  }
  return (
    <>
      <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={1} height={1}>
        {[-18, 18].map((o) => (
          <path key={o} d={`M ${from.x} ${from.y + o * 0.6 - 14} Q ${(from.x + to.x) / 2} ${(from.y + to.y) / 2 + 52 + o * 0.6 - 14} ${from.x + dx * show} ${from.y + dy * show + o * 0.6 - 14}`} fill="none" stroke={C.rope} strokeOpacity={0.8} strokeWidth={2.4} />
        ))}
      </svg>
      {planks}
    </>
  );
};

/** Parcels riding a bridge: a task's work crossing to the computer that runs it. */
const parcelsAt = (frame: number, start: number, count: number, period: number) => {
  const e = frame - start;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const off = (i * period) / count;
    if (e >= off) out.push(((e - off) / period) % 1);
  }
  return out;
};

const Parcels = ({ from, to, ts }: { from: Pt; to: Pt; ts: number[] }) => (
  <>
    {ts.map((t, i) => {
      const fade = interpolate(t, [0.1, 0.2, 0.8, 0.9], [0, 1, 1, 0], clamp);
      return <div key={i} style={{ position: "absolute", left: from.x + (to.x - from.x) * t - 13, top: from.y + (to.y - from.y) * t + sag(t) - 40, width: 26, height: 22, borderRadius: 4, background: C.parcel, border: `2px solid ${C.parcelEdge}`, opacity: fade, boxShadow: "1.5px 2.5px 0 rgba(120,72,30,0.22)" }} />;
    })}
  </>
);

type Coin = { name: string; label: string; to: Pt; at: number };
const EQUIP = 25; // 0.82 s: peel (14%) → arc (50%) → snap (62–69%)

/** An AI agent's coin, flown from Ducter with the equip and left working (its sheen turning). */
const Flying = ({ c, origin, settled }: { c: Coin; origin: Pt; settled: boolean }) => {
  const frame = useCurrentFrame();
  const f = settled ? 999 : frame - c.at;
  if (f < 0) return null;
  const p = Math.min(1, f / EQUIP);
  const peel = interpolate(p, [0, 0.14], [0, 1], { ...clamp, easing: easeOut });
  const a = interpolate(p, [0.14, 0.62], [0, 1], { ...clamp, easing: (x) => x * (1.15 - 0.15 * x) });
  const dist = Math.hypot(c.to.x - origin.x, c.to.y - origin.y);
  const apex = Math.min(110, 60 + dist * 0.15);
  const x = origin.x + (c.to.x - origin.x) * a;
  const y = origin.y - 36 * peel + (c.to.y - origin.y + 36) * a - Math.sin(a * Math.PI) * apex;
  // snap: squash on landing, then settle (62–69% and a little after)
  const sq = interpolate(p, [0.6, 0.66, 0.74, 0.86, 1], [1, 1.32, 0.9, 1.04, 1], clamp);
  const tilt = interpolate(a, [0, 0.5, 1], [-14, 10, 0]) * (p < 0.62 ? 1 : 0);
  const size = 86;
  const landed = f - EQUIP * 0.62;
  const tag = interpolate(landed, [4, 12], [0, 1], { ...clamp, easing: easeOut });
  // D146: while its task works, a soft light turns a quarter of the way round the rim (4.2 s)
  const sweep = landed > 0 ? ((landed + 10) % 126) / 126 : -1;
  const sheenRot = sweep < 0 ? 0 : interpolate(sweep, [0, 0.65], [-30, 60], clamp);
  const sheenOp = sweep < 0 ? 0 : interpolate(sweep, [0, 0.3, 0.65], [0, 1, 0], clamp);
  return (
    <>
      {landed >= 0 && landed < 22 && (
        <div style={{ position: "absolute", left: c.to.x - 75, top: c.to.y - 8, width: 150, height: 46, borderRadius: "50%", border: `3px solid rgba(255,255,255,${0.85 * (1 - landed / 22)})`, transform: `scale(${0.4 + landed / 16})` }} />
      )}
      {/* its shadow on the island, from the moment it's on its way */}
      <div style={{ position: "absolute", left: c.to.x - 34, top: c.to.y - 9, width: 68, height: 18, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(60,40,20,0.35), rgba(60,40,20,0))", opacity: a }} />
      <div style={{ position: "absolute", left: x - size / 2, top: y - size, width: size, height: size, transformOrigin: "50% 100%", transform: `scale(${(0.7 + 0.3 * peel) * sq}, ${(0.7 + 0.3 * peel) / sq}) rotate(${tilt}deg)` }}>
        <Art src={`clay/coin_${c.name}.png`} safe="coin" style={{ width: "100%" }} />
        <Art src="clay/coin_sheen.png" style={{ position: "absolute", inset: 0, width: "100%", opacity: sheenOp, transform: `rotate(${sheenRot}deg)` }} />
      </div>
      {landed >= 0 && <Sparkles at={c.at + Math.ceil(EQUIP * 0.62)} x={c.to.x} y={c.to.y - 50} r={78} n={6} />}
      {tag > 0 && (
        <div style={{ position: "absolute", left: c.to.x, top: c.to.y + 6, transform: `translateX(-50%) translateY(${(1 - tag) * 6}px)`, opacity: tag, background: C.bg, borderRadius: 10, padding: "3px 10px", fontWeight: 800, fontSize: 18, color: C.ink, boxShadow: `0 2px 0 ${C.line2}`, whiteSpace: "nowrap" }}>{c.label}</div>
      )}
    </>
  );
};

export const World = ({ mode }: { mode: "handoff" | "world" }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const sq = useSquare();
  const c = useCopy();
  const t = useT();
  const L = sq ? LAYOUT.square : LAYOUT.wide;
  const handoff = mode === "handoff";
  const { home: HOME, mini: MINI, cloud: CLOUD, phone: PHONE } = L;
  const PEEL = 26;
  const COINS: Coin[] = [
    { name: "claude_code", label: "Claude Code", to: { x: HOME.x + 150, y: HOME.y - 6 }, at: PEEL },
    { name: "codex", label: "Codex", to: { x: CLOUD.x - 70, y: CLOUD.y - 26 }, at: PEEL + 2 },
    { name: "deepseek_harness", label: "DeepSeek Harness", to: { x: CLOUD.x + 82, y: CLOUD.y + 8 }, at: PEEL + 4 },
    { name: "pi", label: "pi", to: { x: MINI.x + 74, y: MINI.y - 14 }, at: PEEL + 3 },
  ];
  const landAt = (i: number) => COINS[i].at + Math.ceil(EQUIP * 0.62);
  // the camera holds still (v4): the coins, parcels and the phone's island do the moving
  const phone = useSpring(handoff ? 99999 : 14, { damping: 13, stiffness: 90 });
  const phoneDrop = useSpring(handoff ? 99999 : 28, { damping: 9, stiffness: 160 });
  const origin = { x: HOME.x - 150, y: HOME.y - 120 };
  const ducter = handoff ? (frame < PEEL ? "ducter/idle.png" : "ducter/working.png") : "ducter/working.png";
  // the bridges: from home's rim to each island's rim
  const toMini = { from: { x: HOME.x - (sq ? 170 : 250), y: HOME.y + (sq ? 40 : -10) }, to: { x: MINI.x + (sq ? 120 : 160), y: MINI.y + (sq ? -20 : 20) } };
  const toCloud = { from: { x: HOME.x + (sq ? 170 : 250), y: HOME.y + (sq ? 40 : -10) }, to: { x: CLOUD.x - (sq ? 120 : 160), y: CLOUD.y + (sq ? -20 : 20) } };
  const P = 52; // frames per crossing, for the video's pace (the app's parcels are slower)
  const cloudTs = handoff ? parcelsAt(frame, landAt(1) + 2, 3, P) : parcelsAt(frame + 200, 0, 3, P);
  const miniTs = handoff ? parcelsAt(frame, landAt(3) + 2, 2, P * 1.1) : parcelsAt(frame + 200, 0, 2, P * 1.1);
  const tag = (i: number, n: number, idle: string) => {
    const on = handoff ? frame >= landAt(i) + 6 : true;
    return { sub: t(on ? c.tasks(n) : idle), dot: on ? C.work : undefined };
  };
  const homeTag = handoff ? tag(0, 1, c.livesHere) : { sub: t(c.tasks(1)), dot: C.work };
  const cloudTag = tag(1, 2, c.linuxServer);
  const miniTag = tag(3, 1, c.forDucter);
  const s = L.scale;
  return (
    <Fill>
      <div style={{ position: "absolute", left: (width - 1920) / 2, top: (height - 1080) / 2 + L.top, width: 1920, height: 1080, transform: `scale(${s})`, transformOrigin: "50% 45%" }}>
        <Sea />
        {!handoff && (
          <>
            <Bridge from={{ x: HOME.x, y: HOME.y - 140 }} to={{ x: PHONE.x, y: PHONE.y + 40 }} show={phone} />
            <Island at={PHONE} w={200} rise={phone}>
              <div style={{ position: "absolute", left: -30, top: -96, width: 60, transformOrigin: "50% 100%", transform: `translateY(${(1 - Math.min(1, phoneDrop)) * -260}px) scale(${1 + (phoneDrop > 1 ? (phoneDrop - 1) * 2 : 0)}, ${1 - (phoneDrop > 1 ? (phoneDrop - 1) * 2 : 0)})`, opacity: phoneDrop > 0.02 ? 1 : 0 }}>
                <Art src="clay/phone.png" safe="device" style={{ width: "100%" }} />
              </div>
            </Island>
            <Sparkles at={36} x={PHONE.x} y={PHONE.y - 50} r={70} n={6} />
            <div style={{ position: "absolute", left: sq ? PHONE.x - 120 : PHONE.x + 120, top: PHONE.y - 70, opacity: phone, transform: sq ? "translateX(-100%)" : undefined }}><Tag sub={t(c.reaches)}>{c.iphone}</Tag></div>
          </>
        )}
        <Bridge {...toMini} lit={miniTs} />
        <Bridge {...toCloud} lit={cloudTs} />
        <Island at={MINI} w={380}>
          <Art src="clay/mini_awake.png" safe="device" style={{ position: "absolute", width: 160, left: -112, top: -190 }} />
        </Island>
        <Island at={CLOUD} w={380}>
          <Art src="clay/server_awake.png" safe="device" style={{ position: "absolute", width: 190, left: -104, top: -218 }} />
        </Island>
        <Island at={HOME} w={620} big>
          <Art src="clay/laptop_awake.png" safe="device" style={{ position: "absolute", width: 250, left: -36, top: -238 }} />
          <Art src={ducter} safe="ducter" style={{ position: "absolute", width: 240, left: -270, top: -240 }} />
        </Island>
        <Parcels {...toCloud} ts={cloudTs} />
        <Parcels {...toMini} ts={miniTs} />
        {COINS.map((coin) => <Flying key={coin.name} c={coin} origin={origin} settled={!handoff} />)}
        <div style={{ position: "absolute", left: HOME.x, top: HOME.y + 140, transform: "translateX(-50%)" }}><Tag chosen sub={homeTag.sub} dot={homeTag.dot}>{t(c.thisMac)}</Tag></div>
        <div style={{ position: "absolute", left: CLOUD.x, top: CLOUD.y + 112, transform: "translateX(-50%)" }}><Tag sub={cloudTag.sub} dot={cloudTag.dot}>cloud-1</Tag></div>
        <div style={{ position: "absolute", left: MINI.x, top: MINI.y + 112, transform: "translateX(-50%)" }}><Tag sub={miniTag.sub} dot={miniTag.dot}>Mac mini</Tag></div>
      </div>
      {handoff ? <Headline h={c.handH} sub={c.handSub} /> : <Headline h={c.worldH} at={8} />}
    </Fill>
  );
};
