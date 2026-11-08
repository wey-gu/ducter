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

    static let radius: CGFloat = 16
    static let radiusSmall: CGFloat = 12

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

/// The primary button: the accent, full width, one thumb.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(Pebble.onAccent)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Pebble.accent.opacity(configuration.isPressed ? 0.8 : 1), in: RoundedRectangle(cornerRadius: Pebble.radius, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// A quiet button: ink on the sunken surface.
struct QuietButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.medium))
            .foregroundStyle(Pebble.ink)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(Pebble.surfaceSunken.opacity(configuration.isPressed ? 0.7 : 1), in: RoundedRectangle(cornerRadius: Pebble.radius, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}
