// The cut from the title into the conversation: the title holds still and the conversation
// opens out of Ducter, a circle of paper growing from where it stands (v4: no zoom).
import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill, Easing } from "remotion";

type Props = { x: number; y: number; width: number; height: number };

const Reveal = ({ children, presentationDirection, presentationProgress, passedProps }: TransitionPresentationComponentProps<Props>) => {
  const { x, y, width, height } = passedProps;
  const p = Easing.bezier(0.6, 0, 0.3, 1)(presentationProgress);
  if (presentationDirection === "exiting") {
    return (
      <AbsoluteFill>{children}</AbsoluteFill>
    );
  }
  const far = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
  const r = p * far;
  return <AbsoluteFill style={{ clipPath: `circle(${r}px at ${x}px ${y}px)` }}>{children}</AbsoluteFill>;
};

export const revealFrom = (props: Props): TransitionPresentation<Props> => ({ component: Reveal, props });
