import SwiftUI
import UIKit

/// Pebble, the default theme: the same tokens as apps/web/static/app.css and
/// apps/desktop/internal/theme. Views use these names, never raw colors.
enum Pebble {
    static let bg = dynamic(0xFFF6EA, 0x17120E)
    static let surface = dynamic(0xFFFFFF, 0x231C16)
    static let sunken = dynamic(0xF7EBDA, 0x1D1712)
    static let surfaceSunken = dynamic(0xF3E6D3, 0x1D1712)
    static let ink = dynamic(0x2B2118, 0xF6EBDD)
    static let inkSoft = dynamic(0x4A3D30, 0xDCCBB6)
    static let inkMuted = dynamic(0x75654F, 0xA8957E)
    static let accent = dynamic(0xFF8A3D, 0xFF8A3D)
    static let onAccent = dynamic(0x2B2118, 0x2B2118)
    static let line = dynamic(0xE8D9C4, 0x3A3027)
    static let line2 = dynamic(0xE0C9B0, 0x0D0A07)
    static let failedInk = dynamic(0x8A1F3B, 0xF8A9BC)
    /// Ledges: a darker shade of each filled button's fill (app.css --press-*).
    static let pressAccent = dynamic(0xC9642A, 0xC9642A)
    static let pressQuiet = dynamic(0xE0C9B0, 0x0D0A07)
    /// Clay depth (D76): a card rests on a solid 4pt base; a button stands on a ledge (4pt at
    /// the 52 size), with a soft drop and a 1.5pt top highlight, and sinks into it when pressed.
    static let base: CGFloat = 4
    static let ledge: CGFloat = 4

    static let radius: CGFloat = 24
    static let radiusSmall: CGFloat = 12
    /// The setup screens use the large control (ui.md: 52, radius 18, type 16).
    static let buttonRadius: CGFloat = 18
    static let buttonHeight: CGFloat = 52

    /// Titles: Bricolage 800 (CJK falls back to PingFang SC). zh titles one step down (D78:
    /// native clients can't scale one face, so 34→32, 28→26, 20→19).
    static func display(_ size: CGFloat, _ weight: Font.Weight = .heavy) -> Font {
        Font.custom("Bricolage Grotesque", size: zhStep(size), relativeTo: .title).weight(weight)
    }

    /// Reading and controls: Bricolage, PingFang SC for Chinese (the system's CJK fallback).
    static func text(_ size: CGFloat, _ weight: Font.Weight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        Font.custom("Bricolage Grotesque", size: size, relativeTo: style).weight(weight)
    }

    private static func zhStep(_ size: CGFloat) -> CGFloat {
        guard Locale.preferredLanguages.first?.hasPrefix("zh") == true else { return size }
        switch size {
        case 34: return 32
        case 28: return 26
        case 20: return 19
        default: return size
        }
    }

    static let uiBg = UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: 0x17120E) : UIColor(hex: 0xFFF6EA) }

    private static func dynamic(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(red: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

/// How one clay button is built (D76): a fill (flat or a top-to-bottom gradient), a 1.5pt inner
/// top highlight, a 1pt inner rim, a 1pt seam right under the fill, then the ledge; 4pt in all
/// at the 52 size. Pressed, it sinks: seam and ledge go to 0 and the drop tightens.
struct Clay {
    var top: Color, bottom: Color, ink: Color
    var highlight: Color, rim: Color = .clear
    var seam: Color, ledge: Color
    var drop: Double = 0.28

    /// Ink: a #000 ledge disappears under #2B2118, so the ink gets a slight gradient, a warm seam
    /// and a near-black ledge, and a deeper drop.
    static let primary = Clay(
        top: dyn(0x3B2D22, 0xFFF6EA), bottom: dyn(0x2B2118, 0xF6EBDD), ink: Pebble.bg,
        highlight: dynA(0xFFF6EA, 0.26, 0xFFFFFF, 0.5), rim: dynA(0xFFECD6, 0.08, 0x2B2118, 0.08),
        seam: dyn(0x5A4434, 0xCDBBA5), ledge: dyn(0x140D07, 0x8A7A66), drop: 0.38)
    static let secondary = Clay(
        top: Pebble.bg, bottom: Pebble.bg, ink: Pebble.ink,
        highlight: dynA(0xFFFFFF, 0.95, 0xFFFFFF, 0.06), rim: dynA(0x2B2118, 0.09, 0xFFFFFF, 0.06),
        seam: dyn(0xF3E3CC, 0x2C241D), ledge: Pebble.pressQuiet)
    static let accent = Clay(
        top: Pebble.accent, bottom: Pebble.accent, ink: Pebble.onAccent,
        highlight: Color.white.opacity(0.38),
        seam: dyn(0xFFA466, 0xFFA466), ledge: Pebble.pressAccent)

    private static func dyn(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark) : UIColor(hex: light) })
    }
    private static func dynA(_ light: UInt32, _ la: CGFloat, _ dark: UInt32, _ da: CGFloat) -> Color {
        Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(hex: dark).withAlphaComponent(da) : UIColor(hex: light).withAlphaComponent(la) })
    }
}

