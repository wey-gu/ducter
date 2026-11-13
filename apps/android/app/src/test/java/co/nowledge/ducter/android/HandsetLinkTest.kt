package co.nowledge.ducter.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** D255: the lent phone's own link, and one recording's life. */
class HandsetLinkTest {
    private var t = 0L
    private fun machine() = LinkMachine { t }

    @Test fun reconnectsWithBackoffInsideTheHomesRule() {
        val m = machine()
        m.start()
        assertEquals("connecting", m.state)
        m.opened()
        assertEquals(1, m.gen)
        // A network blip: quick retries, never longer than 8 s between them (the home waits 15 s).
        val waits = (0 until 7).map { m.closed().also { m.retry() } }
        assertEquals(listOf(500L, 1_000L, 2_000L, 4_000L, 8_000L, 8_000L, 8_000L), waits)
        m.opened()
        assertEquals(2, m.gen) // each connection is a new generation: the home tells old words from new
        assertEquals(500L, m.closed()) // back up: backoff starts over
    }

    @Test fun downForFifteenSecondsAfterBeingUpIsTheNetwork() {
        val m = machine()
        m.start()
        // Never up yet (the page carries the loan meanwhile): never "the network".
        t = 60_000
        assertFalse(m.cutOff())
        m.opened()
        t = 100_000
        m.closed()
        t = 114_000
        assertFalse(m.cutOff())
        t = 115_001
        assertTrue(m.cutOff())
        // Back within the rule: fine again.
        m.retry()
        m.opened()
        assertFalse(m.cutOff())
    }

    @Test fun stoppedMeansNoMoreTries() {
        val m = machine()
        m.start()
        m.opened()
        m.stop()
        assertEquals(-1L, m.closed())
        assertFalse(m.retry())
        m.opened()
        assertEquals("stopped", m.state)
    }

    @Test fun theHomesSocket() {
        assertEquals("wss://home.example/ws", LinkMachine.wsUrl("https://home.example/"))
        assertEquals("ws://10.0.2.2:7795/ws", LinkMachine.wsUrl("http://10.0.2.2:7795"))
        assertNull(LinkMachine.wsUrl("ftp://x/"))
    }

    @Test fun whyALoanWentQuiet() {
        assertEquals("network", HandsetLife.quietWhy(linkWasUp = true, linkUp = false))
        assertEquals("lost", HandsetLife.quietWhy(linkWasUp = true, linkUp = true))
        assertEquals("lost", HandsetLife.quietWhy(linkWasUp = false, linkUp = false))
        assertTrue("network" in HandsetLife.WHYS)
    }

    @Test fun aRecordingAskedThenRecordedThenSaved() {
        val r = RecordLife("r1", "task1")
        assertEquals("asking", r.state)
        assertTrue(r.active)
        assertFalse(r.stopped(partial = false)) // nothing to stop while Android asks
        assertTrue(r.on(1_000))
        assertFalse(r.on(2_000))
        assertTrue(r.stopped(partial = false))
        r.file("Ducter-1.mp4", 10_000, 2_000_000)
        assertEquals("saving", r.state)
        r.saved()
        assertEquals("saved", r.state)
        assertFalse(r.active)
        val j = r.json()
        assertEquals(10_000L, j.getLong("ms"))
        assertFalse(j.has("partial"))
    }

    @Test fun aRecordingTheLoansEndStoppedIsPartial() {
        val r = RecordLife("r1", "task1")
        r.on(1_000)
        assertTrue(r.stopped(partial = true))
        assertTrue(r.json().getBoolean("partial"))
        r.sendFailed("couldn't send it")
        assertEquals("failed", r.state)
        assertEquals("couldn't send it", r.json().getString("error"))
    }

    @Test fun declinedOrEmptyIsNeverAVideo() {
        val r = RecordLife("r1", "task1")
        assertTrue(r.no(declined = true, why = "the user didn't allow it"))
        assertEquals("declined", r.state)
        assertFalse(r.on(5))
        val e = RecordLife("r2", "task1")
        e.on(1)
        e.stopped(partial = false)
        e.empty("nothing was recorded")
        assertEquals("failed", e.state)
    }

    @Test fun theVideoSizeKeepsTheScreensShape() {
        assertEquals(590 to 1280, RecordLife.size(1080, 2340)) // a phone upright: long edge 1280, both even
        assertEquals(1280 to 1066, RecordLife.size(2208, 1840)) // a Pixel Fold open
        assertEquals(720 to 1280, RecordLife.size(720, 1280)) // already small: as it is
    }
}
