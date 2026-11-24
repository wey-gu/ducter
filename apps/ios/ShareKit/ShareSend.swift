import Foundation
import ImageIO
import UniformTypeIdentifiers

// D537: 分享到 Ducter / Share to Ducter. What the share sheet sends, how a picture is made ready on
// the phone (D206: upright, at most 2048 px, nothing about where it was taken), the outbox in the
// app group that keeps a share the home couldn't take yet, and the two calls that send it:
// POST /api/media for each picture or file, then POST /api/share for the one message.
// Compiled into the app (it empties the outbox when it comes to the front) and the extension.

enum ShareLimits {
    static let perMessage = 10
    static let picture = 25 * 1024 * 1024
    static let file = 50 * 1024 * 1024
    static let longEdge = 2048
    static let thumbEdge = 720
    static let preview = 4096
}

/// One picture or file in a share, made ready and kept in its share's folder.
struct ShareItem: Codable, Identifiable, Equatable {
    enum Kind: String, Codable { case picture, file }
    var id: String
    var kind: Kind
    var name: String
    var type: String
    var bytes: Int
    var w: Int?
    var h: Int?
    /// File names inside the share's folder.
    var file: String
    var thumb: String?
    /// The ~16 px placeholder the conversation shows while the picture loads (a data URL).
    var preview: String?
    /// Set once the home has it (POST /api/media): a retry doesn't send it again.
    var mediaId: String?

    var ext: String { (name as NSString).pathExtension.lowercased() }
}

/// A share: what came in, the note, and for whom. Kept as draft.json in its folder.
struct ShareDraft: Codable, Equatable {
    var clientId: String
    var note: String = ""
    var partner: String?
    var url: String?
    var title: String?
    var text: String?
    var items: [ShareItem] = []
    var at = Date()
    /// What was left out when it came in (more than ten, a file over the cap).
    var leftOut: Int = 0
    var tooBig: Int = 0

    var isEmpty: Bool { note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && (url ?? "").isEmpty && (text ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && items.isEmpty }
}

enum ShareOutcome: Equatable {
    case sent(partner: String)
    /// The home couldn't be reached: it waits in the outbox.
    case queued
    /// The home is older than D537 (no /api/share): it waits until the home is updated.
    case homeOld
    /// No pairing on this phone (or the home no longer knows it).
    case notPaired
    /// The home refused it (nothing it can take); nothing is kept.
    case refused
}

/// The folders: `Compose/<id>` while the sheet is open, `Outbox/<id>` once Send was tapped.
enum ShareOutbox {
    static var root: URL? {
        // A build without the app group (a self-signed one that dropped it) keeps them in its own folder.
        Paired.container ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
    }

