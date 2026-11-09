// The Isles (D81), as the Devices view and the site draw them: a sky over a hazy horizon, a clay
// sea, every computer on its own island, plank bridges from home. Two scenes use it:
// 4 · the hand-off, coins flying from Ducter to the islands where each agent is signed in;
// 9 · the whole world, with the phone, under the tagline.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ReactNode } from "react";
import { C } from "../theme";
import { Art, Caption, Fill, Sub, Tag, clamp, useSpring, useSquare } from "../ui";

const HZ = 300; // the horizon, in the 1920×1080 design space

type Pt = { x: number; y: number };
const HOME: Pt = { x: 960, y: 700 };
const CLOUD: Pt = { x: 1560, y: 560 };
const MINI: Pt = { x: 360, y: 560 };
const PHONE: Pt = { x: 960, y: 372 };

const Sea = () => {
  const frame = useCurrentFrame();
  const clouds = [[300, 150, 380], [820, 90, 300], [1340, 170, 420], [1760, 110, 280]];
  return (
    <>
      <div style={{ position: "absolute", left: -800, right: -800, top: -900, bottom: -900, background: `linear-gradient(${C.skyTop} 0px, ${C.skyTop} 900px, ${C.sky} ${900 + HZ * 0.7}px, ${C.haze} ${900 + HZ - 2}px, ${C.seaFar} ${900 + HZ + 6}px, ${C.sea} ${900 + HZ + 380}px, ${C.seaNear} ${900 + 1080}px, ${C.seaNear} 100%)` }} />
      {clouds.map(([x, y, w], i) => (
        <div key={i} style={{ position: "absolute", left: x - w / 2 + Math.sin(frame / 90 + i) * 30, top: y, width: w, height: w * 0.28, borderRadius: "50%", background: "radial-gradient(closest-side, #FFFDF8, rgba(255,253,248,0.6) 55%, rgba(255,253,248,0))" }} />
      ))}
      <div style={{ position: "absolute", left: -200, right: -200, top: HZ - 18, height: 36, background: "radial-gradient(closest-side, #FFF6EA, rgba(255,246,234,0))" }} />
      {Array.from({ length: 16 }, (_, i) => {
        const gx = ((i * 0.381 + 0.07) % 1) * 1920, gy = HZ + 30 + ((i * 0.617 + 0.13) % 1) * 720;
        const d = (gy - HZ) / 780;
        const w = 30 + 60 * d;
        return <div key={i} style={{ position: "absolute", left: gx - w / 2 + Math.sin(frame / 30 + i) * 10 * (0.4 + d), top: gy, width: w, height: w * 0.12, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(255,255,250,0.9), rgba(255,255,250,0))", opacity: 0.5 + 0.4 * Math.sin(frame / 18 + i * 1.7) }} />;
      })}
    </>
  );
};

const Island = ({ at, w, big, children, bob = 0 }: { at: Pt; w: number; big?: boolean; children?: ReactNode; bob?: number }) => {
  const frame = useCurrentFrame();
  const h = big ? w * (614 / 1280) : w * (754 / 1280);
  const dy = Math.sin(frame / 26 + bob) * 4;
  return (
    <>
      {/* foam on the water round the island */}
      <div style={{ position: "absolute", left: at.x - w * 0.62, top: at.y + h * 0.36, width: w * 1.24, height: h * 0.5, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(255,255,255,0.45), rgba(255,255,255,0))" }} />
      <div style={{ position: "absolute", left: at.x - w * 0.42, top: at.y + h * 0.5, width: w * 0.84, height: h * 0.16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.7)" }} />
      <div style={{ position: "absolute", left: at.x - w / 2, top: at.y - h / 2 + dy, width: w, height: h }}>
        <Art src={big ? "clay/island_big.png" : "clay/island_small.png"} style={{ width: "100%" }} />
      </div>
      <div style={{ position: "absolute", left: at.x, top: at.y + dy }}>{children}</div>
    </>
  );
};

/** A plank and rope bridge from home to another island. */
const Bridge = ({ from, to, show }: { from: Pt; to: Pt; show: number }) => {
  const n = 22;
  const planks = [];
  const dx = to.x - from.x, dy = to.y - from.y;
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (t > show) break;
    const sag = Math.sin(t * Math.PI) * 26;
    planks.push(
      <div key={i} style={{ position: "absolute", left: from.x + dx * t - 7, top: from.y + dy * t + sag - 16, width: 14, height: 32, borderRadius: 3, background: C.plank, boxShadow: `0 3px 0 ${C.plankDark}`, transform: `rotate(${ang}deg)` }} />,
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

/** A parcel riding a bridge: a task's work crossing to the computer that runs it. */
const Parcel = ({ from, to, at, period = 70, offset = 0 }: { from: Pt; to: Pt; at: number; period?: number; offset?: number }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const t = (((frame - at) / period + offset) % 1);
  const sag = Math.sin(t * Math.PI) * 26;
  const fade = interpolate(t, [0, 0.08, 0.9, 1], [0, 1, 1, 0]);
  return (
    <div style={{ position: "absolute", left: from.x + (to.x - from.x) * t - 13, top: from.y + (to.y - from.y) * t + sag - 40, width: 26, height: 22, borderRadius: 4, background: C.parcel, border: `2px solid ${C.parcelEdge}`, opacity: fade, boxShadow: "1.5px 2.5px 0 rgba(120,72,30,0.22)" }} />
  );
};

type Coin = { name: string; label: string; to: Pt; at: number };

const Flying = ({ c, origin }: { c: Coin; origin: Pt }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [c.at, c.at + 26], [0, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 2.2) });
  if (frame < c.at - 8) return null;
  const pop = interpolate(frame, [c.at - 8, c.at], [0, 1], clamp);
  const x = origin.x + (c.to.x - origin.x) * t;
  const y = origin.y + (c.to.y - origin.y) * t - Math.sin(t * Math.PI) * 240;
  const landed = frame - (c.at + 26);
  const squash = landed >= 0 && landed < 10 ? 1 + 0.25 * Math.sin((landed / 10) * Math.PI) : 1;
  const spin = landed > 0 ? Math.sin(landed / 9) * 12 : t * 720;
  const size = 84;
  const tag = interpolate(landed, [0, 8], [0, 1], clamp);
  return (
    <>
      {landed >= 0 && landed < 24 && (
        <div style={{ position: "absolute", left: c.to.x - 70, top: c.to.y - 6, width: 140, height: 44, borderRadius: "50%", border: `3px solid rgba(255,255,255,${0.8 * (1 - landed / 24)})`, transform: `scale(${0.4 + landed / 18})` }} />
      )}
      <div style={{ position: "absolute", left: x - size / 2, top: y - size, width: size, height: size, transformOrigin: "50% 100%", transform: `scale(${pop * squash}, ${pop / squash}) rotateY(${spin}deg)` }}>
        <Art src={`clay/coin_${c.name}.png`} style={{ width: "100%" }} />
      </div>
      {tag > 0 && (
        <div style={{ position: "absolute", left: c.to.x, top: c.to.y + 4, transform: `translateX(-50%) scale(${tag})`, background: C.bg, borderRadius: 10, padding: "3px 10px", fontWeight: 800, fontSize: 17, color: C.ink, boxShadow: `0 2px 0 ${C.line2}`, whiteSpace: "nowrap" }}>{c.label}</div>
      )}
    </>
  );
};

const COINS: Coin[] = [
  { name: "claude_code", label: "Claude Code", to: { x: HOME.x + 140, y: HOME.y - 8 }, at: 34 },
  { name: "codex", label: "Codex", to: { x: CLOUD.x - 62, y: CLOUD.y - 30 }, at: 46 },
  { name: "deepseek_harness", label: "DeepSeek Harness", to: { x: CLOUD.x + 78, y: CLOUD.y + 6 }, at: 58 },
  { name: "pi", label: "pi", to: { x: MINI.x + 70, y: MINI.y - 18 }, at: 70 },
];

export const World = ({ mode }: { mode: "handoff" | "world" }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const sq = useSquare();
  const handoff = mode === "handoff";
  const fit = sq ? 0.6 : 1;
  const zoom = handoff
    ? interpolate(frame, [0, 34], [1.32, 1], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) })
    : interpolate(frame, [0, durationInFrames], [1.05, 0.93], clamp);
  const camY = handoff ? interpolate(frame, [0, 34], [-130, 0], { ...clamp, easing: (x) => 1 - Math.pow(1 - x, 3) }) : 0;
  const bridges = handoff ? interpolate(frame, [6, 30], [0, 1], clamp) : 1;
  const phone = useSpring(handoff ? 9999 : 20, { damping: 14 });
  const origin = { x: HOME.x - 120, y: HOME.y - 150 };
  const status = (at: number, text: string) => (frame >= at ? text : "");
  const capTop = sq ? 70 : 64;
  return (
    <Fill>
      <div style={{ position: "absolute", left: (width - 1920) / 2, top: (height - 1080) / 2 + (sq ? 120 : 0), width: 1920, height: 1080, transform: `scale(${fit * zoom}) translateY(${camY}px)`, transformOrigin: "50% 62%" }}>
        <Sea />
        {!handoff && (
          <>
            <Bridge from={{ x: HOME.x, y: HOME.y - 120 }} to={{ x: PHONE.x, y: PHONE.y + 46 }} show={phone} />
            <div style={{ opacity: phone, transform: `translateY(${(1 - phone) * 40}px)` }}>
              <Island at={PHONE} w={210} bob={2}>
                <Art src="clay/phone.png" style={{ position: "absolute", width: 62, left: -31, top: -100 }} />
              </Island>
              <div style={{ position: "absolute", left: PHONE.x + 130, top: PHONE.y - 60 }}><Tag sub="Answers from here">iPhone</Tag></div>
            </div>
          </>
        )}
        <Bridge from={{ x: HOME.x - 250, y: HOME.y - 10 }} to={{ x: MINI.x + 160, y: MINI.y + 20 }} show={bridges} />
        <Bridge from={{ x: HOME.x + 250, y: HOME.y - 10 }} to={{ x: CLOUD.x - 160, y: CLOUD.y + 20 }} show={bridges} />
        <Island at={MINI} w={400} bob={1}>
          <Art src="clay/mini_awake.png" style={{ position: "absolute", width: 170, left: -120, top: -200 }} />
        </Island>
        <Island at={CLOUD} w={400} bob={3}>
          <Art src="clay/server_awake.png" style={{ position: "absolute", width: 200, left: -110, top: -228 }} />
        </Island>
        <Island at={HOME} w={660} big>
          <Art src="clay/laptop_awake.png" style={{ position: "absolute", width: 260, left: -40, top: -250 }} />
          <Art src={handoff ? "ducter/working.png" : "ducter/done.png"} style={{ position: "absolute", width: 250, left: -280, top: -250 }} />
        </Island>
        {handoff && frame > 100 && (
          <>
            <Parcel from={{ x: HOME.x + 250, y: HOME.y - 10 }} to={{ x: CLOUD.x - 160, y: CLOUD.y + 20 }} at={100} />
            <Parcel from={{ x: HOME.x + 250, y: HOME.y - 10 }} to={{ x: CLOUD.x - 160, y: CLOUD.y + 20 }} at={100} offset={0.5} />
            <Parcel from={{ x: HOME.x - 250, y: HOME.y - 10 }} to={{ x: MINI.x + 160, y: MINI.y + 20 }} at={100} offset={0.25} period={80} />
          </>
        )}
        {(handoff ? COINS : COINS.map((c) => ({ ...c, at: -40 }))).map((c) => <Flying key={c.name} c={c} origin={origin} />)}
        <div style={{ position: "absolute", left: HOME.x, top: HOME.y + 150, transform: "translateX(-50%)" }}><Tag chosen sub={handoff ? status(60, "Working on 1") || "Ducter lives here" : "Ducter lives here"}>This Mac</Tag></div>
        <div style={{ position: "absolute", left: CLOUD.x, top: CLOUD.y + 120, transform: "translateX(-50%)" }}><Tag sub={handoff ? status(84, "Working on 2") || "Linux server" : "Linux server · on all night"}>cloud-1</Tag></div>
        <div style={{ position: "absolute", left: MINI.x, top: MINI.y + 120, transform: "translateX(-50%)" }}><Tag sub={handoff ? status(96, "Working on 1") || "Lent to Ducter" : "Lent to Ducter"}>Mac mini</Tag></div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: capTop, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {handoff ? (
          <>
            <Caption text={sq ? "It hands the work to\nthe agents you already use." : "It hands the work to the agents you already use."} size={sq ? 66 : 76} align="center" at={6} stagger={2} />
            <Sub text="On your own computers, with your own sign-ins." at={30} size={sq ? 32 : 36} style={{ marginTop: 14, color: C.ink2 }} />
          </>
        ) : (
          <Caption text={sq ? "One partner.\nAll your agents.\nYour machines." : "One partner. All your agents. Your machines."} size={sq ? 84 : 90} align="center" at={8} stagger={5} />
        )}
      </div>
    </Fill>
  );
};
