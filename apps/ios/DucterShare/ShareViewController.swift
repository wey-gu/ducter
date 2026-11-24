import SwiftUI
import UIKit

/// D537: 分享到 Ducter / Share to Ducter, the extension the phone's share sheet lists as Ducter.
/// It reads what the other app handed over, shows ShareSheet, and sends with the device the app
/// paired as (the shared keychain group and app group, never a pairing of its own).
final class ShareViewController: UIViewController {
    private var model: ShareModel?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Pebble.uiBg
        ShareOutbox.sweep()
        let clientId = "share-" + UUID().uuidString.lowercased()
        let compose = ShareOutbox.folder("Compose", clientId)
        let m = ShareModel(draft: ShareDraft(clientId: clientId), compose: compose)
        m.done = { [weak self] cancelled in self?.finish(cancelled) }
        model = m
        let host = UIHostingController(rootView: ShareSheet(m: m).tint(Pebble.accent))
        host.view.backgroundColor = .clear
        addChild(host)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)

        let parts = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).map {
            ShareInput.Part(providers: $0.attachments ?? [], title: $0.attributedTitle?.string, text: $0.attributedContentText?.string)
        }
        Task { @MainActor in
            var d = ShareDraft(clientId: clientId)
            if let compose { d = await ShareInput.read(parts, clientId: clientId, into: compose) }
            m.ready(d)
            await m.refreshPartners()
            // Shares that waited for the home go now, behind this one.
            Task.detached { await ShareOutbox.drain() }
        }
    }

    private func finish(_ cancelled: Bool) {
        if cancelled {
            extensionContext?.cancelRequest(withError: NSError(domain: "co.nowledge.ducter.share", code: NSUserCancelledError))
        } else {
            extensionContext?.completeRequest(returningItems: nil)
        }
    }
}
