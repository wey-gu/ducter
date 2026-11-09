// The launch video: ten scenes, joined by short fades (the title opens into the conversation
// out of Ducter itself). The only sound is Ducter's own title
// sound (D87), under the title and again under the end card; the video reads without it.
import { linearTiming, type TransitionPresentation, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Audio, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import { type Lang, LangContext } from "./copy";
import { Decide } from "./scenes/Decide";
import { End } from "./scenes/End";
import { Hook } from "./scenes/Hook";
import { Quiet } from "./scenes/Quiet";
import { RealApp } from "./scenes/RealApp";
import { Result } from "./scenes/Result";
import { SayIt } from "./scenes/SayIt";
import { Title, titleLayout } from "./scenes/Title";
import { World } from "./scenes/World";
import "./theme";
import { LAUNCH_FRAMES, SCENES, X, startOf } from "./timeline";
import { revealFrom } from "./transitions";

const body = {
  Hook: <Hook />,
  Title: <Title />,
  SayIt: <SayIt />,
  Handoff: <World mode="handoff" />,
  Quiet: <Quiet />,
  Decide: <Decide />,
  Result: <Result />,
  RealApp: <RealApp />,
  World: <World mode="world" />,
  End: <End />,
};

const Sound = ({ from, length }: { from: number; length: number }) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence from={from} durationInFrames={length} name="Title sound">
      <Audio
        src={staticFile("sound/title.wav")}
        volume={(f) => interpolate(f, [0, 6, length - fps, length], [0, 0.9, 0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
      />
    </Sequence>
  );
};

export type LaunchProps = { lang: Lang };

export const Launch = ({ lang }: LaunchProps) => {
  const { width, height } = useVideoConfig();
  const end = startOf("End");
  const d = titleLayout(width, height).ducter;
  return (
    <LangContext.Provider value={lang}>
      <TransitionSeries>
        {SCENES.flatMap(([name, dur], i) => [
          ...(i > 0
            ? [
                <TransitionSeries.Transition
                  key={`x${i}`}
                  presentation={(name === "SayIt" ? revealFrom({ x: d.x, y: d.y, width, height }) : fade()) as TransitionPresentation<Record<string, unknown>>}
                  timing={linearTiming({ durationInFrames: X })}
                />,
              ]
            : []),
          <TransitionSeries.Sequence key={name} name={name} durationInFrames={dur}>
            {body[name]}
          </TransitionSeries.Sequence>,
        ])}
      </TransitionSeries>
      <Sound from={startOf("Title")} length={9 * 30} />
      <Sound from={end - 30} length={LAUNCH_FRAMES - end + 30} />
    </LangContext.Provider>
  );
};