    static func folder(_ kind: String, _ id: String) -> URL? {
        guard let r = root else { return nil }
        let u = r.appendingPathComponent("Share", isDirectory: true).appendingPathComponent(kind, isDirectory: true).appendingPathComponent(id, isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }

    static func save(_ d: ShareDraft, in dir: URL) {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        try? e.encode(d).write(to: dir.appendingPathComponent("draft.json"), options: .atomic)
    }

    static func load(_ dir: URL) -> ShareDraft? {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return (try? Data(contentsOf: dir.appendingPathComponent("draft.json"))).flatMap { try? d.decode(ShareDraft.self, from: $0) }
    }

    /// Send was tapped: the compose folder becomes an outbox entry (words are never lost).
    static func commit(_ d: ShareDraft, from compose: URL) -> URL? {
        guard let out = folder("Outbox", d.clientId) else { return nil }
        let fm = FileManager.default
        for f in (try? fm.contentsOfDirectory(atPath: compose.path)) ?? [] {
            try? fm.moveItem(at: compose.appendingPathComponent(f), to: out.appendingPathComponent(f))
        }
        try? fm.removeItem(at: compose)
        save(d, in: out)
        return out
    }

    static func waiting() -> [URL] {
        guard let r = root?.appendingPathComponent("Share/Outbox", isDirectory: true) else { return [] }
        let dirs = (try? FileManager.default.contentsOfDirectory(at: r, includingPropertiesForKeys: [.creationDateKey])) ?? []
        return dirs.compactMap { u in load(u).map { (u, $0.at) } }.sorted { $0.1 < $1.1 }.map(\.0)
    }

    static var count: Int { waiting().count }

    /// Sends what waits, oldest first; stops at the first that can't reach the home. A share older
    /// than a week (or refused) is let go: it was for a moment that has passed.
    @discardableResult
    static func drain() async -> Int {
        var sent = 0
        for dir in waiting() {
            guard let d = load(dir) else { try? FileManager.default.removeItem(at: dir); continue }
            if Date().timeIntervalSince(d.at) > 7 * 24 * 3600 { try? FileManager.default.removeItem(at: dir); continue }
            switch await ShareSender.send(dir: dir) {
            case .sent: sent += 1
            case .refused: continue
            case .queued, .homeOld, .notPaired: return sent
            }
        }
        return sent
    }

    /// Compose folders left by a sheet the system closed before Send or Cancel.
    static func sweep() {
        guard let r = root?.appendingPathComponent("Share/Compose", isDirectory: true) else { return }
        for u in (try? FileManager.default.contentsOfDirectory(at: r, includingPropertiesForKeys: [.creationDateKey])) ?? [] {
            let made = (try? u.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast
            if Date().timeIntervalSince(made) > 3600 { try? FileManager.default.removeItem(at: u) }
        }
    }

    static func dropAll() {
        guard let r = root?.appendingPathComponent("Share", isDirectory: true) else { return }
        try? FileManager.default.removeItem(at: r)
    }
}

/// D206 on the phone: a picture is made ready before a byte leaves; a file goes as it is.
enum SharePrepare {
    /// A picture: upright by its EXIF, at most 2048 px, re-encoded with no metadata at all
    /// (location included). A screenshot stays a crisp PNG; a GIF stays as it is (it has no place).
    static func picture(_ data: Data, name: String, into dir: URL) -> ShareItem? {
        guard let src = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(src) > 0 else { return nil }
        let uti = (CGImageSourceGetType(src) as String?) ?? UTType.jpeg.identifier
        let id = UUID().uuidString.lowercased()
        let base = (name as NSString).deletingPathExtension.isEmpty ? "IMG" : (name as NSString).deletingPathExtension
        if uti == UTType.gif.identifier, data.count <= ShareLimits.picture {
            let (w, h) = size(src)
            let f = "\(id).gif"
            guard (try? data.write(to: dir.appendingPathComponent(f))) != nil else { return nil }
            return ShareItem(id: id, kind: .picture, name: "\(base).gif", type: "image/gif", bytes: data.count, w: w, h: h, file: f, preview: preview(src))
        }
        guard let cg = scaled(src, edge: ShareLimits.longEdge) else { return nil }
        let png = uti == UTType.png.identifier
        var out = encode(cg, png ? UTType.png : UTType.jpeg, quality: 0.85)
        var ext = png ? "png" : "jpg"
        if png, let o = out, o.count > 6 * 1024 * 1024 { out = encode(cg, .jpeg, quality: 0.9); ext = "jpg" }
        guard let bytes = out else { return nil }
        let f = "\(id).\(ext)"
        guard (try? bytes.write(to: dir.appendingPathComponent(f))) != nil else { return nil }
        var thumb: String?
        if max(cg.width, cg.height) > Int(Double(ShareLimits.thumbEdge) * 1.2), let t = scaled(src, edge: ShareLimits.thumbEdge), let td = encode(t, .jpeg, quality: 0.8) {
            thumb = "\(id).thumb.jpg"
            try? td.write(to: dir.appendingPathComponent(thumb!))
        }
        return ShareItem(id: id, kind: .picture, name: "\(base).\(ext)", type: ext == "png" ? "image/png" : "image/jpeg", bytes: bytes.count, w: cg.width, h: cg.height, file: f, thumb: thumb, preview: preview(src))
    }

    /// A file as it is (D259), up to 50 MB; nil past the cap or when it can't be read.
    static func file(at url: URL, name: String?, into dir: URL) -> (ShareItem?, tooBig: Bool) {
        let n = (name?.isEmpty == false ? name! : url.lastPathComponent)
        let size = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        if size > ShareLimits.file { return (nil, true) }
        let id = UUID().uuidString.lowercased()
        let ext = (n as NSString).pathExtension
        let f = ext.isEmpty ? id : "\(id).\(ext)"
        do { try FileManager.default.copyItem(at: url, to: dir.appendingPathComponent(f)) } catch {
            guard let d = try? Data(contentsOf: url), d.count <= ShareLimits.file, (try? d.write(to: dir.appendingPathComponent(f))) != nil else { return (nil, false) }
        }
        let bytes = (try? FileManager.default.attributesOfItem(atPath: dir.appendingPathComponent(f).path)[.size] as? Int) ?? size
        if bytes > ShareLimits.file { try? FileManager.default.removeItem(at: dir.appendingPathComponent(f)); return (nil, true) }
        let type = UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
        return (ShareItem(id: id, kind: .file, name: n, type: type, bytes: bytes, file: f), false)
    }

    static func size(_ src: CGImageSource) -> (Int?, Int?) {
        let p = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
        return (p?[kCGImagePropertyPixelWidth] as? Int, p?[kCGImagePropertyPixelHeight] as? Int)
    }

    /// Upright (the EXIF turn applied) and at most `edge` on its long side; never scaled up.
    static func scaled(_ src: CGImageSource, edge: Int) -> CGImage? {
        let (w, h) = size(src)
        let long = max(w ?? edge, h ?? edge)
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: min(edge, long),
        ]
        return CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary)
    }

