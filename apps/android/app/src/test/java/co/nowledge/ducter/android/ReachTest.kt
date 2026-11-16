package co.nowledge.ducter.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// D293: the same rules as packages/protocol/src/reach.ts, and a proof the home made in TypeScript
// (seed 32 × 0x07) checks here.
class ReachTest {
    private val key = "6kpsY-KcUgq-9VB7Ey7F-ZVHdq6-vnuSQh7qaRRG0iw"
    private val fp = "_oEsEvOrTOasXbaaw1L5Bg"
    private val sig = "Q5yHDneRHmdLJAI-d8DwzJPTQQ3hv4Q5BDNQ93yqDSzHqM-UIRZ-RrSM_m1wvTSQYXSQfv_xpGli1R9ClF-0Bw"

    @Test fun proofFromTheHome() {
        assertEquals(fp, Reach.fingerprint(java.util.Base64.getUrlDecoder().decode(key)))
        assertTrue(Reach.check(key, sig, "abcdefghijklmnopqrstuv", fp))
        assertFalse(Reach.check(key, sig, "another-nonce-1234567", fp))
        assertFalse(Reach.check(key, sig, "abcdefghijklmnopqrstuv", "AAAAAAAAAAAAAAAAAAAAAA"))
    }

    @Test fun linkCarriesTheKey() {
        assertEquals(PairTarget("https://h.example/", "K7QM-4XPA", fp), PairTarget.parse("https://h.example/pair#c=K7QM-4XPA&k=$fp"))
    }

    @Test fun nearestFirst() {
        val ways = listOf(Way("tunnel", "https://t"), Way("domain", "https://d", primary = true), Way("tailnet", "https://ts"))
        assertEquals(listOf("tailnet", "domain", "tunnel"), Reach.ranked(ways).map { it.kind })
        assertEquals("https://d", Reach.firstThatProves(ways) { it != "https://ts" })
    }

    @Test fun keeperNeedsTwo() {
        val up = mutableMapOf("https://d" to true, "https://ts" to false)
        val k = Keeper { up[it] == true }
        val ways = listOf(Way("domain", "https://d"), Way("tailnet", "https://ts"))
        assertNull(k.tick(ways, "https://d", up = true))
        up["https://ts"] = true
        assertNull(k.tick(ways, "https://d", up = true)) // once
        assertNull(k.tick(ways, "https://d", up = false)) // twice, but not in front: the page isn't reloaded under the person
        assertEquals("https://ts", k.tick(ways, "https://d", up = true))
        up["https://ts"] = false
        assertNull(k.tick(ways, "https://ts", up = false)) // one miss never moves it
        assertEquals("https://d", k.tick(ways, "https://ts", up = false))
    }
}
