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
    val WHYS = setOf("stop", "locked", "service", "lost")
}
