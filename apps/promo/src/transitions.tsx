// The cut from the title into the conversation: the camera keeps moving into Ducter and the
// conversation opens out of it, a circle of paper growing from where Ducter stands.
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill, Easing } from "remotion";

type Props = { x: number; y: number; width: number; height: number };

const Reveal = ({ children, presentationDirection, presentationProgress, passedProps }: TransitionPresentationComponentProps<Props>) => {
  const { x, y, width, height } = passedProps;
  const p = Easing.bezier(0.6, 0, 0.3, 1)(presentationProgress);
  if (presentationDirection === "exiting") {
    return (
      <AbsoluteFill style={{ transform: `scale(${1 + p * 0.5})`, transformOrigin: `${x}px ${y}px` }}>{children}</AbsoluteFill>
    );
  }
  const far = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
  const r = p * far;
  return <AbsoluteFill style={{ clipPath: `circle(${r}px at ${x}px ${y}px)` }}>{children}</AbsoluteFill>;
};

export const revealFrom = (props: Props): TransitionPresentation<Props> => ({ component: Reveal, props });
