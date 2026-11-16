package co.nowledge.ducter.android

/**
 * D253: the loan's life on this side, pure (unit-tested on the JVM). The home beats every few
 * seconds while a loan is on; a loan this phone hears nothing about for [QUIET_END_MS] ends here by
 * itself, so a home that went away (or a page Android paused) never leaves the pill up. Every step
 * carries its deadline in the home's time (`exp`); one that arrives after it is refused, so a page
 * that wakes with old steps queued never runs them (a tap meant for a minute ago).
 */
object HandsetLife {
    /** No word from the home for this long while lent: the loan ends here ("lost"). */
    const val QUIET_END_MS = 15_000L
    /** Clocks differ a little between the home and the phone; the deadline allows for it. */
    const val SKEW_SLACK_MS = 2_000L

    /** Steps that change something on the screen: refused when they arrive late. */
    val ACTS = setOf("tap", "swipe", "key", "text", "launch")

    /**
     * The home's clock minus this phone's, from a `start` that carries the home's `now` (0 when it
     * doesn't: a home from before D253).
     */
    fun skew(homeNow: Long, localNow: Long): Long = if (homeNow > 0) homeNow - localNow else 0

    /** This step came after its deadline (exp, in the home's time): it never runs. */
    fun late(method: String, exp: Long, skew: Long, localNow: Long): Boolean =
        method in ACTS && exp > 0 && localNow + skew > exp + SKEW_SLACK_MS

    /** The home has said nothing for too long: the loan ends on this side. */
    fun silent(lastHeard: Long, localNow: Long): Boolean = lastHeard > 0 && localNow - lastHeard > QUIET_END_MS

    /** Why a loan ended, as the home reads it (protocol HandsetEnd). */
    val WHYS = setOf("stop", "locked", "service", "lost", "network")

    /**
     * D255: a loan this phone heard nothing about for 15 s: the network when the app's own link had
     * been up and is down now (the phone couldn't reach the home), else a home gone quiet.
     */
    fun quietWhy(linkWasUp: Boolean, linkUp: Boolean): String = if (linkWasUp && !linkUp) "network" else "lost"

    /**
     * D280: how long after the screen goes off the lock screen is read. Android's keyguard comes at once
     * for the power key ("Power button instantly locks", on by default, or no secure lock), but for a
     * screen timeout only after "Lock after screen timeout" (5 s by default; SystemUI's
     * KeyguardViewMediator.KEYGUARD_LOCK_AFTER_DELAY_DEFAULT).
     */
    const val OFF_SETTLE_MS = 1_500L
    /** D280: the screen going off again this soon after Ducter woke it is the person's (they pressed the key again). */
    const val WOKE_RECENTLY_MS = 120_000L

    /**
     * D280: why the screen went off while lent: "locked" (the person: the lock screen came at once, or
     * it went off again right after Ducter woke it), which gives the phone back; else "timeout", which
     * never ends the loan (the app wakes the screen). [sinceWoke] < 0: Ducter hasn't woken it in this loan.
     */
    fun offWhy(keyguardLocked: Boolean, sinceWoke: Long): String =
        if (keyguardLocked || (sinceWoke in 0 until WOKE_RECENTLY_MS)) "locked" else "timeout"
}
