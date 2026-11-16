import AVFoundation
import Speech
import UIKit

/// D305: hold to talk and read aloud for the page (design/voice.md, "The app bridge"). The page
/// asks (voice.can, voice.start, voice.stop, voice.cancel, voice.settings, speak, speak.stop);
/// this answers and pushes events back as window.ducterVoice({id, kind, ...}). It listens only
/// between a start and a stop the page sends while the person holds the mic; nothing is kept.
/// Apple's recognizer stays on the phone whenever it can for the language.
@MainActor
final class Voice: NSObject, AVSpeechSynthesizerDelegate {
    /// Pushes one event to the page.
    var emit: ([String: Any]) -> Void = { _ in }

    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var recognizer: SFSpeechRecognizer?
    private var id: String?
    private var heard = ""
    private var finished = false
    private var lastLevel: TimeInterval = 0
    private let synth = AVSpeechSynthesizer()
    private var speakId: String?

    override init() {
        super.init()
        synth.delegate = self
    }

    // MARK: what the page asks

    func handle(_ t: String, _ m: [String: Any]) async -> [String: Any]? {
        switch t {
        case "voice.can": return can(m["lang"] as? String ?? "en-US")
        case "voice.start": return await start(id: m["id"] as? String ?? "", lang: m["lang"] as? String ?? "en-US")
        case "voice.stop":
            stop(id: m["id"] as? String, cancel: false)
            return [:]
        case "voice.cancel":
            stop(id: m["id"] as? String, cancel: true)
            return [:]
        case "voice.settings":
            if let u = URL(string: UIApplication.openSettingsURLString) { await UIApplication.shared.open(u) }
            return [:]
        case "speak": return speak(id: m["id"] as? String ?? "", text: m["text"] as? String ?? "", lang: m["lang"] as? String ?? "en-US")
        case "speak.stop":
            synth.stopSpeaking(at: .immediate)
            return [:]
        default: return nil
        }
    }

    private static func micState() -> String {
        switch AVAudioApplication.shared.recordPermission {
        case .granted: return "granted"
        case .denied: return "denied"
        default: return "ask"
        }
    }

