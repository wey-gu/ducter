import Foundation
import UniformTypeIdentifiers

/// D537: what another app handed the share sheet, read into a draft: a link (with the page's
/// title when the app gave one), words, pictures (made ready here, D206) and files, at most ten.
/// Nothing is sent; the pictures and files wait in the share's compose folder until Send.
enum ShareInput {
    /// One extension item's parts: its attachments, and the title and words some apps put beside them.
    struct Part {
        var providers: [NSItemProvider]
        var title: String?
        var text: String?
    }

    static func read(_ parts: [Part], clientId: String, into dir: URL) async -> ShareDraft {
        var d = ShareDraft(clientId: clientId)
        var count = 0
        for part in parts {
            if d.title == nil, let t = part.title?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty { d.title = t }
            if d.text == nil, let t = part.text?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty { d.text = t }
            for p in part.providers {
                // A web link (not a file): the link.
                if p.hasItemConformingToTypeIdentifier(UTType.url.identifier), let u = await webURL(p) {
                    if d.url == nil { d.url = u.absoluteString }
                    continue
                }
                if count >= ShareLimits.perMessage, p.hasItemConformingToTypeIdentifier(UTType.data.identifier) || p.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    d.leftOut += 1
                    continue
                }
                // A picture: made ready on the phone, metadata gone.
                if p.hasItemConformingToTypeIdentifier(UTType.image.identifier), !p.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) {
                    if let data = await data(p, UTType.image.identifier), let it = SharePrepare.picture(data, name: p.suggestedName ?? "IMG", into: dir) {
                        d.items.append(it)
                        count += 1
                        continue
                    }
                }
                // Words (a passage, a post): kept as words; a lone link in them is the link (the home says so too).
                if p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier), !p.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                    if let s = await words(p) {
                        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !t.isEmpty { d.text = d.text.map { $0 == t ? $0 : "\($0)\n\n\(t)" } ?? t }
                    }
                    continue
                }
                // Anything else is a file, as it is (a PDF, a document, a zip).
                let type = p.registeredTypeIdentifiers.first { UTType($0)?.conforms(to: .data) == true } ?? UTType.data.identifier
                let (it, big) = await file(p, type, into: dir)
                if let it { d.items.append(it); count += 1 } else if big { d.tooBig += 1 }
            }
        }
        if let u = d.url, d.text == u { d.text = nil }
        // Beside a link, one short line (Safari's page title, a post's heading) is its title.
        if d.url != nil, d.title == nil, let t = d.text, !t.contains("\n"), t.count <= 200 { d.title = t; d.text = nil }
        return d
    }

    /// Words the provider holds, however the app registered them (a String object, text data).
    private static func words(_ p: NSItemProvider) async -> String? {
        if p.canLoadObject(ofClass: String.self) {
            let s: String? = await withCheckedContinuation { c in _ = p.loadObject(ofClass: String.self) { s, _ in c.resume(returning: s) } }
            if let s { return s }
        }
        let item = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier)
        return (item as? String) ?? (item as? NSString).map { $0 as String } ?? (item as? Data).flatMap { String(data: $0, encoding: .utf8) }
    }

    /// An http(s) link the provider holds; nil for a file's URL (that is a file, read below).
    private static func webURL(_ p: NSItemProvider) async -> URL? {
        var object: URL?
        if p.canLoadObject(ofClass: URL.self) {
            object = await withCheckedContinuation { c in _ = p.loadObject(ofClass: URL.self) { u, _ in c.resume(returning: u) } }
        }
        let item = object == nil ? try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) : nil
        let u: URL? = object ?? (item as? URL) ?? (item as? NSURL).map { $0 as URL } ?? (item as? Data).flatMap { URL(dataRepresentation: $0, relativeTo: nil) } ?? (item as? String).flatMap(URL.init(string:))
        guard let u, !u.isFileURL, ["http", "https"].contains(u.scheme?.lowercased() ?? "") else { return nil }
        return u
    }

    private static func data(_ p: NSItemProvider, _ type: String) async -> Data? {
        await withCheckedContinuation { c in
            _ = p.loadDataRepresentation(forTypeIdentifier: type) { data, _ in c.resume(returning: data) }
        }
    }

    /// The file is only there while the callback runs: it is copied into the compose folder in it.
    private static func file(_ p: NSItemProvider, _ type: String, into dir: URL) async -> (ShareItem?, Bool) {
        await withCheckedContinuation { c in
            _ = p.loadFileRepresentation(forTypeIdentifier: type) { url, _ in
                guard let url else { c.resume(returning: (nil, false)); return }
                // The name the sharing app gives it (Files, Mail); else the copy's own.
                var name = p.suggestedName ?? url.lastPathComponent
                if (name as NSString).pathExtension.isEmpty, !url.pathExtension.isEmpty { name += ".\(url.pathExtension)" }
                let (it, big) = SharePrepare.file(at: url, name: name, into: dir)
                c.resume(returning: (it, big))
            }
        }
    }
}