private struct ClayButton: View {
    let configuration: ButtonStyle.Configuration
    let clay: Clay
    @Environment(\.clayPressed) private var forcedPress
    private let seamH: CGFloat = 1

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Pebble.buttonRadius, style: .continuous)
        let pressed = forcedPress ?? configuration.isPressed
        let down = pressed ? Pebble.ledge : 0
        configuration.label
            .font(Pebble.text(16, .bold, relativeTo: .headline))
            .foregroundStyle(clay.ink)
            .frame(maxWidth: .infinity, minHeight: Pebble.buttonHeight)
            .background {
                ZStack {
                    shape.fill(clay.ledge).offset(y: Pebble.ledge - down)
                    shape.fill(clay.seam).offset(y: pressed ? 0 : seamH)
                    shape.fill(LinearGradient(colors: [clay.top, clay.bottom], startPoint: .top, endPoint: .bottom))
                    shape.inset(by: 0.5).stroke(clay.rim, lineWidth: 1)
                    // The inner top highlight: 1.5pt inside the top edge.
                    shape.stroke(clay.highlight, lineWidth: 3).clipShape(shape)
                        .mask(alignment: .top) { Rectangle().frame(height: 1.5) }
                }
                .compositingGroup()
                .shadow(color: Color(UIColor(hex: 0x2B2118)).opacity(pressed ? 0.22 : clay.drop), radius: pressed ? 1.5 : 6, y: pressed ? 1 : 7)
            }
            .offset(y: down)
            .padding(.bottom, Pebble.ledge)
            .animation(.easeOut(duration: 0.07), value: pressed)
    }
}

/// The primary button: ink, cream words. One per screen, last.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { ClayButton(configuration: configuration, clay: .primary) }
}

/// A secondary button: cream with a hairline rim, on a warm ledge.
struct QuietButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { ClayButton(configuration: configuration, clay: .secondary) }
}

/// The accent button: orange on its ledge (the equip; the composer's send lives in the page).
struct AccentButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { ClayButton(configuration: configuration, clay: .accent) }
}

private struct ClayPressedKey: EnvironmentKey {
    static let defaultValue: Bool? = nil
}

extension EnvironmentValues {
    /// Shows a clay button as pressed (or at rest) regardless of touch: the button specimen only.
    var clayPressed: Bool? {
        get { self[ClayPressedKey.self] }
        set { self[ClayPressedKey.self] = newValue }
    }
}

#if DEBUG
/// The clay buttons at rest and pressed, for screenshots (`-buttonSpecimen YES`).
struct ButtonSpecimen: View {
    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            ForEach([false, true], id: \.self) { down in
                VStack(spacing: 18) {
                    Text(down ? "Pressed" : "At rest").font(Pebble.text(13, .bold)).foregroundStyle(Pebble.inkMuted)
                    Button("Merge") {}.buttonStyle(PrimaryButtonStyle())
                    Button("Hold") {}.buttonStyle(QuietButtonStyle())
                    Button("Send") {}.buttonStyle(AccentButtonStyle())
                }
                .environment(\.clayPressed, down)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Pebble.bg)
    }
}
#endif