    private static func speechState() -> String {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: return "granted"
        case .denied, .restricted: return "denied"
        default: return "ask"
        }
    }

    private func can(_ lang: String) -> [String: Any] {
        var out: [String: Any] = ["mic": Self.micState(), "speech": Self.speechState()]
        guard let r = SFSpeechRecognizer(locale: Locale(identifier: lang)) else {
            out["ok"] = false
            out["why"] = "lang"
            out["where"] = "apple"
            return out
        }
        out["where"] = r.supportsOnDeviceRecognition ? "device" : "apple"
        if !AVAudioSession.sharedInstance().isInputAvailable {
            out["ok"] = false
            out["why"] = "nomic"
        } else {
            out["ok"] = true
        }
        return out
    }

    private func start(id: String, lang: String) async -> [String: Any] {
        if self.id != nil { stop(id: self.id, cancel: true) }
        guard let r = SFSpeechRecognizer(locale: Locale(identifier: lang)) else { return ["ok": false, "why": "lang"] }
        // What is still to ask, asked now: the page has said why in one line already.
        if Self.micState() == "ask" {
            let ok = await AVAudioApplication.requestRecordPermission()
            if !ok { return ["ok": false, "why": "mic"] }
        }
        if Self.micState() == "denied" { return ["ok": false, "why": "mic"] }
        if Self.speechState() == "ask" {
            let s = await withCheckedContinuation { (c: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
                Voice.askSpeech { c.resume(returning: $0) }
            }
            if s != .authorized { return ["ok": false, "why": "speech"] }
        }
        if Self.speechState() == "denied" { return ["ok": false, "why": "speech"] }
        guard r.isAvailable else { return ["ok": false, "why": "network"] }

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker, .allowBluetoothHFP])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            return ["ok": false, "why": "busy"]
        }

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        let onDevice = r.supportsOnDeviceRecognition
        if onDevice { req.requiresOnDeviceRecognition = true }
        req.addsPunctuation = true

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.channelCount > 0 else {
            deactivate()
            return ["ok": false, "why": "nomic"]
        }
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format, block: Voice.tap(req) { [weak self] level in
            Task { @MainActor in self?.level(level, id: id) }
        })
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            deactivate()
            return ["ok": false, "why": "busy"]
        }
        self.id = id
        heard = ""
        finished = false
        request = req
        recognizer = r
        task = r.recognitionTask(with: req, resultHandler: Voice.results { [weak self] text, final, failed in
            Task { @MainActor in self?.recognized(id: id, text: text, final: final, failed: failed) }
        })
        return ["ok": true, "where": onDevice ? "device" : "apple"]
    }

    // The system calls these blocks on its own queues: they are made outside the main actor so
    // Swift never asserts they run on it.
    nonisolated static func askSpeech(_ done: @escaping @Sendable (SFSpeechRecognizerAuthorizationStatus) -> Void) {
        SFSpeechRecognizer.requestAuthorization(done)
    }

    nonisolated static func tap(_ req: SFSpeechAudioBufferRecognitionRequest, level: @escaping @Sendable (Double) -> Void) -> AVAudioNodeTapBlock {
        { buf, _ in
            req.append(buf)
            level(Voice.level(buf))
        }
    }

    nonisolated static func results(_ got: @escaping @Sendable (String?, Bool, Bool) -> Void) -> (SFSpeechRecognitionResult?, Error?) -> Void {
        { result, error in got(result?.bestTranscription.formattedString, result?.isFinal ?? false, error != nil) }
    }

    /// The microphone's level, 0–1: (dB + 50) / 40, clamped.
    nonisolated static func level(_ buf: AVAudioPCMBuffer) -> Double {
        guard let ch = buf.floatChannelData?[0], buf.frameLength > 0 else { return 0 }
        var sum: Float = 0
        for i in 0..<Int(buf.frameLength) { sum += ch[i] * ch[i] }
        let rms = sqrt(sum / Float(buf.frameLength))
        let db = 20 * log10(max(rms, 1e-7))
        return min(1, max(0, (Double(db) + 50) / 40))
    }

    private func level(_ l: Double, id: String) {
        guard self.id == id else { return }
        let now = Date.timeIntervalSinceReferenceDate
        guard now - lastLevel >= 0.05 else { return } // at most 20 a second
        lastLevel = now
        emit(["id": id, "kind": "level", "level": (l * 100).rounded() / 100])
    }

    private func recognized(id: String, text: String?, final: Bool, failed: Bool) {
        guard self.id == id else { return }
        if let text { heard = text }
        if final || failed {
            // A stop asked for the final words; an error with words heard still hands them over.
            if failed && heard.isEmpty && !finished {
                emit(["id": id, "kind": "error", "why": "error"])
            } else {
                emit(["id": id, "kind": "final", "text": heard])
            }
            end(id)
        } else if let text {
            emit(["id": id, "kind": "partial", "text": text])
        }
    }

    private func stop(id: String?, cancel: Bool) {
        guard let cur = self.id, id == nil || id == cur else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        if cancel {
            task?.cancel()
            end(cur)
        } else {
            finished = true
            request?.endAudio()
            // The recognizer gives its final result shortly; if it never does, hand over what was heard.
            let heardNow = cur
            Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                guard let self, self.id == heardNow else { return }
                self.emit(["id": heardNow, "kind": "final", "text": self.heard])
                self.task?.cancel()
                self.end(heardNow)
            }
        }
    }

    private func end(_ id: String) {
        guard self.id == id else { return }
        if engine.isRunning {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        self.id = nil
        task = nil
        request = nil
        recognizer = nil
        deactivate()
        emit(["id": id, "kind": "end"])
    }

    private func deactivate() {
        guard !synth.isSpeaking else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    // MARK: read aloud

    private func speak(id: String, text: String, lang: String) -> [String: Any] {
        guard let voice = AVSpeechSynthesisVoice(language: lang) ?? AVSpeechSynthesisVoice(language: String(lang.prefix(while: { $0 != "-" }))) else {
            return ["ok": false, "why": "voice"]
        }
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
        if self.id == nil {
            try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            try? AVAudioSession.sharedInstance().setActive(true)
        }
        let u = AVSpeechUtterance(string: text)
        u.voice = voice
        speakId = id
        synth.speak(u)
        return ["ok": true]
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) {
        Task { @MainActor in self.spoken() }
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) {
        Task { @MainActor in self.spoken() }
    }

    private func spoken() {
        guard let sid = speakId, !synth.isSpeaking else { return }
        speakId = nil
        emit(["id": sid, "kind": "spoken"])
        if id == nil { deactivate() }
    }
}
