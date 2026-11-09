import { Composition, Folder } from "remotion";
import { Launch } from "./Launch";
import { LAUNCH_FRAMES } from "./timeline";

export const RemotionRoot = () => (
  <Folder name="Launch">
    <Composition id="Launch" component={Launch} durationInFrames={LAUNCH_FRAMES} fps={30} width={1920} height={1080} />
    <Composition id="LaunchSquare" component={Launch} durationInFrames={LAUNCH_FRAMES} fps={30} width={1080} height={1080} />
  </Folder>
);
