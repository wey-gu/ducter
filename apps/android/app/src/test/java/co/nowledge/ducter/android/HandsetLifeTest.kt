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

    // D280: a screen timeout never ends a loan; the person's own lock does.
    @Test fun theLockScreenAtOnceIsThePersonsLockATimeoutIsNot() {
        // The power key: Android shows the lock screen at once.
        assertEquals("locked", HandsetLife.offWhy(keyguardLocked = true, sinceWoke = -1))
        // A timeout: the lock screen waits for "Lock after screen timeout", so it isn't up 1.5 s later.
        assertEquals("timeout", HandsetLife.offWhy(keyguardLocked = false, sinceWoke = -1))
        // Off again right after Ducter woke it: the person pressed the key again.
        assertEquals("locked", HandsetLife.offWhy(keyguardLocked = false, sinceWoke = 30_000))
        assertEquals("timeout", HandsetLife.offWhy(keyguardLocked = false, sinceWoke = HandsetLife.WOKE_RECENTLY_MS))
        assertTrue(HandsetLife.OFF_SETTLE_MS < 5_000) // read before the default lock delay
    }

    // D331: locking pauses a loan; a Go on a locked phone waits for the unlock; never through the lock.
    @Test fun aGoOnALockedPhoneWaitsForTheUnlock() {
        assertEquals("wait", HandsetLife.startOn(locked = true, same = false, paused = false))
        assertEquals("show", HandsetLife.startOn(locked = false, same = false, paused = false))
    }

    @Test fun aRefreshOfAPausedLoanStaysPaused() {
        assertEquals("quiet", HandsetLife.startOn(locked = true, same = true, paused = true))
        assertEquals("quiet", HandsetLife.startOn(locked = false, same = true, paused = true)) // unlocked, still asking
        assertEquals("quiet", HandsetLife.startOn(locked = true, same = true, paused = false)) // locked, the watch not yet paused
        assertEquals("show", HandsetLife.startOn(locked = false, same = true, paused = false))
    }

    @Test fun unlockingAPausedLoanAsksAndNeverResumesByItself() {
        assertEquals("ask", HandsetLife.onUnlock("locked"))
        assertEquals("hello", HandsetLife.onUnlock("asking")) // already asked: the notification stays
        assertEquals("hello", HandsetLife.onUnlock(null))
    }

    @Test fun aPauseEndsAfterHalfAnHour() {
        assertEquals(30 * 60_000L, HandsetLife.PAUSE_MAX_MS)
        assertFalse(HandsetLife.pauseOver(0, 99_000_000)) // not paused
        assertFalse(HandsetLife.pauseOver(1_000, 1_000 + HandsetLife.PAUSE_MAX_MS))
        assertTrue(HandsetLife.pauseOver(1_000, 1_001 + HandsetLife.PAUSE_MAX_MS))
        assertTrue("taken" in HandsetLife.WHYS && "expired" in HandsetLife.WHYS)
    }
}
