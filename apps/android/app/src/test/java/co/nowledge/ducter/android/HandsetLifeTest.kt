package co.nowledge.ducter.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** D253: the loan's life on the phone's side. */
class HandsetLifeTest {
    @Test fun aStepAfterItsDeadlineNeverRuns() {
        val skew = HandsetLife.skew(homeNow = 1_000_000, localNow = 999_000) // the home is 1 s ahead
        assertEquals(1_000L, skew)
        // On time (the home's 1_005_000 is before the deadline).
        assertFalse(HandsetLife.late("tap", exp = 1_010_000, skew = skew, localNow = 1_004_000))
        // A paused page wakes a minute later with the tap still queued: refused.
        assertTrue(HandsetLife.late("tap", exp = 1_010_000, skew = skew, localNow = 1_070_000))
        for (m in listOf("swipe", "key", "text", "launch")) assertTrue(HandsetLife.late(m, 1_010_000, skew, 1_070_000))
        // Reads and the beat are harmless late: they answer, and the home drops what it no longer waits for.
        for (m in listOf("screen", "front", "beat", "stop")) assertFalse(HandsetLife.late(m, 1_010_000, skew, 1_070_000))
    }

    @Test fun clocksThatDifferALittleAreAllowed() {
        assertFalse(HandsetLife.late("tap", exp = 10_000, skew = 0, localNow = 11_500))
        assertTrue(HandsetLife.late("tap", exp = 10_000, skew = 0, localNow = 12_500))
        // A home from before D253 sends no deadline: never refused for it.
        assertFalse(HandsetLife.late("tap", exp = 0, skew = 0, localNow = 99_999_999))
        assertEquals(0L, HandsetLife.skew(homeNow = 0, localNow = 5))
    }

    @Test fun aLoanTheHomeSaysNothingAboutEndsHere() {
        assertFalse(HandsetLife.silent(lastHeard = 100_000, localNow = 110_000))
        assertTrue(HandsetLife.silent(lastHeard = 100_000, localNow = 115_001))
        assertFalse(HandsetLife.silent(lastHeard = 0, localNow = 115_001))
    }
}
