// 11 · It has a phone of its own (D217). After the morning's heads-up (nowhere to stay in Tokyo),
// Ducter's own Android phone on the MacBook has the room in a hotel's app, and the one tap that
// commits waits for the owner: It will tap "Reserve" in the hotel's app · See the phone · Not yet
// · Tap it. One tap; the card says Tapped and the phone shows the booking.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useCopy, useLang } from "../copy";
import { C } from "../theme";
import { Android, Art, Btn, Check, Fill, Headline, Tap, clamp, easeOut, useSpring, useSquare, useT, useType } from "../ui";

const CARD = 30, TAP = 88;

/** The room's photo, drawn: a double room high over Yaesu at dusk, in the film's soft clay light. */
const RoomPhoto = () => (
  <svg viewBox="0 0 400 240" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: "block" }}>
    <defs>
      <linearGradient id="hw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F4E8DA" /><stop offset="1" stopColor="#E6D2BC" /></linearGradient>
      <linearGradient id="hs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8EA3C2" /><stop offset="0.55" stopColor="#E3B7A3" /><stop offset="1" stopColor="#F7D3A6" /></linearGradient>
      <linearGradient id="hf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#C89A6C" /><stop offset="1" stopColor="#A9794D" /></linearGradient>
      <linearGradient id="hh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#B88356" /><stop offset="1" stopColor="#996840" /></linearGradient>
      <linearGradient id="hd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFDF9" /><stop offset="1" stopColor="#EDE3D6" /></linearGradient>
      <linearGradient id="hc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#E9DAC4" /><stop offset="0.5" stopColor="#F6ECDD" /><stop offset="1" stopColor="#E2D0B8" /></linearGradient>
      <radialGradient id="hg" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#FFD9A0" stopOpacity="0.75" /><stop offset="1" stopColor="#FFD9A0" stopOpacity="0" /></radialGradient>
      <radialGradient id="hsun" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#FFE9C2" stopOpacity="0.95" /><stop offset="1" stopColor="#FFE9C2" stopOpacity="0" /></radialGradient>
    </defs>
    {/* wall, the lamp's glow, the floor */}
    <rect width="400" height="240" fill="url(#hw)" />
    <circle cx="168" cy="132" r="78" fill="url(#hg)" />
    <rect y="204" width="400" height="36" fill="url(#hf)" />
    <rect y="202" width="400" height="4" fill="#D9C2A6" />
    {/* the window: dusk over the city */}
    <rect x="30" y="24" width="170" height="150" rx="6" fill="url(#hs)" />
    <circle cx="150" cy="150" r="46" fill="url(#hsun)" />
    <path d="M30 150 h14 v-22 h12 v10 h10 v-30 h16 v26 h12 v-14 h14 v22 h12 v-18 h10 v12 h16 v-8 h14 v16 h20 v30 h-170z" fill="#A897A8" opacity="0.7" />
    <path d="M168 174 v-74 l3 -14 l3 14 v74z" fill="#8F7E92" opacity="0.8" />
    <path d="M30 174 v-26 h18 v-16 h20 v22 h14 v-30 h18 v34 h16 v-12 h18 v20 h22 v-24 h18 v20 h26 v12z" fill="#75687E" />
    {[[40, 154], [56, 140], [60, 150], [90, 134], [94, 146], [104, 140], [124, 156], [146, 160], [158, 152], [190, 158], [76, 162], [114, 164]].map(([x, y]) => (
      <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" rx="0.8" fill="#FFE2AE" />
    ))}
    <rect x="30" y="24" width="170" height="150" rx="6" fill="none" stroke="#FBF4EA" strokeWidth="6" />
    <rect x="112" y="24" width="5" height="150" fill="#FBF4EA" />
    <rect x="24" y="172" width="182" height="7" rx="3" fill="#F2E6D6" />
    {/* sheer curtains at both sides */}
    <path d="M10 14 h26 v178 q-13 6 -26 0z" fill="url(#hc)" opacity="0.95" />
    <path d="M196 14 h24 v178 q-12 6 -24 0z" fill="url(#hc)" opacity="0.95" />
    <rect x="6" y="10" width="220" height="5" rx="2.5" fill="#B08A64" />
    {/* nightstand and lamp */}
    <rect x="150" y="166" width="38" height="40" rx="4" fill="#AD7B4F" />
    <rect x="153" y="182" width="32" height="2" rx="1" fill="#8E6038" />
    <rect x="167" y="148" width="4" height="18" rx="2" fill="#7A5634" />
    <ellipse cx="169" cy="166" rx="9" ry="2.5" fill="#7A5634" />
    <path d="M157 128 h24 l5 22 h-34z" fill="#FFF1DA" />
    <path d="M157 128 h24 l5 22 h-34z" fill="#FFD9A0" opacity="0.35" />
    {/* the bed */}
    <ellipse cx="300" cy="222" rx="118" ry="8" fill="#8B5E37" opacity="0.35" />
    <rect x="198" y="96" width="210" height="82" rx="12" fill="url(#hh)" />
    {[226, 254, 282, 310, 338, 366].map((x) => <rect key={x} x={x} y="104" width="2" height="66" rx="1" fill="#8A5B35" opacity="0.45" />)}
    <rect x="184" y="160" width="230" height="62" rx="12" fill="#E3D6C5" />
    <path d="M184 166 q0 -8 10 -10 h210 q10 2 10 10 v40 h-230z" fill="url(#hd)" />
    <rect x="212" y="126" width="84" height="38" rx="14" fill="#FFFFFF" />
    <rect x="212" y="152" width="84" height="12" rx="6" fill="#ECE2D5" />
    <rect x="304" y="126" width="84" height="38" rx="14" fill="#FFFFFF" />
    <rect x="304" y="152" width="84" height="12" rx="6" fill="#ECE2D5" />
    <rect x="184" y="186" width="230" height="16" fill="#9FAAB4" />
    <rect x="184" y="186" width="230" height="3" fill="#B7C0C8" />
    <path d="M184 202 h230 v14 q0 6 -6 6 h-218 q-6 0 -6 -6z" fill="#E9DFD2" />
  </svg>
);

