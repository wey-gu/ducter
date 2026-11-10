package co.nowledge.ducter.android

import java.net.URI
import java.security.MessageDigest
import kotlin.math.roundToInt

// The app's plain logic, without Android: pairing links, versions, what's new, the fold. Each
// mirrors a counterpart elsewhere in Ducter and is tested against the same cases
// (app/src/test).

/** Where to connect: a base URL ("https://h/", ending in /) and, from a `ducter pair` link, its code. */
data class PairTarget(val base: String, val code: String?) {
    companion object {
        private val CODE = Regex("""(?:^|&)c=([A-Za-z0-9-]+)""")

        /**
         * Accepts the whole link ("https://h/pair#c=K7QM-4XPA"), an address ("h", "h:7880",
         * "http://10.0.0.5:7880") and a code typed separately. Same rules as the iPhone app's
         * PairTarget.parse (apps/ios/Ducter/Store.swift).
         */
        fun parse(input: String, typed: String = ""): PairTarget? {
            var s = input.trim()
            if (s.isEmpty() || s.contains(' ')) return null
            if (!s.contains("://")) {
                val host = s.substringBefore('/')
                val local = host.startsWith("127.") || host.startsWith("localhost") || host.startsWith("10.") ||
                    host.startsWith("192.168.") || host.endsWith(".local") || host.contains(':')
                s = (if (local) "http://" else "https://") + s
            }
            val u = try { URI(s) } catch (_: Exception) { return null }
            val scheme = u.scheme?.lowercase() ?: return null
            if (scheme != "http" && scheme != "https") return null
            val host = u.host?.takeIf { it.isNotEmpty() } ?: return null
            var code = u.rawFragment?.let { CODE.find(it)?.groupValues?.get(1)?.uppercase() }
            val t = typed.trim().uppercase()
            if (t.isNotEmpty()) code = t
            // The directory of the page: /pair, /app and / all mean the base.
            var path = u.rawPath ?: ""
            for (tail in listOf("/pair", "/app", "/app/")) if (path.endsWith(tail)) path = path.dropLast(tail.length)
            if (!path.endsWith("/")) path += "/"
            val port = if (u.port == -1) "" else ":${u.port}"
            val h = if (host.contains(':') && !host.startsWith("[")) "[$host]" else host
            return PairTarget("$scheme://${h.lowercase()}$port$path", code?.takeIf { it.isNotEmpty() })
        }

        /** "http://h:7797/x/" → "http://h:7797": what the page's origin is, for the bridge's rule. */
        fun origin(base: String): String? = try {
            val u = URI(base)
            val port = if (u.port == -1) "" else ":${u.port}"
            "${u.scheme}://${u.host}$port"
        } catch (_: Exception) { null }
    }
}

/** Semver order, as packages/protocol/src/version.ts compareVersions. */
object Versions {
    private val RE = Regex("""^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$""")

    private class V(val core: List<Long>, val pre: List<String>)

    private fun parse(v: String): V? {
        val m = RE.find(v.trim()) ?: return null
        val (a, b, c) = m.destructured
        val pre = m.groupValues[4]
        return V(listOf(a.toLong(), b.toLong(), c.toLong()), if (pre.isEmpty()) emptyList() else pre.split('.'))
    }

    fun isVersion(v: String?) = v != null && parse(v) != null

    /** A version without its leading v, and without the debug build's "-dev". */
    fun bare(v: String) = v.trim().removePrefix("v").removeSuffix("-dev")

    fun compare(a: String, b: String): Int {
        val x = parse(a)
        val y = parse(b)
        if (x == null || y == null) return if (x != null) 1 else if (y != null) -1 else 0
        for (i in 0..2) if (x.core[i] != y.core[i]) return if (x.core[i] < y.core[i]) -1 else 1
        if (x.pre.isEmpty() || y.pre.isEmpty()) return if (x.pre.size == y.pre.size) 0 else if (x.pre.isNotEmpty()) -1 else 1
        for (i in 0 until maxOf(x.pre.size, y.pre.size)) {
            val p = x.pre.getOrNull(i) ?: return -1
            val q = y.pre.getOrNull(i) ?: return 1
            if (p == q) continue
            val pn = p.all { it.isDigit() }
            val qn = q.all { it.isDigit() }
            if (pn && qn) return if (p.toLong() < q.toLong()) -1 else 1
            if (pn != qn) return if (pn) -1 else 1
            return if (p < q) -1 else 1
        }
        return 0
    }

    /** The versionCode a version ships as (app/build.gradle.kts versionCodeOf: keep in step). */
    fun code(v: String): Int {
        val m = Regex("""^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]*?(\d+))?""").find(v) ?: error("not a version: $v")
        val (major, minor, patch) = m.destructured
        val tail = if (v.contains('-')) (m.groupValues[4].toIntOrNull() ?: 0).coerceAtMost(98) else 99
        return ((major.toInt() * 1000 + minor.toInt()) * 1000 + patch.toInt()) * 100 + tail
    }
}

