import ImageIO
import SwiftUI
import UIKit

// D537: the share sheet's own screen. One screen, Pebble's clay: what is being sent (a link, words,
// pictures, files) on a card, the note (附言) with the keyboard up, whom it goes to when there is
// more than one partner, and Send. Nothing leaves the phone before Send. Shared by the extension
// and, in Debug, the app's specimen (`-shareSpecimen link|photo|pdf|text|many|queued`).

/// The share sheet's words: their own table (Share.strings), in the language the page speaks.
func SL(_ key: String, _ args: CVarArg...) -> String {
    let lang = (Paired.locale ?? Locale.preferredLanguages.first ?? "en").hasPrefix("zh") ? "zh-Hans" : "en"
    let b = Bundle.main.path(forResource: lang, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
    let s = b.localizedString(forKey: key, value: nil, table: "Share")
    return args.isEmpty ? s : String(format: s, arguments: args)
}

@MainActor
final class ShareModel: ObservableObject {
    enum Phase: Equatable { case loading, ready, sending, sent(String), queued, homeOld, notPaired, nothing, refused }

    @Published var draft: ShareDraft
    @Published var note = ""
    @Published var partners: [SharePartner]
    @Published var partner: String
    @Published var phase: Phase = .loading
    /// The sheet should close (the extension completes its request; Cancel cancels it).
    var done: (_ cancelled: Bool) -> Void = { _ in }
    let compose: URL?
    /// Where the share's pictures and files are now: its compose folder, then its outbox entry.
    @Published var dir: URL?

    init(draft: ShareDraft, compose: URL?) {
        self.draft = draft
        self.compose = compose
        dir = compose
        let saved = Paired.partners
        partners = saved
        partner = Paired.lastPartner.flatMap { id in saved.contains { $0.id == id } ? id : nil } ?? saved.first?.id ?? "default"
    }

    var name: String { partners.first { $0.id == partner }?.name ?? Paired.personaName ?? "Ducter" }
    var look: String { partners.first { $0.id == partner }?.look ?? "sand" }

    func ready(_ d: ShareDraft) {
        draft = d
        if Keychain.token == nil || Paired.base == nil { phase = .notPaired; return }
        phase = d.isEmpty ? .nothing : .ready
    }

    /// The partners from the home, when it answers; the picker keeps what the person chose.
    func refreshPartners() async {
        let list = await ShareSender.partners()
        guard !list.isEmpty else { return }
        partners = list
        if !list.contains(where: { $0.id == partner }) { partner = Paired.lastPartner.flatMap { id in list.contains { $0.id == id } ? id : nil } ?? list[0].id }
    }

    func cancel() {
        if let c = compose { try? FileManager.default.removeItem(at: c) }
        done(true)
    }

    /// Send: kept in the outbox first (the words are never lost), then sent. A share still going
    /// after a few seconds (a big file) carries on while the system allows and the sheet closes.
    func send() {
        guard phase == .ready else { return }
        var d = draft
        d.note = note
        d.partner = partner == "default" ? nil : partner
        d.at = Date()
        Paired.lastPartner = partner
        guard let c = compose, let dir = ShareOutbox.commit(d, from: c) else { phase = .queued; closeSoon(1.8); return }
        self.dir = dir
        phase = .sending
        let shown = name
        Task {
            let r = await ShareSender.send(dir: dir)
            switch r {
            case .sent:
                Haptic.success()
                phase = .sent(shown)
                closeSoon(0.75)
            case .queued: phase = .queued; closeSoon(2.2)
            case .homeOld: phase = .homeOld; closeSoon(3)
            case .notPaired: phase = .notPaired
            case .refused: phase = .refused
            }
        }
    }

    func closeSoon(_ s: Double) {
        Task {
            try? await Task.sleep(nanoseconds: UInt64(s * 1_000_000_000))
            done(false)
        }
    }
}

enum Haptic {
    @MainActor static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}

/// D497: a partner's own clay, as LOOK_CLAY recolours the figure (hue-rotate, then saturate).
struct PartnerFigure: View {
    let look: String
    var size: CGFloat = 28
    private var clay: (Double, Double) {
        switch look {
        case "sage": return (95, 0.62)
        case "sky": return (175, 0.85)
        case "plum": return (255, 0.7)
        case "apricot": return (-28, 1)
        default: return (0, 1)
        }
    }
    var body: some View {
        Image("Idle").resizable().scaledToFit().frame(width: size, height: size)
            .hueRotation(.degrees(clay.0)).saturation(clay.1)
            .accessibilityHidden(true)
    }
}

struct ShareSheet: View {
    @ObservedObject var m: ShareModel
    @FocusState private var noteFocus: Bool
    @Environment(\.accessibilityReduceMotion) private var still

    var body: some View {
        VStack(spacing: 0) {
            head
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    switch m.phase {
                    case .notPaired: notice(SL("share.notPaired"), art: "Napping")
                    case .nothing: notice(SL("share.nothing"), art: "Napping")
                    case .loading: loading
                    default: compose
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 16)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            foot
        }
        .background(Pebble.bg.ignoresSafeArea())
        .onChange(of: m.phase) { _, p in if p == .ready { noteFocus = true } }
        .onAppear { if m.phase == .ready { noteFocus = true } }
    }

    private var head: some View {
        ZStack {
            // Not paired, or nothing to send: no one to send to, so no title naming one.
            HStack(spacing: 8) {
                PartnerFigure(look: m.look, size: 26)
                Text(SL("share.title", m.name)).font(Pebble.text(17, .bold, relativeTo: .headline)).foregroundStyle(Pebble.ink).lineLimit(1)
            }
            .padding(.horizontal, 88)
            .opacity(m.phase == .notPaired || m.phase == .nothing ? 0 : 1)
            .animation(still ? nil : .snappy(duration: 0.22), value: m.partner)
            HStack {
                Button(SL("share.cancel")) { m.cancel() }
                    .font(Pebble.text(16, .regular, relativeTo: .body))
                    .foregroundStyle(Pebble.inkSoft)
                    .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                    .padding(.leading, 20)
                    .disabled(isSending)
                Spacer()
            }
        }
        .frame(height: 56)
    }

    private var isSending: Bool {
        if case .sending = m.phase { return true }
        if case .sent = m.phase { return true }
        return false
    }

    private var loading: some View {
        HStack(spacing: 10) {
            ProgressView().tint(Pebble.inkMuted)
            Text(SL("share.loading")).font(Pebble.text(15)).foregroundStyle(Pebble.inkMuted)
        }
        .frame(maxWidth: .infinity, minHeight: 120)
    }

    @ViewBuilder private var compose: some View {
        SharedCard(draft: m.draft, dir: m.dir)
        if m.draft.leftOut > 0 { line(SL("share.tooMany")) }
        if m.draft.tooBig > 0 { line(SL("share.tooBig")) }
        noteField
        if m.partners.count > 1 { picker }
        switch m.phase {
        case .queued: line(SL("share.queued"), strong: true)
        case .homeOld: line(SL("share.homeOld"), strong: true)
        case .refused: line(SL("share.refused"), failed: true)
        default: EmptyView()
        }
    }

    private var noteField: some View {
        ZStack(alignment: .topLeading) {
            if m.note.isEmpty {
                Text(SL("share.note.placeholder", m.name))
                    .font(Pebble.text(17)).foregroundStyle(Pebble.inkMuted)
                    .padding(.horizontal, 16).padding(.vertical, 14)
                    .allowsHitTesting(false)
            }
            TextField("", text: $m.note, axis: .vertical)
                .font(Pebble.text(17)).foregroundStyle(Pebble.ink)
                .lineLimit(3...8)
                .focused($noteFocus)
                .padding(.horizontal, 16).padding(.vertical, 14)
                .accessibilityLabel(SL("share.note.placeholder", m.name))
                .disabled(isSending)
        }
        .frame(minHeight: 96, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: Pebble.radiusSmall + 2, style: .continuous).fill(Pebble.surfaceSunken))
        .overlay(RoundedRectangle(cornerRadius: Pebble.radiusSmall + 2, style: .continuous).strokeBorder(noteFocus ? Pebble.accent.opacity(0.55) : Pebble.line, lineWidth: noteFocus ? 1.5 : 1))
        .animation(still ? nil : .easeOut(duration: 0.16), value: noteFocus)
    }

    private var picker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(SL("share.to")).font(Pebble.text(13, .bold, relativeTo: .subheadline)).foregroundStyle(Pebble.inkMuted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(m.partners) { p in
                        let on = p.id == m.partner
                        Button {
                            m.partner = p.id
                            UISelectionFeedbackGenerator().selectionChanged()
                        } label: {
                            HStack(spacing: 6) {
                                PartnerFigure(look: p.look, size: 24)
                                Text(p.name).font(Pebble.text(15, on ? .bold : .regular)).lineLimit(1)
                            }
                            .foregroundStyle(on ? Pebble.ink : Pebble.inkSoft)
                            .padding(.leading, 8).padding(.trailing, 14)
                            .frame(minHeight: 44)
                            .background {
                                let shape = RoundedRectangle(cornerRadius: Pebble.radiusSmall, style: .continuous)
                                ZStack {
                                    shape.fill(on ? Pebble.pressAccent : Pebble.pressQuiet).offset(y: 3)
                                    shape.fill(on ? Pebble.accent : Pebble.surface)
                                    shape.strokeBorder(on ? Color.clear : Pebble.line, lineWidth: 1)
                                }
                            }
                            .padding(.bottom, 3)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(p.name)
                        .accessibilityAddTraits(on ? .isSelected : [])
                        .disabled(isSending)
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .animation(still ? nil : .snappy(duration: 0.2), value: m.partner)
    }

    private func line(_ s: String, strong: Bool = false, failed: Bool = false) -> some View {
        Text(s).font(Pebble.text(14, strong ? .bold : .regular)).lineSpacing(3)
            .foregroundStyle(failed ? Pebble.failedInk : strong ? Pebble.inkSoft : Pebble.inkMuted)
            .fixedSize(horizontal: false, vertical: true)
            .transition(.opacity)
    }

    private func notice(_ s: String, art: String) -> some View {
        VStack(spacing: 16) {
            Image(art).resizable().scaledToFit().frame(width: 120).padding(.top, 28).accessibilityHidden(true)
            Text(s).font(Pebble.text(16)).lineSpacing(5).foregroundStyle(Pebble.inkSoft).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private var foot: some View {
        Group {
            switch m.phase {
            case .notPaired, .nothing:
                Button(SL("share.ok")) { m.cancel() }.buttonStyle(PrimaryButtonStyle())
            case .sending:
                Button {} label: {
                    HStack(spacing: 10) { ProgressView().tint(Pebble.bg); Text(SL("share.sending")) }
                }.buttonStyle(PrimaryButtonStyle()).allowsHitTesting(false)
            case .sent(let name):
                Button {} label: {
                    HStack(spacing: 8) { Image(systemName: "checkmark").font(.system(size: 15, weight: .bold)); Text(SL("share.sent", name)) }
                }.buttonStyle(PrimaryButtonStyle()).allowsHitTesting(false)
            case .queued, .homeOld, .refused:
                Button(SL("share.ok")) { m.done(false) }.buttonStyle(PrimaryButtonStyle())
            default:
                Button(SL("share.send")) { m.send() }.buttonStyle(PrimaryButtonStyle()).disabled(m.phase != .ready)
                    .keyboardShortcut(.return, modifiers: .command)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 12)
        .frame(maxWidth: 560)
        .frame(maxWidth: .infinity)
        .background(Pebble.bg)
        .animation(still ? nil : .snappy(duration: 0.22), value: m.phase)
    }
}

/// What is being sent, drawn as itself: a link, someone's words, pictures, files.
struct SharedCard: View {
    let draft: ShareDraft
    let dir: URL?
    private var pictures: [ShareItem] { draft.items.filter { $0.kind == .picture } }
    private var files: [ShareItem] { draft.items.filter { $0.kind == .file } }
    private var words: String { (draft.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let u = draft.url.flatMap(URL.init(string:)) { link(u) }
            if !words.isEmpty, words != draft.url {
                Text(words).font(Pebble.text(15)).lineSpacing(4).foregroundStyle(Pebble.inkSoft).lineLimit(6)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if !pictures.isEmpty { PictureStrip(items: pictures, dir: dir) }
            ForEach(files) { f in FileRow(item: f, dir: dir) }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            let shape = RoundedRectangle(cornerRadius: 18, style: .continuous)
            ZStack {
                shape.fill(Pebble.line2.opacity(0.9)).offset(y: Pebble.base)
                shape.fill(Pebble.surface)
                shape.strokeBorder(Pebble.line, lineWidth: 1)
            }
        }
        .padding(.bottom, Pebble.base)
        .accessibilityElement(children: .combine)
    }

    private func link(_ u: URL) -> some View {
        let host = (u.host(percentEncoded: false) ?? u.absoluteString).replacingOccurrences(of: "www.", with: "")
        let title = (draft.title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return HStack(alignment: .center, spacing: 12) {
            RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Pebble.surfaceSunken)
                .frame(width: 44, height: 44)
                .overlay(Image(systemName: "link").font(.system(size: 17, weight: .bold)).foregroundStyle(Pebble.accent))
            VStack(alignment: .leading, spacing: 3) {
                Text(title.isEmpty ? host : title).font(Pebble.text(15, .bold)).foregroundStyle(Pebble.ink).lineLimit(2)
                Text(host).font(Pebble.text(13)).foregroundStyle(Pebble.inkMuted).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }
}

/// One picture at its own shape; several as a row of tiles.
struct PictureStrip: View {
    let items: [ShareItem]
    let dir: URL?

    private func image(_ it: ShareItem) -> UIImage? {
        guard let dir else { return nil }
        let u = dir.appendingPathComponent(it.thumb ?? it.file)
        guard let src = CGImageSourceCreateWithURL(u as CFURL, nil), let cg = SharePrepare.scaled(src, edge: 600) else { return nil }
        return UIImage(cgImage: cg)
    }

    var body: some View {
        if items.count == 1, let it = items.first {
            // At its own shape (clamped as the conversation's grid does), at most 220 tall, from the left.
            let ratio = min(max(CGFloat(it.w ?? 4) / CGFloat(max(it.h ?? 3, 1)), 0.5), 2.4)
            tile(it)
                .aspectRatio(ratio, contentMode: .fit)
                .frame(maxWidth: 220 * ratio, maxHeight: 220)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(items) { it in tile(it).frame(width: 84, height: 84) }
                }
            }
        }
    }

    private func tile(_ it: ShareItem) -> some View {
        Group {
            if let img = image(it) { Image(uiImage: img).resizable().scaledToFill() } else { Pebble.surfaceSunken }
        }
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .contentShape(Rectangle())
    }
}

/// A file as the conversation draws it (D286): a little page whose band says its extension, its
/// name and size.
struct FileRow: View {
    let item: ShareItem
    let dir: URL?

    var body: some View {
        HStack(spacing: 12) {
            FileBadge(ext: item.ext)
            VStack(alignment: .leading, spacing: 3) {
                Text(item.name).font(Pebble.text(15, .bold)).foregroundStyle(Pebble.ink).lineLimit(2).truncationMode(.middle)
                HStack(spacing: 10) {
                    ForEach(detail, id: \.self) { Text($0) }
                }
                .font(Pebble.text(13)).foregroundStyle(Pebble.inkMuted).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }

    /// Its size and, for a PDF, its pages: each fact its own element (D291).
    private var detail: [String] {
        let size = ByteCountFormatter.string(fromByteCount: Int64(item.bytes), countStyle: .file)
        if item.ext == "pdf", let d = dir, let doc = CGPDFDocument(d.appendingPathComponent(item.file) as CFURL) {
            return [size, SL("share.pages", doc.numberOfPages)]
        }
        return [size]
    }
}

struct FileBadge: View {
    let ext: String
    @Environment(\.colorScheme) private var scheme

    /// app.css --fam-*, light and dark.
    private var family: (UInt32, UInt32) {
        switch ext {
        case "pdf": return (0xD65A40, 0xEE8A72)
        case "doc", "docx", "pages", "rtf", "odt": return (0x3F74C2, 0x7CA9EA)
        case "xls", "xlsx", "csv", "tsv", "numbers", "ods": return (0x3C8F57, 0x74C48E)
        case "ppt", "pptx", "key", "odp": return (0xD9772C, 0xF2A35F)
        case "zip", "gz", "tgz", "tar", "7z", "rar": return (0x9A7A50, 0xC9A77A)
        case "m4a", "mp3", "wav", "aac", "flac": return (0x8659BD, 0xB893E8)
        case "mp4", "mov", "m4v", "webm": return (0x2F8A92, 0x66C0C7)
        case "txt", "md", "log": return (0x8C7458, 0xC4AA8A)
        case "ts", "js", "go", "py", "swift", "kt", "rs", "sh", "json", "yaml", "yml", "html", "css": return (0x5469A3, 0x8EA4DC)
        case "jpg", "jpeg", "png", "heic", "gif", "webp": return (0xC1648A, 0xE69BB8)
        default: return (0x9A8670, 0xB9A690)
        }
    }

    var body: some View {
        let band = Color(UIColor(hex: scheme == .dark ? family.1 : family.0))
        let on = Color(UIColor(hex: scheme == .dark ? 0x1A130D : 0xFFFFFF))
        ZStack(alignment: .bottom) {
            RoundedRectangle(cornerRadius: 5, style: .continuous).fill(Pebble.surfaceSunken)
                .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous).strokeBorder(Pebble.line, lineWidth: 1))
            Text(ext.isEmpty ? "FILE" : String(ext.uppercased().prefix(4)))
                .font(.system(size: 9, weight: .heavy, design: .rounded)).foregroundStyle(on)
                .frame(maxWidth: .infinity).frame(height: 15)
                .background(band)
                .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: 5, bottomTrailingRadius: 5, style: .continuous))
        }
        .frame(width: 36, height: 44)
        .accessibilityHidden(true)
    }
}