    /// Encodes with no properties but the quality: no EXIF, no GPS, no maker notes. A JPEG has no
    /// transparency, so what is see-through lands on white, never on black.
    static func encode(_ cg: CGImage, _ type: UTType, quality: Double) -> Data? {
        let img = type == .jpeg ? flat(cg) ?? cg : cg
        let out = NSMutableData()
        guard let dst = CGImageDestinationCreateWithData(out, type.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(dst, img, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        return CGImageDestinationFinalize(dst) ? out as Data : nil
    }

    private static func flat(_ cg: CGImage) -> CGImage? {
        switch cg.alphaInfo {
        case .none, .noneSkipFirst, .noneSkipLast: return nil
        default: break
        }
        guard let ctx = CGContext(data: nil, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
        ctx.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
        ctx.fill(CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
        return ctx.makeImage()
    }

    /// The ~16 px placeholder, on white, as the web makes it.
    static func preview(_ src: CGImageSource) -> String? {
        guard let t = scaled(src, edge: 16), let d = encode(t, .jpeg, quality: 0.6) else { return nil }
        let s = "data:image/jpeg;base64," + d.base64EncodedString()
        return s.count <= ShareLimits.preview ? s : nil
    }
}

/// The two calls, with the device the app paired as.
enum ShareSender {
    /// The home's address to use now: the best of its ways that proves it is the home (D293), else
    /// the one the app last used.
    static func home() async -> URL? {
        guard let base = Paired.base else { return nil }
        let ways = Paired.ways
        if ways.count > 1, let fp = Paired.fp {
            let cur = base.absoluteString.hasSuffix("/") ? String(base.absoluteString.dropLast()) : base.absoluteString
            if let best = await Reach.race(ways + [Way(kind: "domain", url: cur)], pinned: fp), let u = URL(string: best.hasSuffix("/") ? best : best + "/") { return u }
        }
        return base
    }

    /// The partners for the picker (GET /api/me), saved for next time; the saved ones when the
    /// home doesn't answer within a few seconds.
    static func partners() async -> [SharePartner] {
        guard let base = Paired.base, let token = Keychain.token, let url = URL(string: "api/me", relativeTo: base) else { return Paired.partners }
        var r = URLRequest(url: url, timeoutInterval: 4)
        r.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        guard let (data, res) = try? await URLSession.shared.data(for: r), (res as? HTTPURLResponse)?.statusCode == 200,
              let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return Paired.partners }
        if let n = j["personaName"] as? String, !n.isEmpty { Paired.personaName = n }
        let list = ((j["partners"] as? [[String: Any]]) ?? []).compactMap { p -> SharePartner? in
            guard let id = p["id"] as? String, let name = p["name"] as? String else { return nil }
            return SharePartner(id: id, name: name, look: (p["look"] as? String) ?? "sand")
        }
        if !list.isEmpty { Paired.partners = list }
        return list.isEmpty ? Paired.partners : list
    }

    /// Sends one outbox entry: each picture or file not yet up, then the message. The entry is
    /// removed once the home has the message (or refused it); otherwise it stays.
    static func send(dir: URL) async -> ShareOutcome {
        guard var d = ShareOutbox.load(dir) else { return .refused }
        guard let token = Keychain.token, let base = await home() else { return .notPaired }
        for i in d.items.indices where d.items[i].mediaId == nil {
            switch await upload(d.items[i], in: dir, base: base, token: token) {
            case .ok(let id):
                d.items[i].mediaId = id
                ShareOutbox.save(d, in: dir)
            case .tooBig:
                d.items[i].mediaId = ""
                d.tooBig += 1
                ShareOutbox.save(d, in: dir)
            case .unpaired: return .notPaired
            case .offline: return .queued
            }
        }
        var body: [String: Any] = ["clientId": d.clientId, "note": d.note]
        if let p = d.partner { body["partner"] = p }
        if let u = d.url { body["url"] = u }
        if let t = d.title { body["title"] = t }
        if let t = d.text { body["text"] = t }
        let ids = d.items.compactMap { $0.mediaId }.filter { !$0.isEmpty }
        if !ids.isEmpty { body["media"] = ids }
        guard let url = URL(string: "api/share", relativeTo: base) else { return .notPaired }
        var r = URLRequest(url: url, timeoutInterval: 20)
        r.httpMethod = "POST"
        r.setValue("application/json", forHTTPHeaderField: "content-type")
        r.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        r.httpBody = try? JSONSerialization.data(withJSONObject: body)
        guard let (data, res) = try? await URLSession.shared.data(for: r), let http = res as? HTTPURLResponse else { return .queued }
        switch http.statusCode {
        case 200:
            try? FileManager.default.removeItem(at: dir)
            let p = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["partner"] as? String
            if let p { Paired.lastPartner = p }
            return .sent(partner: p ?? "default")
        case 404: return .homeOld
        case 401, 403: return .notPaired
        case 400:
            try? FileManager.default.removeItem(at: dir)
            return .refused
        default: return .queued
        }
    }

    enum Upload { case ok(String), tooBig, unpaired, offline }

    /// POST /api/media, streamed from a file (a 50 MB file never sits in the extension's memory twice).
    static func upload(_ it: ShareItem, in dir: URL, base: URL, token: String) async -> Upload {
        guard let url = URL(string: "api/media", relativeTo: base) else { return .offline }
        let boundary = "ducter-\(UUID().uuidString)"
        let body = dir.appendingPathComponent("\(it.id).upload")
        defer { try? FileManager.default.removeItem(at: body) }
        guard FileManager.default.createFile(atPath: body.path, contents: nil), let h = try? FileHandle(forWritingTo: body) else { return .offline }
        func part(_ name: String, file: String? = nil, type: String? = nil) {
            var head = "--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\""
            if let file { head += "; filename=\"\(file.replacingOccurrences(of: "\"", with: "'"))\"" }
            head += "\r\n"
            if let type { head += "Content-Type: \(type)\r\n" }
            h.write(Data((head + "\r\n").utf8))
        }
        part("file", file: it.name, type: it.type)
        if let src = try? FileHandle(forReadingFrom: dir.appendingPathComponent(it.file)) {
            while let chunk = try? src.read(upToCount: 1 << 20), !chunk.isEmpty { h.write(chunk) }
            try? src.close()
        } else { try? h.close(); return .offline }
        h.write(Data("\r\n".utf8))
        if let t = it.thumb, let td = try? Data(contentsOf: dir.appendingPathComponent(t)) {
            part("thumb", file: "thumb", type: "image/jpeg")
            h.write(td)
            h.write(Data("\r\n".utf8))
        }
        if let p = it.preview {
            part("preview")
            h.write(Data("\(p)\r\n".utf8))
        }
        part("name")
        h.write(Data("\(it.name)\r\n".utf8))
        h.write(Data("--\(boundary)--\r\n".utf8))
        try? h.close()
        var r = URLRequest(url: url, timeoutInterval: it.kind == .file ? 600 : 120)
        r.httpMethod = "POST"
        r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "content-type")
        r.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
        guard let (data, res) = try? await URLSession.shared.upload(for: r, fromFile: body), let http = res as? HTTPURLResponse else { return .offline }
        switch http.statusCode {
        case 200:
            let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            guard let id = (j?["media"] as? [String: Any])?["id"] as? String else { return .offline }
            return .ok(id)
        case 413: return .tooBig
        case 401, 403: return .unpaired
        default: return .offline
        }
    }
}
