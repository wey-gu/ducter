// 11 · It has a phone of its own (D217). After the morning's heads-up (nowhere to stay in Tokyo),
// Ducter's own Android phone on the MacBook has the room in a hotel's app, and the one tap that
// commits waits for the owner: It will tap "Reserve" in the hotel's app · See the phone · Not yet
// · Tap it. One tap; the card says Tapped and the phone shows the booking.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useCopy, useLang } from "../copy";
import { C } from "../theme";
import { Android, Art, Btn, Check, Fill, Headline, Tap, clamp, easeOut, useSpring, useSquare, useT, useType } from "../ui";

const CARD = 30, TAP = 88;

/** The hotel's app on Ducter's phone: the room, then the booking. The app's own words stay English. */
const HotelApp = ({ w, done }: { w: number; done: number }) => {
  const s = w / 400;
  return (
    <div style={{ position: "absolute", inset: 0, paddingTop: 64 * s, fontSize: 16 * s, color: C.ink }}>
      <div style={{ padding: `0 ${22 * s}px`, fontWeight: 650, fontSize: 15 * s, color: C.muted }}>Tokyo · Nov 21 – 22 · 1 night · 1 room</div>
      <div style={{ margin: `${14 * s}px ${18 * s}px 0`, borderRadius: 18 * s, overflow: "hidden", background: C.bg, boxShadow: `0 3px 0 ${C.line}` }}>
        <div style={{ height: 170 * s, background: "linear-gradient(160deg, #F4D7B5 0%, #E9B98A 55%, #C98F4E 100%)", position: "relative" }}>
          {/* a window at dusk, drawn flat: the room's photo */}
          <div style={{ position: "absolute", left: 30 * s, top: 26 * s, width: 140 * s, height: 110 * s, borderRadius: 8 * s, background: "linear-gradient(#9FB7C9, #F2C89A)", boxShadow: "inset 0 0 0 4px #FFF3E0" }} />
          <div style={{ position: "absolute", right: 26 * s, bottom: 22 * s, width: 170 * s, height: 46 * s, borderRadius: 10 * s, background: "#FFF3E0", boxShadow: "0 6px 0 #D9A76A" }} />
        </div>
        <div style={{ padding: `${14 * s}px ${16 * s}px` }}>
          <div style={{ fontWeight: 800, fontSize: 21 * s }}>Hotel Yaesu Terrace</div>
          <div style={{ fontWeight: 500, fontSize: 15 * s, color: C.muted, marginTop: 4 * s }}>8 min walk to Tokyo Station · free cancellation until Nov 19</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 12 * s }}>
            <div style={{ fontWeight: 800, fontSize: 22 * s }}>¥18,400</div>
            <div style={{ fontWeight: 500, fontSize: 14 * s, color: C.muted }}>taxes included</div>
          </div>
        </div>
      </div>
      <div style={{ margin: `${16 * s}px ${18 * s}px 0`, display: "flex", flexDirection: "column", gap: 10 * s, fontSize: 15 * s, color: C.ink2 }}>
        {[["Room", "1 double bed · 18 m² · non-smoking"], ["Check-in", "Nov 21, from 15:00"], ["Check-out", "Nov 22, by 11:00"], ["Guest", "1 adult"]].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", borderBottom: `1px solid ${C.line}`, paddingBottom: 9 * s }}>
            <span style={{ color: C.muted, fontWeight: 600 }}>{k}</span><span style={{ fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 18 * s, right: 18 * s, bottom: 40 * s, height: 54 * s, borderRadius: 14 * s, background: `color-mix(in srgb, ${C.okStrong} ${Math.round(done * 100)}%, ${C.ink})`, color: "#fff", display: "grid", placeItems: "center", fontWeight: 750, fontSize: 18 * s }}>
        {done > 0.5 ? "Reserved · see you Nov 21" : "Reserve"}
      </div>
    </div>
  );
};

