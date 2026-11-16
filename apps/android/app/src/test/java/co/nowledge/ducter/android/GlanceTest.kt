package co.nowledge.ducter.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** D306: the glance in the shade. A phase and how long; gone when over, or when it can't stay true. */
class GlanceTest {
    @Test fun aLivePhaseIsOngoingWithItsClock() {
        val l = Glance.Line.of("修 CI 里那个不稳定的测试", "working", 1_000)!!
        assertTrue(l.ongoing)
        assertTrue(l.chronometer)
        assertEquals(1_000_000L, l.sinceMs)
        assertEquals(Glance.QUIET_MS, l.timeoutMs) // without a fresh word it goes, never stale
        assertFalse(l.accent)
    }

    @Test fun onlyNeedsYouAndAskingTakeTheAccent() {
        assertTrue(Glance.Line.of("t", "needs_you", 1)!!.accent)
        assertTrue(Glance.Line.of("t", "asking", 1)!!.accent)
        for (p in Glance.PHASES - setOf("needs_you", "asking")) assertFalse(p, Glance.Line.of("t", p, 1)!!.accent)
    }

    @Test fun theEndRestsAMomentThenGoes() {
        for (p in Glance.ENDED) {
            val l = Glance.Line.of("t", p, 1)!!
            assertFalse(p, l.ongoing)
            assertFalse(p, l.chronometer)
            assertEquals(Glance.ENDED_MS, l.timeoutMs)
        }
    }

    @Test fun nothingWithoutATitleOrAKnownPhase() {
        assertNull(Glance.Line.of(" ", "working", 1))
        assertNull(Glance.Line.of("t", "heartbeat", 1))
        assertEquals(80, Glance.Line.of("x".repeat(200), "working", 1)!!.title.length)
    }

    @Test fun oneNotificationPerThing() {
        assertEquals(Glance.idOf("task", "t1"), Glance.idOf("task", "t1"))
        assertNotEquals(Glance.idOf("task", "t1"), Glance.idOf("call", "t1"))
        for (p in Glance.PHASES) Glance.phaseRes(p) // every phase has its words
    }
}
