package co.nowledge.ducter.android

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PairTargetTest {
    @Test fun wholeLink() {
        assertEquals(PairTarget("https://ducter.example.com/", "K7QM-4XPA"), PairTarget.parse("https://ducter.example.com/pair#c=k7qm-4xpa"))
    }

    @Test fun addresses() {
        assertEquals(PairTarget("https://h.example/", null), PairTarget.parse("h.example"))
        assertEquals(PairTarget("http://10.0.0.5:7880/", null), PairTarget.parse("10.0.0.5:7880"))
        assertEquals(PairTarget("http://mac.local/", null), PairTarget.parse("mac.local"))
        assertEquals(PairTarget("http://127.0.0.1:7797/", "AB12-CD34"), PairTarget.parse("http://127.0.0.1:7797/app", "ab12-cd34"))
        assertEquals(PairTarget("https://h.example/sub/", null), PairTarget.parse("https://h.example/sub/pair"))
    }

    @Test fun refuses() {
        assertNull(PairTarget.parse(""))
        assertNull(PairTarget.parse("not an address"))
        assertNull(PairTarget.parse("ftp://h"))
    }

    @Test fun origin() {
        assertEquals("http://10.0.2.2:7797", PairTarget.origin("http://10.0.2.2:7797/"))
        assertEquals("https://h.example", PairTarget.origin("https://h.example/sub/"))
    }
}

class VersionsTest {
    @Test fun order() {
        assertEquals(-1, Versions.compare("0.0.9", "0.0.10"))
        assertEquals(-1, Versions.compare("0.2.0-beta.1", "0.2.0"))
        assertEquals(-1, Versions.compare("0.2.0-beta.2", "0.2.0-beta.10"))
        assertEquals(0, Versions.compare("v1.2.3", "1.2.3"))
        assertEquals(1, Versions.compare("1.0.0", "nonsense"))
    }

    @Test fun bare() {
        assertEquals("0.0.10", Versions.bare("0.0.10-dev"))
        assertEquals("0.0.10", Versions.bare("v0.0.10"))
    }

    /** Every tag Ducter can cut must ship with a higher versionCode than the one before. */
    @Test fun codesRise() {
        val order = listOf("0.0.9", "0.0.10-beta.1", "0.0.10-rc.2", "0.0.10", "0.0.11", "0.1.0-beta.1", "0.1.0", "1.0.0")
        val codes = order.map(Versions::code)
        assertEquals(codes.sorted(), codes)
        assertEquals(codes.toSet().size, codes.size)
        assertEquals(1099, Versions.code("0.0.10"))
    }
}

class WhatsNewTest {
    private val body = """
        <!-- whats-new
        zh: 安卓 App 来了，自己会更新
        en: Ducter for Android, updating itself from the release
        zh: 折叠屏打开时，对话和手头的事分在折痕两边
        zh: 第三行不要
        en: ${"x".repeat(81)}
        -->
        **Android**
    """.trimIndent()

    @Test fun perLanguage() {
        val n = WhatsNew.parse(body)
        assertEquals(listOf("安卓 App 来了，自己会更新", "折叠屏打开时，对话和手头的事分在折痕两边"), n["zh"])
        assertEquals(listOf("Ducter for Android, updating itself from the release"), n["en"])
    }

    @Test fun noBlockNoNotes() {
        assertTrue(WhatsNew.parse("Just notes").isEmpty())
    }
}

class AssetTest {
    @Test fun sums() {
        val h = "a".repeat(64)
        assertEquals(h, Asset.sumFromDigest("sha256:$h"))
        assertNull(Asset.sumFromDigest("sha512:abc"))
        assertEquals(h, Asset.sumFromList("$h  Ducter-0.0.10-android.apk\n${"b".repeat(64)}  other", "Ducter-0.0.10-android.apk"))
    }

    @Test fun onlyGitHub() {
        assertTrue(Asset.trusted("https://github.com/wey-gu/ducter/releases/download/v0.0.10/Ducter-0.0.10-android.apk"))
        assertTrue(Asset.trusted("https://objects.githubusercontent.com/x"))
        assertFalse(Asset.trusted("http://github.com/x"))
        assertFalse(Asset.trusted("https://github.com.evil.example/x"))
    }

