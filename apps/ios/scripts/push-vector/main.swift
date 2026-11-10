import Foundation

// Opens the shared test vector (packages/core/test/fixtures/push-vector.json, sealed by the
// home's push-relay.ts) with the app's own PushCrypto: the TS and Swift sides agree on the
// format. Run by check-push-vector.sh on a Mac; no device, no network.
struct Vector: Decodable {
    var key: String
    var plaintext: String
    var sealed: String
    var padded: String
}

let path = CommandLine.arguments.dropFirst().first ?? "packages/core/test/fixtures/push-vector.json"
guard let data = FileManager.default.contents(atPath: path),
      let v = try? JSONDecoder().decode(Vector.self, from: data),
      let key = Data(base64Encoded: v.key) else {
    print("push vector: can't read \(path)")
    exit(2)
}
guard let plain = PushCrypto.open(v.sealed, key: key), String(data: plain, encoding: .utf8) == v.plaintext else {
    print("push vector: FAIL (Swift could not open what the home sealed)")
    exit(1)
}
guard let m = PushCrypto.message(v.sealed, key: key), m.decisionId == "d1", m.url == "app#d=d1" else {
    print("push vector: FAIL (message fields)")
    exit(1)
}
// What the home really sends: the message padded with spaces to a multiple of 256 bytes.
guard let p = PushCrypto.message(v.padded, key: key), p.title == m.title, p.body == m.body else {
    print("push vector: FAIL (the padded message)")
    exit(1)
}
var tampered = Array(v.sealed)
tampered[20] = tampered[20] == "A" ? "B" : "A"
guard PushCrypto.open(String(tampered), key: key) == nil else {
    print("push vector: FAIL (a tampered seal opened)")
    exit(1)
}
print("push vector: OK (\(m.title))")
