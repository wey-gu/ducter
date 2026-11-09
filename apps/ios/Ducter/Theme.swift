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
    static let pressPrimary = dynamic(0x000000, 0x8A7A66)
    static let pressAccent = dynamic(0xC9642A, 0xC9642A)
    static let pressQuiet = dynamic(0xE0C9B0, 0x0D0A07)
    /// Clay depth (D76): a card rests on a solid 4pt base; a button stands on a ledge (4pt at
    /// the 52 size), with a soft drop and a 1.5pt top highlight, and sinks into it when pressed.
    static let base: CGFloat = 4
    static let ledge: CGFloat = 4
    static let dropColor = Color(UIColor(hex: 0x2B2118).withAlphaComponent(0.28))
    static let dropPressedColor = Color(UIColor(hex: 0x2B2118).withAlphaComponent(0.22))

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

/// A clay button (D76): its fill on a ledge of a darker shade, a soft drop, a 1.5pt top
/// highlight; pressing sinks it into the ledge (70 ms).
private struct LedgeButton: View {
    let configuration: ButtonStyle.Configuration
    let fill: Color, ledge: Color, ink: Color, highlight: Color
    var rim: Color = .clear
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Pebble.buttonRadius, style: .continuous)
        let pressed = configuration.isPressed
        let down = pressed ? Pebble.ledge : 0
        configuration.label
            .font(Pebble.text(16, .bold, relativeTo: .headline))
            .foregroundStyle(ink)
            .frame(maxWidth: .infinity, minHeight: Pebble.buttonHeight)
            .background(fill, in: shape)
            .overlay(shape.inset(by: 0.5).stroke(rim, lineWidth: 1))
            .overlay(alignment: .top) {
                shape.stroke(highlight, lineWidth: 1.5).mask(alignment: .top) { Rectangle().frame(height: 1.5) }.padding(.horizontal, 6)
            }
            .background(ledge, in: shape.offset(y: Pebble.ledge - down))
            .shadow(color: pressed ? Pebble.dropPressedColor : Pebble.dropColor, radius: pressed ? 1.5 : 6, y: pressed ? 1 : 7 + Pebble.ledge - down)
            .offset(y: down)
            .padding(.bottom, Pebble.ledge)
            .animation(.easeOut(duration: 0.07), value: pressed)
    }
}

/// The primary button: ink, cream words, on a black ledge. One per screen, last.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        LedgeButton(configuration: configuration, fill: Pebble.ink, ledge: Pebble.pressPrimary, ink: Pebble.bg, highlight: Color(UIColor(hex: 0xFFF6EA).withAlphaComponent(0.22)))
    }
}

/// A secondary button: cream with a hairline rim, on a warm ledge.
struct QuietButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        LedgeButton(configuration: configuration, fill: Pebble.bg, ledge: Pebble.pressQuiet, ink: Pebble.ink, highlight: Color.white.opacity(0.95), rim: Pebble.ink.opacity(0.09))
    }
}
