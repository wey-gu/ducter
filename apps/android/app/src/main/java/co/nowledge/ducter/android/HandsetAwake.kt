package co.nowledge.ducter.android

import android.content.Context
import android.os.PowerManager

/**
 * D280: a lent phone's screen stays on for the whole loan, so it never locks itself while the task
 * thinks (on the author's Pixel Fold it went dark during an idle loan).
 *
 * Two holds, either enough. The pill's window carries FLAG_KEEP_SCREEN_ON (D253): AOSP honours it for
 * any window type, an accessibility overlay included, but only while that window has a drawn surface
 * that nothing full-screen and opaque covers (DisplayContent.applySurfaceChangesTransaction), so it
 * lapses silently whenever the pill isn't drawn. The second hold is the app's own: a screen wake lock
 * for exactly the loan's life. Its level (SCREEN_BRIGHT_WAKE_LOCK) is deprecated in favour of
 * FLAG_KEEP_SCREEN_ON for apps that have an activity in front; an accessibility service has none, and
 * PowerManagerService still honours the level (it is the very lock WindowManager takes for
 * FLAG_KEEP_SCREEN_ON), refusing it only to a cached process, which a bound accessibility service
 * with a foreground service never is. No ACQUIRE_CAUSES_WAKEUP on it: it never turns a screen on.
 *
 * If the screen goes off anyway and the lock screen isn't up (a timeout, not the person's power key),
 * [wake] turns it back on once, before Android's lock delay ends (ACQUIRE_CAUSES_WAKEUP, which needs
 * TURN_SCREEN_ON for apps targeting the release that enforces it; declared in the manifest).
 */
object Awake {
    private var hold: PowerManager.WakeLock? = null

    /** The loan started: hold the screen on until [release]. */
    @Suppress("DEPRECATION")
    fun hold(c: Context) {
        if (hold?.isHeld == true) return
        try {
            val pm = c.applicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            hold = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ON_AFTER_RELEASE, "ducter:loan").apply {
                setReferenceCounted(false)
                acquire()
            }
        } catch (_: Exception) {
            hold = null // the pill's flag still holds it
        }
    }

    /** The loan ended: the screen sleeps by the person's own timeout again. */
    fun release() {
        try {
            hold?.let { if (it.isHeld) it.release() }
        } catch (_: Exception) {
        }
        hold = null
    }

    /** The screen timed out while lent: turn it back on (a few seconds' lock; [hold] keeps it on after). */
    @Suppress("DEPRECATION")
    fun wake(c: Context): Boolean = try {
        val pm = c.applicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
        pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE, "ducter:wake").acquire(3_000)
        true
    } catch (_: Exception) {
        false
    }
}