const Star = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
    <path d="M12 2.8l2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L12 16.86l-5.5 2.89 1.05-6.12L3.1 9.3l6.15-.9z" fill={C.ink} />
  </svg>
);

/** Drawn line icons for the amenities (no emoji-capable characters). */
const Amenity = ({ kind, size }: { kind: "wifi" | "breakfast" | "bath" | "bag"; size: number }) => {
  const p = { fill: "none", stroke: C.ink2, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }}>
      {kind === "wifi" && (<><path d="M3 9.5a13 13 0 0 1 18 0" {...p} /><path d="M6.2 13a8.5 8.5 0 0 1 11.6 0" {...p} /><path d="M9.4 16.4a4 4 0 0 1 5.2 0" {...p} /><circle cx="12" cy="19.3" r="1.2" fill={C.ink2} /></>)}
      {kind === "breakfast" && (<><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" {...p} /><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16" {...p} /><path d="M8 3.5v2.5M12 3.5v2.5" {...p} /></>)}
      {kind === "bath" && (<><path d="M3 12h18v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z" {...p} /><path d="M6 12V6a2 2 0 0 1 3.6-1.2" {...p} /><path d="M7 19l-1 2M17 19l1 2" {...p} /></>)}
      {kind === "bag" && (<><rect x="4" y="8" width="16" height="12" rx="2.5" {...p} /><path d="M9 8V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5V8" {...p} /><path d="M4 13h16" {...p} /></>)}
    </svg>
  );
};

/** The hotel's app on Ducter's phone: the room, then the booking. A made-up hotel; the app's own
 * words stay English and its palette stays neutral (ink on white), so the film's orange stays Ducter's. */
