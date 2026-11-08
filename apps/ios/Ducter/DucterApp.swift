import SwiftUI
import VisionKit

@main
struct DucterApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var state = AppState.shared
    @StateObject private var shell = Shell()

    var body: some Scene {
        WindowGroup {
            Root(state: state, shell: shell)
                .tint(Pebble.accent)
        }
    }
}

/// Connect once; after that the app opens straight into the conversation.
struct Root: View {
    @ObservedObject var state: AppState
    @ObservedObject var shell: Shell

    var body: some View {
        ZStack {
            Pebble.bg.ignoresSafeArea()
            if let entry = state.entry {
                WebShellView(shell: shell)
                    .ignoresSafeArea()
                    .onAppear { shell.load(entry) }
                    .onChange(of: entry) { _, u in shell.load(u) }
                    .opacity(shell.phase == .ready ? 1 : 0)
                if shell.phase == .loading {
                    Loading().transition(.opacity)
                } else if shell.phase == .unreachable, let base = state.base {
                    Unreachable(host: base.host(percentEncoded: false) ?? base.absoluteString, retry: shell.retry, other: state.forget)
                        .transition(.opacity)
                }
            } else {
                ConnectView { state.connect($0) }
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.25), value: state.entry)
        .onChange(of: state.open) { _, path in
            guard let path else { return }
            shell.open(path)
            state.open = nil
        }
    }
}

/// Between launch and the page's first paint: the partner, standing by (no white flash).
struct Loading: View {
    @State private var breathe = false
    var body: some View {
        VStack(spacing: 18) {
            Image("Idle").resizable().scaledToFit().frame(width: 120)
                .scaleEffect(breathe ? 1.03 : 1, anchor: .bottom)
                .animation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true), value: breathe)
            Text(L("conn.connecting")).font(.subheadline).foregroundStyle(Pebble.inkMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Pebble.bg)
        .onAppear { breathe = true }
    }
}

/// The page couldn't load at all (the main is asleep, or the tunnel is closed).
struct Unreachable: View {
    let host: String
    let retry: () -> Void
    let other: () -> Void
    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image("Napping").resizable().scaledToFit().frame(width: 150)
            Text(L("connect.err.unreachable", host))
                .font(.body).foregroundStyle(Pebble.inkSoft).multilineTextAlignment(.center)
                .padding(.horizontal, 8)
            Spacer()
            Button(L("task.action.retry"), action: retry).buttonStyle(PrimaryButtonStyle())
            Button(L("connect.other"), action: other).buttonStyle(QuietButtonStyle())
        }
        .padding(24)
        .background(Pebble.bg)
    }
}

/// First run: scan the QR code from `ducter pair`, or paste its link, or type address and code.
struct ConnectView: View {
    let connect: (PairTarget) -> Void
    @State private var address = ""
    @State private var code = ""
    @State private var error: String?
    @State private var scanning = false
    @FocusState private var focus: Field?
    enum Field { case address, code }

    private var canScan: Bool { DataScannerViewController.isSupported }

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                Image("Idle").resizable().scaledToFit().frame(width: 132).padding(.top, 36)
                Text(L("connect.title")).font(Pebble.display(30)).foregroundStyle(Pebble.ink).multilineTextAlignment(.center)
                Text(L("connect.app.body")).font(.body).foregroundStyle(Pebble.inkSoft).multilineTextAlignment(.center)
                    .padding(.bottom, 8)
                if canScan {
                    Button { scanning = true } label: { Label(L("connect.app.scan"), systemImage: "qrcode.viewfinder") }
                        .buttonStyle(PrimaryButtonStyle())
                    Text(L("connect.app.or")).font(.footnote).foregroundStyle(Pebble.inkMuted).padding(.vertical, 4)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text(L("connect.address")).font(.footnote.weight(.medium)).foregroundStyle(Pebble.inkMuted)
                    HStack(spacing: 8) {
                        TextField(L("connect.address.placeholder"), text: $address)
                            .textContentType(.URL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .submitLabel(.next).focused($focus, equals: .address)
                            .onSubmit { focus = .code }
                        PasteButton(payloadType: String.self) { s in
                            guard let s = s.first else { return }
                            Task { @MainActor in take(s) }
                        }
                        .labelStyle(.iconOnly).buttonBorderShape(.capsule).tint(Pebble.inkMuted)
                    }
                    .field()
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text(L("connect.code")).font(.footnote.weight(.medium)).foregroundStyle(Pebble.inkMuted)
                    TextField(L("connect.code.placeholder"), text: $code)
                        .textContentType(.oneTimeCode).textInputAutocapitalization(.characters).autocorrectionDisabled()
                        .font(.body.monospaced()).submitLabel(.go).focused($focus, equals: .code)
                        .onSubmit(submit)
                        .field()
                }
                if let error {
                    Text(error).font(.footnote).foregroundStyle(Pebble.failedInk).frame(maxWidth: .infinity, alignment: .leading)
                }
                Button(L("connect.go"), action: submit)
                    .buttonStyle(canScan ? AnyButtonStyle(QuietButtonStyle()) : AnyButtonStyle(PrimaryButtonStyle()))
                    .disabled(address.trimmingCharacters(in: .whitespaces).isEmpty)
                    .padding(.top, 4)
                Text(L("connect.phone.safe")).font(.footnote).foregroundStyle(Pebble.inkMuted).multilineTextAlignment(.center)
                    .padding(.top, 8)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Pebble.bg)
        .sheet(isPresented: $scanning) {
            Scanner { s in
                scanning = false
                take(s)
            }
            .ignoresSafeArea()
        }
    }

    /// A whole link connects at once; a bare address waits for the code.
    private func take(_ s: String) {
        guard let t = PairTarget.parse(s) else {
            error = L("connect.err.address")
            return
        }
        if t.code != nil {
            Haptics.play("success")
            connect(t)
        } else {
            address = s.trimmingCharacters(in: .whitespacesAndNewlines)
            focus = .code
        }
    }

    private func submit() {
        guard let t = PairTarget.parse(address, code: code) else {
            error = L("connect.err.address")
            return
        }
        error = nil
        connect(t)
    }
}

private struct FieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 14).frame(minHeight: 50)
            .background(Pebble.surface, in: RoundedRectangle(cornerRadius: Pebble.radiusSmall, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Pebble.radiusSmall, style: .continuous).stroke(Pebble.line, lineWidth: 1))
            .foregroundStyle(Pebble.ink)
    }
}

extension View {
    func field() -> some View { modifier(FieldStyle()) }
}

struct AnyButtonStyle: ButtonStyle {
    private let make: (Configuration) -> AnyView
    init<S: ButtonStyle>(_ s: S) { make = { AnyView(s.makeBody(configuration: $0)) } }
    func makeBody(configuration: Configuration) -> some View { make(configuration) }
}

/// The camera, looking for the QR code `ducter pair` prints.
struct Scanner: UIViewControllerRepresentable {
    let found: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced, isHighlightingEnabled: true)
        vc.delegate = context.coordinator
        try? vc.startScanning()
        return vc
    }

    func updateUIViewController(_ vc: DataScannerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(found: found) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let found: (String) -> Void
        private var done = false
        init(found: @escaping (String) -> Void) { self.found = found }
        func dataScanner(_ s: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
            for case let .barcode(b) in items {
                guard !done, let v = b.payloadStringValue, PairTarget.parse(v)?.code != nil else { continue }
                done = true
                s.stopScanning()
                found(v)
            }
        }
    }
}
