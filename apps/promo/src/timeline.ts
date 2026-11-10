// The scenes in order and how long each runs, at 30 fps. Kept apart from the React code so the
// still and render scripts can read it.

export const X = 12; // frames each fade overlaps

// [name, frames]; the total is their sum minus X per cut.
export const SCENES = [
  ["Hook", 118],
  ["Title", 100],
  ["SayIt", 132],
  ["Handoff", 156],
  ["Quiet", 96],
  ["Decide", 170],
  ["Result", 132],
  ["RealApp", 100],
  ["HeadsUp", 128],
  ["World", 118],
  ["End", 140],
] as const;

export const LAUNCH_FRAMES = SCENES.reduce((n, [, d]) => n + d, 0) - X * (SCENES.length - 1);

/** Where a scene starts in the whole video. */
export const startOf = (name: (typeof SCENES)[number][0]) => {
  let f = 0;
  for (const [n, d] of SCENES) {
    if (n === name) return f;
    f += d - X;
  }
  return f;
};