/**
 * What's new, from the release's `<!-- whats-new -->` block: per language at most two whole lines,
 * a line longer than 40 (zh) / 80 (en) characters left out. packages/core/src/release.ts whatsNew.
 */
object WhatsNew {
    private val BLOCK = Regex("""<!--\s*whats-new\b([\s\S]*?)-->""")
    private val LINE = Regex("""^\s*(zh|en)\s*[:：]\s*(.+?)\s*$""")
    private val MAX = mapOf("zh" to 40, "en" to 80)

    fun parse(body: String?, max: Int = 2): Map<String, List<String>> {
        val m = BLOCK.find(body ?: "") ?: return emptyMap()
        val out = linkedMapOf<String, MutableList<String>>()
        for (raw in m.groupValues[1].split(Regex("\r?\n"))) {
            val l = LINE.find(raw) ?: continue
            val lang = l.groupValues[1]
            val line = l.groupValues[2]
            if (line.codePointCount(0, line.length) > MAX.getValue(lang)) continue
            val list = out.getOrPut(lang) { mutableListOf() }
            if (list.size < max) list.add(line)
        }
        return out
    }
}

/** The release's file for Android: `Ducter-<version>-android.apk` (release.yml's android job). */
object Asset {
    fun name(version: String) = "Ducter-$version-android.apk"

    /** "sha256:ab12…" (GitHub's asset digest) or a SHA256SUMS.txt line → the hex sum. */
    fun sumFromDigest(digest: String?): String? =
        digest?.trim()?.lowercase()?.removePrefix("sha256:")?.takeIf { Regex("^[0-9a-f]{64}$").matches(it) }

    fun sumFromList(list: String, file: String): String? = list.lineSequence()
        .map { it.trim().split(Regex("\\s+"), limit = 2) }
        .firstOrNull { it.size == 2 && it[1].removePrefix("*") == file }
        ?.get(0)?.lowercase()?.takeIf { Regex("^[0-9a-f]{64}$").matches(it) }

    /** Downloads come only from GitHub's own hosts, over https. */
    fun trusted(url: String): Boolean = try {
        val u = URI(url)
        val h = u.host?.lowercase() ?: ""
        u.scheme == "https" && (h == "github.com" || h == "api.github.com" || h.endsWith(".githubusercontent.com"))
    } catch (_: Exception) { false }

    fun hex(d: ByteArray) = d.joinToString("") { "%02x".format(it) }

    fun sha256() = MessageDigest.getInstance("SHA-256")
}

/**
 * The fold, in the page's own units (D182). Android says where a foldable's fold or hinge is in
 * window pixels (Jetpack WindowManager's FoldingFeature); the page lays out in CSS pixels from its
 * own top-left. A fold that doesn't cross the web view (a cover screen, a window beside it) is none.
 */
data class Fold(
    /** "vertical": a book, left and right. "horizontal": a laptop or tabletop, top and bottom. */
    val axis: String,
    /** "flat" or "half" (half-opened: a book held open, or tabletop). */
    val state: String,
    /** Where the fold starts and ends along the page's width (vertical) or height (horizontal). */
    val start: Int,
    val end: Int,
    val separating: Boolean,
    val occluding: Boolean,
) {
    fun json() = """{"axis":"$axis","state":"$state","start":$start,"end":$end,"separating":$separating,"occluding":$occluding}"""

    companion object {
        /**
         * bounds: the fold in window pixels (l, t, r, b). web: the web view in window pixels (l, t,
         * w, h). density: pixels per CSS pixel. vertical: the fold runs top to bottom.
         */
        fun of(bounds: IntArray, vertical: Boolean, halfOpened: Boolean, separating: Boolean, occluding: Boolean, web: IntArray, density: Float): Fold? {
            val (l, t, r, b) = bounds.toList()
            val (wl, wt, ww, wh) = web.toList()
            if (ww <= 0 || wh <= 0 || density <= 0f) return null
            val a0 = if (vertical) l - wl else t - wt
            val a1 = if (vertical) r - wl else b - wt
            val span = if (vertical) ww else wh
            // It must cross the page, with room for something on both sides.
            if (a0 <= 0 || a1 >= span) return null
            if (vertical && (t - wt > 0 || b - wt < wh)) return null
            if (!vertical && (l - wl > 0 || r - wl < ww)) return null
            return Fold(
                axis = if (vertical) "vertical" else "horizontal",
                state = if (halfOpened) "half" else "flat",
                start = (a0 / density).roundToInt(),
                end = (a1 / density).roundToInt(),
                separating = separating,
                occluding = occluding,
            )
        }
    }
}