export const PhoneUse = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const sq = useSquare();
  const type = useType();
  const c = useCopy();
  const t = useT();
  const zh = useLang() === "zh";
  const enter = useSpring(0, { damping: 16, stiffness: 90 });
  const card = useSpring(CARD, { damping: 16 });
  const press = interpolate(frame, [TAP - 2, TAP + 1, TAP + 6], [0, 1, 0], clamp);
  const done = interpolate(frame, [TAP + 6, TAP + 14], [0, 1], { ...clamp, easing: easeOut });
  const pw = sq ? 290 : 390;
  const ph = pw * 2.2;
  const px = sq ? width - type.x - pw + 20 : 1290;
  const py = sq ? height - ph - 40 : (height - ph) / 2 + 30;
  const cw = sq ? width - type.x * 2 - pw - 10 : 880;
  const cx = type.x;
  const cy = sq ? 470 : 520;
  const ks = sq ? 0.76 : 1; // the card's scale on the square cut
  return (
    <Fill style={{ background: C.bg }}>
      <Headline h={c.phoneH} sub={c.phoneSub} />
      {/* Ducter's phone, with the chip that says who is driving (D214's Screen) */}
      <div style={{ position: "absolute", left: px, top: py, transform: `translateY(${(1 - enter) * 500}px)` }}>
        <div style={{ position: "absolute", top: -54, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#DCEEFC", color: "#174A75", borderRadius: 999, padding: "6px 16px", fontWeight: 700, fontSize: sq ? 17 : 20, whiteSpace: "nowrap" }}>
            <span style={{ width: 11, height: 11, borderRadius: 6, background: C.work }} />{t(c.driving)} · {t(c.onMac)}
          </div>
        </div>
        <Android width={pw}>
          <HotelApp w={pw * 0.948} done={done} />
        </Android>
      </div>
      {/* the Go card: the tap that commits waits for the owner */}
      <div style={{ position: "absolute", left: cx, top: cy, width: cw / ks, transform: `scale(${ks}) translateY(${(1 - card) * 30}px)`, transformOrigin: "0 0", opacity: card }}>
        <div style={{ background: `color-mix(in srgb, ${C.okSurface} ${Math.round(done * 100)}%, ${C.decideSurface})`, borderRadius: 26, padding: "24px 30px", boxShadow: `0 4px 0 color-mix(in srgb, #B6E6C2 ${Math.round(done * 100)}%, ${C.decideLedge}), 0 18px 40px -18px rgba(43,33,24,0.25)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Art src="clay/ab_phone.png" style={{ width: 40 }} />
            <div style={{ fontWeight: 700, fontSize: 21, color: done > 0.5 ? C.okInk : C.decideInk }}>{t(c.ducterPhone)} · {t(c.stayTask)}</div>
          </div>
          <div style={{ fontWeight: 800, fontSize: 34, lineHeight: zh ? 1.4 : 1.2, color: C.ink, marginTop: 14 }}>{t(done > 0.5 ? c.booked : c.willTap)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 22, height: 56 }}>
            {done > 0.5 ? (
              <div style={{ fontWeight: 750, fontSize: 22, color: C.okInk, display: "flex", alignItems: "center", gap: 8 }}><Check size={22} color={C.okInk} />{t(c.tapped)}</div>
            ) : (
              <>
                <Btn kind="plain" onTint scale={1.25}>{t(c.seePhone)}</Btn>
                <Btn onTint scale={1.25}>{t(c.notYet)}</Btn>
                <div style={{ flex: 1 }} />
                <Btn kind="ink" scale={1.3} pressed={press}>{t(c.tapIt)}</Btn>
              </>
            )}
          </div>
        </div>
      </div>
      <Tap at={TAP} x={cx + (cw - (zh ? 70 : 64) * ks)} y={cy + (zh ? 190 : 196) * ks} size={ks} />
    </Fill>
  );
};
