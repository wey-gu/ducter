// 8 · The real app, depth on demand. Two real renders (the README's, at 2x), each cropped to one
// thing you can read, with a slow push in: On hand's lanes, then the opened task's diff.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useCopy } from "../copy";
import { C } from "../theme";
import { Art, Fill, Headline, clamp, easeOut, useSquare, useType } from "../ui";

type Crop = { src: string; x0: number; x1: number; y0: number; y1: number; iw: number; ih: number };
// fractions of the 2560-wide renders (onhand 2560×1640, task-diff 2560×3400)
const ONHAND: Crop = { src: "shots/onhand.png", x0: 0.0, x1: 1.0, y0: 0.155, y1: 0.65, iw: 2560, ih: 1640 };
const ONHAND_SQ: Crop = { ...ONHAND, x1: 0.58 };
const DIFF: Crop = { src: "shots/task.png", x0: 0.17, x1: 0.83, y0: 0.44, y1: 0.70, iw: 2560, ih: 3400 };
const DIFF_SQ: Crop = { ...DIFF, x0: 0.18, x1: 0.81 };

const Shot = ({ crop, box, from, to }: { crop: Crop; box: { x: number; y: number; w: number; h: number }; from: number; to: number }) => {
  const frame = useCurrentFrame();
  const cw = (crop.x1 - crop.x0) * crop.iw, ch = (crop.y1 - crop.y0) * crop.ih;
  const s = Math.min(box.w / cw, box.h / ch);
  const w = cw * s, h = ch * s;
  const appear = interpolate(frame, [from, from + 10, to - 10, to], [0, 1, 1, 0], { ...clamp, easing: easeOut });
  const push = interpolate(frame, [from, to], [1, 1.07], clamp);
  return (
    <div style={{ position: "absolute", left: box.x + (box.w - w) / 2, top: box.y + (box.h - h) / 2 + (1 - appear) * 24, width: w, height: h, borderRadius: 24, overflow: "hidden", background: C.bg, opacity: appear, boxShadow: `0 0 0 1px ${C.line}, 0 6px 0 ${C.line2}, 0 40px 70px -30px rgba(74,50,26,0.45)` }}>
      <Art src={crop.src} style={{ position: "absolute", width: crop.iw * s, height: crop.ih * s, left: -crop.x0 * crop.iw * s, top: -crop.y0 * crop.ih * s, transform: `scale(${push})`, transformOrigin: `${(crop.x0 + crop.x1) / 2 * crop.iw * s}px ${(crop.y0 + crop.y1) / 2 * crop.ih * s}px` }} />
    </div>
  );
};

export const RealApp = () => {
  const { width, height, durationInFrames } = useVideoConfig();
  const sq = useSquare();
  const type = useType();
  const c = useCopy();
  const box = { x: type.x, y: sq ? 300 : 330, w: width - type.x - type.right + (sq ? 40 : 40), h: height - (sq ? 300 : 330) - type.bottom - 10 };
  const mid = Math.round(durationInFrames * 0.5);
  return (
    <Fill style={{ background: C.bgDeep }}>
      <Shot crop={sq ? ONHAND_SQ : ONHAND} box={box} from={0} to={mid + 6} />
      <Shot crop={sq ? DIFF_SQ : DIFF} box={box} from={mid - 4} to={durationInFrames + 12} />
      <Headline h={c.realH} sub={c.realSub} />
    </Fill>
  );
};
