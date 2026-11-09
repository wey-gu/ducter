import SwiftUI
import UIKit

/// Pebble, the default theme: the same tokens as apps/web/static/app.css and
/// apps/desktop/internal/theme. Views use these names, never raw colors.
enum Pebble {
    static let bg = dynamic(0xFFF6EA, 0x17120E)
    static let surface = dynamic(0xFFFFFF, 0x231C16)
    static let surfaceSunken = dynamic(0xF3E6D3, 0x1D1712)
    static let ink = dynamic(0x2B2118, 0xF6EBDD)
    static let inkSoft = dynamic(0x4A3D30, 0xDCCBB6)
    static let inkMuted = dynamic(0x75654F, 0xA8957E)
    static let accent = dynamic(0xFF8A3D, 0xFF8A3D)
    static let onAccent = dynamic(0x2B2118, 0x2B2118)
    static let line = dynamic(0xE8D9C4, 0x3A3027)
    static let failedInk = dynamic(0x8A1F3B, 0xF8A9BC)
    /// The UI is flat; the clay art carries the depth (ui.md, D71). A press darkens a
    /// button's fill this much and scales it to `pressScale`; nothing moves down.
    static let pressDarken: Double = 0.06
    static let pressScale: CGFloat = 0.98

    static let radius: CGFloat = 16
    static let radiusSmall: CGFloat = 12
    /// Buttons share the desktop/web component system (ui.md "Components and tokens").
    static let buttonRadius: CGFloat = 12
    static let buttonHeight: CGFloat = 48

    static func display(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        Font.custom("Bricolage Grotesque", size: size, relativeTo: .title).weight(weight)
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

/// A flat button (D71): a solid fill, or the surface with a hairline. Pressing darkens
/// the fill a little and scales it to 0.98; no ledge, no shadow.
private struct FlatButton: View {
    let configuration: ButtonStyle.Configuration
    let fill: Color, ink: Color
    var hairline: Color? = nil
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: Pebble.buttonRadius, style: .continuous)
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(ink)
            .frame(maxWidth: .infinity, minHeight: Pebble.buttonHeight)
            .background(fill, in: shape)
            .overlay(shape.fill(Color.black.opacity(configuration.isPressed ? Pebble.pressDarken : 0)))
            .overlay(shape.stroke(hairline ?? .clear, lineWidth: 1))
            .scaleEffect(configuration.isPressed ? Pebble.pressScale : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// The primary button: the one thing to do. A solid ink fill, full width, one thumb.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        FlatButton(configuration: configuration, fill: Pebble.ink, ink: Pebble.bg)
    }
}

/// A secondary button: ink on the surface, with a hairline.
struct QuietButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        FlatButton(configuration: configuration, fill: Pebble.surface, ink: Pebble.ink, hairline: Pebble.line)
    }
}
