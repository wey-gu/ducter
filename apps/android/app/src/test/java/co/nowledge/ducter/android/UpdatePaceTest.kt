package co.nowledge.ducter.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// D342: the author's phone was offered 0.0.71, the download from GitHub failed, and reopening the
// app never offered it again (the hour since the check that found it had not passed, and a stuck
// step blocked every quiet check). These are the cases.
class UpdatePaceTest {
    private val r = Release("0.0.71", emptyMap(), "https://github.com/a", "Ducter-0.0.71-android.apk", 10, null, null)
    private val min = 60_000L
    private val t0 = 1_800_000_000_000L

    @Test fun aFailedDownloadIsOfferedAgainOnOpening() {
        // Found 2 minutes ago, not installed, not put off: the app just opened again.
        val waiting = UpdatePace.waiting("0.0.71", "0.0.70", null, 0, t0)
        assertTrue(waiting)
        assertTrue(UpdatePace.due(t0, t0 - 2 * min, firstThisRun = true, waiting = waiting))
        // Still open and back in front a minute later: not yet; after 10 minutes, again.
        assertFalse(UpdatePace.due(t0, t0 - 1 * min, firstThisRun = false, waiting = waiting))
        assertTrue(UpdatePace.due(t0, t0 - 10 * min, firstThisRun = false, waiting = waiting))
    }

    @Test fun nothingWaitingKeepsTheHour() {
        assertFalse(UpdatePace.due(t0, t0 - 2 * min, firstThisRun = true, waiting = false))
        assertTrue(UpdatePace.due(t0, t0 - 60 * min, firstThisRun = false, waiting = false))
        // Never checked: due.
        assertTrue(UpdatePace.due(t0, 0, firstThisRun = true, waiting = false))
    }

    @Test fun laterStillPutsTheVersionOff() {
        assertFalse(UpdatePace.waiting("0.0.71", "0.0.70", "0.0.71", t0 - 60 * min, t0))
        // Three days on, or a newer version: waiting again.
        assertTrue(UpdatePace.waiting("0.0.71", "0.0.70", "0.0.71", t0 - UpdatePace.LATER_MS, t0))
        assertTrue(UpdatePace.waiting("0.0.72", "0.0.70", "0.0.71", t0 - min, t0))
    }

    @Test fun installedOrOlderIsNotWaiting() {
        assertFalse(UpdatePace.waiting("0.0.71", "0.0.71", null, 0, t0))
        assertFalse(UpdatePace.waiting("0.0.70", "0.0.71", null, 0, t0))
        assertFalse(UpdatePace.waiting(null, "0.0.71", null, 0, t0))
        assertFalse(UpdatePace.waiting("garbage", "0.0.71", null, 0, t0))
    }

    @Test fun aQuietCheckNeverCoversACardWaitingForThePerson() {
        assertFalse(UpdatePace.free(UpdateState.Available(r), t0, t0 - 60 * min))
        assertFalse(UpdatePace.free(UpdateState.Failed(r, Why.NETWORK), t0, t0 - 60 * min))
        assertFalse(UpdatePace.free(UpdateState.Done("0.0.71"), t0, t0))
        assertTrue(UpdatePace.free(UpdateState.Idle, t0, t0))
        assertTrue(UpdatePace.free(UpdateState.Current, t0, t0))
        // A check that failed quietly shows nothing: free.
        assertTrue(UpdatePace.free(UpdateState.Failed(null, Why.NETWORK), t0, t0))
    }

    @Test fun aStuckStepIsStartedOver() {
        val dl = UpdateState.Downloading(r, 40)
        assertFalse(UpdatePace.free(dl, t0, t0 - 1 * min)) // still moving
        assertTrue(UpdatePace.free(dl, t0, t0 - UpdatePace.STALL_MS)) // silent 3 minutes
        assertTrue(UpdatePace.free(UpdateState.Installing(r), t0, t0 - 5 * min)) // Android's dialog left behind
        assertTrue(UpdatePace.busy(UpdateState.Checking))
        assertFalse(UpdatePace.busy(UpdateState.Available(r)))
    }

    @Test fun theBrowserIsOfferedWhenItCanHelp() {
        assertTrue(UpdatePace.browserHelps(Why.NETWORK))
        assertTrue(UpdatePace.browserHelps(Why.CHECKSUM))
        assertFalse(UpdatePace.browserHelps(Why.NO_ASSET))
        assertFalse(UpdatePace.browserHelps(Why.SIGNATURE))
        assertEquals("https://ducter.ai/download#android", UpdatePace.BROWSER_URL)
    }
}
