#if DEBUG
import SwiftUI
import UniformTypeIdentifiers

/// D537: the share sheet in the app, for the Simulator's shots and an end-to-end send: the same
/// view, the same reading of what was handed over (NSItemProviders made from fixture files) and the
/// same sending, against whatever home the app is paired with (a demo core in the Simulator).
///   xcrun simctl launch booted co.nowledge.ducter.ios -shareSpecimen link|photo|pdf|text|many
/// Fixture files are read from the app's Documents/share-fixture (photo.heic, photo2.heic, photo3.heic and one PDF).
struct ShareSpecimen: View {
    let kind: String
    @StateObject private var m: ShareModel
    @State private var shown = true

    init(kind: String) {
        self.kind = kind
        let id = "share-specimen-" + UUID().uuidString.lowercased()
        _m = StateObject(wrappedValue: ShareModel(draft: ShareDraft(clientId: id), compose: ShareOutbox.folder("Compose", id)))
    }

    var body: some View {
        ZStack {
            // The app it was shared from, dimmed under the sheet, as the system shows it.
            Color(UIColor.systemGray5).ignoresSafeArea()
            Color.black.opacity(0.18).ignoresSafeArea()
        }
        .sheet(isPresented: $shown) {
            ShareSheet(m: m).tint(Pebble.accent)
                .presentationDragIndicator(.hidden)
                .interactiveDismissDisabled()
        }
        .task {
            m.done = { _ in shown = false }
            guard let dir = m.compose else { return }
            if let lang = UserDefaults.standard.string(forKey: "shareLang") { Paired.locale = lang }
            let d = await ShareInput.read(parts(), clientId: m.draft.clientId, into: dir)
            m.ready(d)
            if let note = UserDefaults.standard.string(forKey: "shareNote") { m.note = note }
            if let p = UserDefaults.standard.string(forKey: "sharePartner") { m.partner = p }
            await m.refreshPartners()
            if let p = UserDefaults.standard.string(forKey: "sharePartner") { m.partner = p }
            switch UserDefaults.standard.string(forKey: "sharePhase") {
            case "queued": m.phase = .queued
            case "sent": m.phase = .sent(m.name)
            case "sending": m.phase = .sending
            case "notPaired": m.phase = .notPaired
            default: break
            }
            if UserDefaults.standard.bool(forKey: "shareSend") { m.send() }
        }
    }

    private func fixture(_ name: String) -> URL? {
        let u = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("share-fixture/\(name)")
        return FileManager.default.fileExists(atPath: u.path) ? u : nil
    }

    /// As Files hands one over: the file, under its own name.
    private func provider(_ u: URL) -> NSItemProvider? {
        let p = NSItemProvider(contentsOf: u)
        p?.suggestedName = u.deletingPathExtension().lastPathComponent
        return p
    }

    /// The fixture folder's PDF, under its own name.
    private func pdf() -> URL? {
        let d = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("share-fixture")
        return ((try? FileManager.default.contentsOfDirectory(at: d, includingPropertiesForKeys: nil)) ?? []).first { $0.pathExtension == "pdf" }
    }

    private func parts() -> [ShareInput.Part] {
        let zh = (Paired.locale ?? "en").hasPrefix("zh")
        switch kind {
        case "link":
            let u = URL(string: zh ? "https://mp.weixin.qq.com/s/ducter-share-sheet" : "https://www.anthropic.com/news/claude-for-chrome")!
            return [ShareInput.Part(providers: [NSItemProvider(object: u as NSURL)], title: zh ? "把手机上的东西交给你的 AI 伙伴：分享扩展是怎么做的" : "Piloting Claude for Chrome", text: nil)]
        case "text":
            let t = zh ? "周六上午十点，市儿童医院口腔科，带上医保卡和上次的片子。改约要提前一天打电话。" : "Saturday 10:00, Children's Hospital dental clinic. Bring the insurance card and last visit's X-rays. To reschedule, call a day ahead."
            return [ShareInput.Part(providers: [NSItemProvider(object: t as NSString)], title: nil, text: nil)]
        case "photo":
            return [ShareInput.Part(providers: [fixture("photo.heic") ?? fixture("photo.jpg")].compactMap { $0 }.compactMap(provider), title: nil, text: nil)]
        case "pdf":
            return [ShareInput.Part(providers: [pdf()].compactMap { $0 }.compactMap(provider), title: nil, text: nil)]
        default:
            let files = ["photo.heic", "photo2.heic", "photo3.heic"].compactMap(fixture) + [pdf()].compactMap { $0 }
            return [ShareInput.Part(providers: files.compactMap(provider), title: nil, text: nil)]
        }
    }
}
#endif
