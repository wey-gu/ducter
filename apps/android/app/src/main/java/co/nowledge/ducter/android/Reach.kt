package co.nowledge.ducter.android

import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.util.Base64

// D293: the home's ways to be reached and its key. The page hands them over (its ways frame); the
// app opens the home at the best way that proves it is the home (it signs a fresh nonce with the
// key pinned at pairing) and moves without pairing again. The same rules as
// packages/protocol/src/reach.ts: nearest first (same network, tailnet, domain, tunnel); while
// open, leave a way only after two misses in a row; move up only after a better way answered twice
// in a row, and only when the app comes to the front (a move reloads the page). Plain logic here,
// tested on the JVM (app/src/test); the network is MainActivity's.

data class Way(val kind: String, val url: String, val primary: Boolean = false)

object Reach {
    private val RANK = mapOf("lan" to 0, "tailnet" to 1, "domain" to 2, "tunnel" to 3)

    fun ranked(ways: List<Way>): List<Way> =
        ways.withIndex().sortedWith(compareBy<IndexedValue<Way>>({ RANK[it.value.kind] ?: 9 }, { if (it.value.primary) 0 else 1 }, { it.index })).map { it.value }

    private val b64u = Base64.getUrlEncoder().withoutPadding()
    private val unb64u = Base64.getUrlDecoder()

    fun fingerprint(raw: ByteArray): String = b64u.encodeToString(MessageDigest.getInstance("SHA-256").digest(raw).copyOf(16))

    fun nonce(): String = b64u.encodeToString(ByteArray(18).also { java.security.SecureRandom().nextBytes(it) })

    /** The X.509 prefix of an Ed25519 public key (RFC 8410), before its 32 raw bytes. */
    private val ED25519_SPKI = byteArrayOf(0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00)

    /**
     * The answer counts only when its key is the pinned one and it signed this nonce. Ed25519 is in
     * Android from API 33; below it nothing verifies, so the app stays on the way it has.
     */
    fun check(key: String, sig: String, nonce: String, pinned: String): Boolean = try {
        val raw = unb64u.decode(key)
        if (raw.size != 32 || fingerprint(raw) != pinned) false
        else {
            val pub = KeyFactory.getInstance("Ed25519").generatePublic(X509EncodedKeySpec(ED25519_SPKI + raw))
            Signature.getInstance("Ed25519").run {
                initVerify(pub)
                update("ducter-home\n$nonce".toByteArray())
                verify(unb64u.decode(sig))
            }
        }
    } catch (_: Exception) {
        false
    }

    /** The best way that proves it is the home, asked best first (one at a time is plenty for a phone app). */
    fun firstThatProves(ways: List<Way>, proves: (String) -> Boolean): String? = ranked(ways).firstOrNull { proves(it.url) }?.url
}

/** The 30-second look while the app is open. */
class Keeper(private val proves: (String) -> Boolean) {
    private val streak = mutableMapOf<String, Int>()

    private fun same(a: String, b: String) = a.trimEnd('/').equals(b.trimEnd('/'), ignoreCase = true)

    /** The base to move to, or null to stay. up: the app just came to the front, so moving up is fine. */
    fun tick(ways: List<Way>, current: String, up: Boolean): String? {
        val list = Reach.ranked(ways)
        val at = list.indexOfFirst { same(it.url, current) }
        val look = if (at >= 0) list.subList(0, at + 1) else list + Way("domain", current)
        val answers = look.map { proves(it.url) }
        look.forEachIndexed { i, w ->
            val s = streak[w.url] ?: 0
            streak[w.url] = if (answers[i]) maxOf(s, 0) + 1 else minOf(s, 0) - 1
        }
        if (up && at > 0) list.subList(0, at).firstOrNull { (streak[it.url] ?: 0) >= 2 }?.let { return it.url }
        val mine = if (at >= 0) list[at].url else current
        if ((streak[mine] ?: 0) <= -2) {
            look.indices.firstOrNull { answers[it] && !same(look[it].url, current) }?.let { return look[it].url }
            if (at >= 0) list.drop(at + 1).firstOrNull { proves(it.url) }?.let { return it.url }
        }
        return null
    }
}