const HotelApp = ({ w, done }: { w: number; done: number }) => {
  const s = w / 400;
  const u = (n: number) => n * s;
  const round = (d: number) => ({ width: u(d), height: u(d), borderRadius: 99, background: "rgba(255,255,255,0.92)", display: "grid", placeItems: "center", boxShadow: "0 2px 6px rgba(43,33,24,0.18)" });
  const stroke = { fill: "none", stroke: C.ink, strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const row = { display: "flex", justifyContent: "space-between", alignItems: "baseline" } as const;
  return (
    <div style={{ position: "absolute", inset: 0, color: C.ink, fontSize: u(14) }}>
      {/* the photo, full-bleed under the status bar's strip */}
      <div style={{ position: "absolute", top: u(44), left: 0, right: 0, height: u(258), overflow: "hidden" }}>
        <RoomPhoto />
        <div style={{ position: "absolute", top: u(12), left: u(14), ...round(34) }}>
          <svg width={u(18)} height={u(18)} viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" {...stroke} /></svg>
        </div>
        <div style={{ position: "absolute", top: u(12), right: u(14), display: "flex", gap: u(10) }}>
          <div style={round(34)}><svg width={u(17)} height={u(17)} viewBox="0 0 24 24"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" {...stroke} /></svg></div>
          <div style={round(34)}><svg width={u(17)} height={u(17)} viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" {...stroke} /></svg></div>
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: u(12), display: "flex", justifyContent: "center", gap: u(5) }}>
          {[1, 0, 0, 0, 0].map((on, i) => <div key={i} style={{ width: u(on ? 16 : 6), height: u(6), borderRadius: 9, background: on ? "#fff" : "rgba(255,255,255,0.6)" }} />)}
        </div>
        <div style={{ position: "absolute", right: u(12), bottom: u(8), background: "rgba(43,33,24,0.62)", color: "#fff", borderRadius: 99, padding: `${u(3)}px ${u(9)}px`, fontSize: u(11.5), fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>1 / 24</div>
      </div>
      {/* the hotel, its rating and what's included */}
      <div style={{ position: "absolute", top: u(318), left: u(20), right: u(20) }}>
        <div style={{ fontWeight: 800, fontSize: u(22), letterSpacing: "-0.01em" }}>Hotel Yaesu Terrace</div>
        <div style={{ fontWeight: 500, fontSize: u(13.5), color: C.muted, marginTop: u(3) }}>Yaesu, Chuo · 8 min walk to Tokyo Station</div>
        <div style={{ display: "flex", alignItems: "center", gap: u(8), marginTop: u(10) }}>
          <div style={{ background: C.ink, color: "#fff", borderRadius: u(7), padding: `${u(2)}px ${u(7)}px`, fontWeight: 750, fontSize: u(13.5), fontVariantNumeric: "tabular-nums" }}>4.7</div>
          <div style={{ display: "flex", gap: u(1) }}>{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={u(13)} />)}</div>
          <div style={{ fontWeight: 650, fontSize: u(13.5) }}>Excellent</div>
          <div style={{ fontWeight: 500, fontSize: u(13), color: C.muted }}>1,284 reviews</div>
        </div>
        <div style={{ display: "flex", gap: u(8), marginTop: u(14) }}>
          {([["wifi", "Free Wi-Fi"], ["breakfast", "Breakfast"], ["bath", "Large bath"], ["bag", "Luggage"]] as const).map(([k, label]) => (
            <div key={k} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: u(5), padding: `${u(9)}px 0 ${u(8)}px`, borderRadius: u(12), background: "#F6F3EF" }}>
              <Amenity kind={k} size={u(20)} />
              <div style={{ fontWeight: 600, fontSize: u(11), color: C.ink2, whiteSpace: "nowrap" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
      {/* the stay: dates, the room, and the price */}
      <div style={{ position: "absolute", top: u(478), left: u(20), fontWeight: 750, fontSize: u(15) }}>Your stay</div>
      <div style={{ position: "absolute", top: u(504), left: u(20), right: u(20), border: `1px solid #E7E1DA`, borderRadius: u(14), display: "flex" }}>
        {[["Check-in", "Sat, Nov 21", "from 15:00"], ["Check-out", "Sun, Nov 22", "by 11:00"]].map(([k, d, t], i) => (
          <div key={k} style={{ flex: 1, padding: `${u(10)}px ${u(14)}px`, borderLeft: i ? "1px solid #E7E1DA" : undefined }}>
            <div style={{ fontWeight: 600, fontSize: u(11.5), color: C.muted }}>{k}</div>
            <div style={{ fontWeight: 750, fontSize: u(15), marginTop: u(2) }}>{d}</div>
            <div style={{ fontWeight: 500, fontSize: u(12), color: C.muted }}>{t}</div>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", top: u(594), left: u(20), right: u(20) }}>
        <div style={row}>
          <div style={{ fontWeight: 700, fontSize: u(15) }}>Moderate Double</div>
          <div style={{ fontWeight: 500, fontSize: u(12.5), color: C.muted }}>1 room · 1 adult</div>
        </div>
        <div style={{ fontWeight: 500, fontSize: u(12.5), color: C.muted, marginTop: u(2) }}>18 m² · 1 double bed · non-smoking · city view</div>
        <div style={{ display: "flex", alignItems: "center", gap: u(6), marginTop: u(8), fontWeight: 600, fontSize: u(12.5), color: C.ink2 }}>
          <Check size={u(13)} color={C.ink2} />Free cancellation until Nov 19
        </div>
        <div style={{ height: 1, background: "#E7E1DA", margin: `${u(12)}px 0` }} />
        <div style={{ display: "flex", flexDirection: "column", gap: u(5), fontSize: u(13), fontVariantNumeric: "tabular-nums" }}>
          <div style={row}><span style={{ color: C.muted, fontWeight: 500 }}>1 night × ¥16,600</span><span style={{ fontWeight: 600 }}>¥16,600</span></div>
          <div style={row}><span style={{ color: C.muted, fontWeight: 500 }}>Taxes and fees</span><span style={{ fontWeight: 600 }}>¥1,600</span></div>
          <div style={row}><span style={{ color: C.muted, fontWeight: 500 }}>Tokyo accommodation tax</span><span style={{ fontWeight: 600 }}>¥200</span></div>
          <div style={{ ...row, marginTop: u(3) }}><span style={{ fontWeight: 750, fontSize: u(14) }}>Total</span><span style={{ fontWeight: 800, fontSize: u(14) }}>¥18,400</span></div>
        </div>
      </div>
      {/* the bar that stays: the price and the one button that commits */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: u(104), background: "#fff", borderTop: "1px solid #ECE6DF", display: "flex", alignItems: "flex-start", gap: u(14), padding: `${u(14)}px ${u(20)}px 0` }}>
        <div style={{ flex: "none" }}>
          <div style={{ fontWeight: 800, fontSize: u(19), fontVariantNumeric: "tabular-nums" }}>¥18,400</div>
          <div style={{ fontWeight: 500, fontSize: u(11.5), color: C.muted }}>total · taxes included</div>
        </div>
        <div style={{ flex: 1, height: u(50), borderRadius: u(14), background: `color-mix(in srgb, ${C.okStrong} ${Math.round(done * 100)}%, ${C.ink})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: u(6), fontWeight: 750, fontSize: u(16.5) }}>
          {done > 0.5 ? (<><Check size={u(16)} color="#fff" />Reserved</>) : "Reserve"}
        </div>
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
