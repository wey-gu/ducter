# 111: iPhone Duo, Apple's foldable, as an app and a page see it

Gathered 2026-11-17 by web search only: Apple's product and newsroom pages for the announcement, plus
secondary developer and press write-ups for the APIs. No device was available, and the local
toolchain (Xcode 26.3, iOS SDK 26.2) has no Duo SDK or simulator. All API facts below come from
secondary reports and need checking against Apple's documentation.

## What it is

- Announced September 2026 as Apple's first foldable iPhone, and shipped about 2026-10-23. It is a
  book-style fold with a 5.4" outer screen and a 7.6" inner screen. **DOCUMENTED** (Apple newsroom
  "Apple unveils iPhone Duo", apple.com/iphone-duo; Macworld, PetaPixel 2026-09-09.)
- iOS 27 shows two home screens side by side on the inner screen. **DOCUMENTED** (coverage of the
  announcement.)

## To an app

- The outer screen reports compact width, like an iPhone. The inner screen reports **regular
  width and regular height**, and the device is still an iPhone. **DOCUMENTED, secondary**
  (Kodeco "Seeing Double with the iPhone Duo", swiftjectivec "iPhone Duo First Developer Good to
  Knows", InfoQ 2026-09.)
- Hinge APIs are in iOS 27.1: SwiftUI `onHingeChange` and UIKit `UIHingeInteraction`. They give the
  hinge's state and angle, and nil on a device without a hinge. New layout APIs keep content out of
  the hinge and under-display-camera regions. **DOCUMENTED, secondary.** The names are not
  checked: they aren't in SDK 26.2, and one source says the early Xcode 27 betas lacked the Duo SDK.

## To a page (Safari 27.1)

- Viewports run from 382 CSS px wide (the outer screen, portrait) to 951 (the inner screen,
  landscape). **DOCUMENTED, secondary** (ppc.land, citing WebKit's Safari 27.1 features post.)
- The Device Posture and Viewport Segments APIs are previews in Safari 27.1, **off by default**
  behind Feature Flags. **DOCUMENTED, secondary** (same; idevice.com, digitbin.)
- No source gave Safari's user agent on the Duo. **INFERRED:** it says "iPhone" with no model,
  like every iPhone.

## Implications for Ducter

1. The iPhone app's size-class rule (an iPhone that is regular both ways is a foldable, D317) fits
   the Duo's inner screen. The app reads it at launch, so a Duo opened folded reads as a phone.
   Exact detection needs the hinge API (whether a hinge exists), which needs the iOS 27.1 SDK.
2. Safari: an "iPhone" user agent whose screen is 600 px or more on its short side can only be the
   inner screen, so it is a foldable. When the flags are on, segments or posture say so first.
3. The fold layout (D182) can use the page's own viewport segments in Safari once WebKit turns
   them on. A native fold position from the app waits for the hinge API.

Summary: the iPhone Duo is real and book-style. Ducter recognises it from size classes (in the
app) and screen size (in Safari). The hinge position and posture wait on an SDK this machine
doesn't have.

Sources: apple.com/iphone-duo; apple.com/newsroom/2026/09/apple-unveils-iphone-duo;
macworld.com/article/3230936; petapixel.com/2026/09/09; kodeco.com/54224360;
swiftjectivec.com/iPhone-Duo-First-Developer-Good-to-Knows; infoq.com/news/2026/09/apple-iphone-duo-api;
ppc.land/safari-27-1-on-iphone-duo-runs-web-pages-from-382-to-951-pixels-wide;
idevice.com/apple-wants-to-give-web-pages-more-of-the-iphone-duo-s-outer-screen.