    @Test fun releaseFromTheApi() {
        val j = JSONObject(
            """{"tag_name":"v0.0.11","body":"<!-- whats-new\nen: Hi\n-->","assets":[
               {"name":"Ducter-0.0.11-android.apk","browser_download_url":"https://github.com/a","size":123,"digest":"sha256:${"c".repeat(64)}"},
               {"name":"SHA256SUMS.txt","browser_download_url":"https://github.com/s"}]}""",
        )
        val r = Updater.release(j, "0.0.11")!!
        assertEquals("c".repeat(64), r.sha256)
        assertEquals("https://github.com/s", r.sumsUrl)
        assertEquals(listOf("Hi"), r.notes["en"])
        assertNull(Updater.release(JSONObject("""{"assets":[]}"""), "0.0.11"))
    }
}

class FoldTest {
    // A Pixel Fold's inner screen held open, density 2.625: 2208 × 1840 px, a seamless fold at x=1104.
    @Test fun book() {
        val f = Fold.of(intArrayOf(1104, 0, 1104, 1840), vertical = true, halfOpened = true, separating = true, occluding = false, web = intArrayOf(0, 0, 2208, 1840), density = 2.625f)!!
        assertEquals("vertical", f.axis)
        assertEquals("half", f.state)
        assertEquals(421, f.start)
        assertEquals(421, f.end)
    }

    // Tabletop: the fold runs across.
    @Test fun tabletop() {
        val f = Fold.of(intArrayOf(0, 920, 2208, 920), vertical = false, halfOpened = true, separating = true, occluding = false, web = intArrayOf(0, 0, 2208, 1840), density = 2.625f)!!
        assertEquals("horizontal", f.axis)
        assertEquals(350, f.start)
    }

    // A hinge with width (two screens): start and end differ.
    @Test fun hinge() {
        val f = Fold.of(intArrayOf(1350, 0, 1434, 1800), vertical = true, halfOpened = false, separating = true, occluding = true, web = intArrayOf(0, 0, 2784, 1800), density = 2.5f)!!
        assertEquals(540, f.start)
        assertEquals(574, f.end)
        assertTrue(f.occluding)
    }

    // The fold doesn't cross the web view (the app in a window beside it): none.
    @Test fun notAcross() {
        assertNull(Fold.of(intArrayOf(1104, 0, 1104, 1840), vertical = true, halfOpened = false, separating = false, occluding = false, web = intArrayOf(0, 0, 1000, 1840), density = 2.625f))
    }
}

/** D200: the same cases as the iPhone app's apps/ios/scripts/home-version/main.swift. */
class HomeVersionTest {
    @Test fun core() {
        assertEquals(listOf(0L, 0L, 9L), HomeVersion.core("0.0.9"))
        assertEquals(listOf(0L, 2L, 0L), HomeVersion.core("v0.2.0-beta.1"))
        assertEquals(listOf(0L, 0L, 14L), HomeVersion.core("0.0.14-dev"))
        assertNull(HomeVersion.core("1.2"))
        assertNull(HomeVersion.core("dev"))
        assertNull(HomeVersion.core("1.x.3"))
    }

    @Test fun older() {
        assertTrue(HomeVersion.older("0.0.15", "0.0.9"))
        assertTrue("numeric, not text", HomeVersion.older("0.0.10", "0.0.9"))
        assertTrue(HomeVersion.older("0.1.0", "0.0.99"))
        assertFalse(HomeVersion.older("0.0.15", "0.0.15"))
        assertFalse("home newer", HomeVersion.older("0.0.15", "0.0.16"))
        assertFalse("a beta home and the store build of it", HomeVersion.older("0.2.0", "0.2.0-beta.1"))
        assertTrue("no version: a home from before D200", HomeVersion.older("0.0.15", null))
        assertFalse(HomeVersion.older("0.0.0", null))
        assertFalse(HomeVersion.older("0.0.15", "dev"))
        assertFalse(HomeVersion.older("nonsense", "0.0.9"))
    }

    @Test fun gotItHoldsForThatPair() {
        val base = "https://ducter.example.com/"
        assertTrue(HomeVersion.shouldShow("0.0.15", "0.0.9", base, null))
        val k = HomeVersion.key(base, "0.0.9", "0.0.15")
        assertFalse(HomeVersion.shouldShow("0.0.15", "0.0.9", base, k))
        assertTrue("home updated, still behind", HomeVersion.shouldShow("0.0.15", "0.0.12", base, k))
        assertTrue("app updated", HomeVersion.shouldShow("0.0.16", "0.0.9", base, k))
        assertTrue("another home", HomeVersion.shouldShow("0.0.15", "0.0.9", "https://other.example/", k))
    }
}
