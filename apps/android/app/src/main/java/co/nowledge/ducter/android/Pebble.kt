package co.nowledge.ducter.android

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.graphics.drawable.StateListDrawable
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.Button
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.core.content.res.ResourcesCompat

/**
 * Pebble (ui.md) for the few screens the app draws itself: connecting, can't reach, an update.
 * Same tokens as apps/web/static/app.css and apps/ios/Ducter/Theme.swift; views use these, never
 * raw colors or sizes.
 */
object Pebble {
    const val RADIUS_SMALL = 12f
    const val BUTTON_RADIUS = 18f
    const val BUTTON_HEIGHT = 52
    const val LEDGE = 4

    fun dp(c: Context, v: Number): Int = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), c.resources.displayMetrics).toInt()
    fun color(c: Context, id: Int) = ContextCompat.getColor(c, id)

    private var face: Typeface? = null
    fun font(c: Context): Typeface = face ?: (ResourcesCompat.getFont(c, R.font.bricolage) ?: Typeface.DEFAULT).also { face = it }

    /** Bricolage at a weight (a variable font: 'wght' 200–800); CJK falls back to the system's. */
    fun text(v: TextView, sizeSp: Float, weight: Int = 400, colorId: Int = R.color.ink) {
        v.typeface = font(v.context)
        v.fontVariationSettings = "'wght' $weight"
        v.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        v.setTextColor(color(v.context, colorId))
        v.includeFontPadding = false
    }

    /** Titles: 800, a step smaller in Chinese (D78). */
    fun display(v: TextView, sizeSp: Float) {
        val zh = v.resources.configuration.locales[0].language == "zh"
        text(v, if (zh && sizeSp == 28f) 26f else sizeSp, 800)
        v.letterSpacing = -0.01f
    }

    private fun rounded(c: Context, colorId: Int, radius: Float, stroke: Int? = null): GradientDrawable =
        GradientDrawable().apply {
            cornerRadius = dp(c, radius).toFloat()
            setColor(color(c, colorId))
            if (stroke != null) setStroke(dp(c, 1), color(c, stroke))
        }

    /** A clay button (D76): it stands on a ledge of its own darker shade and sinks into it when pressed. */
    private fun clay(c: Context, fill: Int, ledge: Int): Drawable {
        val l = dp(c, LEDGE)
        fun layers(down: Boolean) = LayerDrawable(arrayOf(rounded(c, ledge, BUTTON_RADIUS), rounded(c, fill, BUTTON_RADIUS))).apply {
            setLayerInset(0, 0, l, 0, 0)
            if (down) setLayerInset(1, 0, l, 0, 0) else setLayerInset(1, 0, 0, 0, l)
        }
        return StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_pressed), layers(true))
            addState(intArrayOf(), layers(false))
        }
    }

    fun primary(b: Button) = button(b, R.color.accent, R.color.press_accent, R.color.on_accent)
    fun quiet(b: Button) = button(b, R.color.surface, R.color.press_quiet, R.color.ink)

    private fun button(b: Button, fill: Int, ledge: Int, ink: Int) {
        val c = b.context
        text(b, 16f, 700, ink)
        b.isAllCaps = false
        b.background = clay(c, fill, ledge)
        b.stateListAnimator = null
        b.minHeight = dp(c, BUTTON_HEIGHT + LEDGE)
        b.setPadding(dp(c, 22), 0, dp(c, 22), dp(c, LEDGE))
        b.gravity = Gravity.CENTER
    }

    /** A field: the surface, a hairline, the small radius. */
    fun field(v: TextView) {
        val c = v.context
        text(v, 16f)
        v.background = rounded(c, R.color.surface, RADIUS_SMALL, R.color.line2)
        v.minimumHeight = dp(c, 52) // the View's own minimum: setSingleLine() resets a TextView's
        v.gravity = Gravity.CENTER_VERTICAL or Gravity.START
        v.setPadding(dp(c, 14), 0, dp(c, 14), 0)
        v.setHintTextColor(color(c, R.color.ink_muted))
    }

    fun card(c: Context): Drawable = rounded(c, R.color.bg, 24f, R.color.line)

    /**
     * A screen settles in (Pebble's enter): after a short wait it rises 8 dp and fades in, with a
     * small overshoot; at once when the system turns animations off.
     */
    fun settle(v: View, delayMs: Long = 180) {
        val off = Settings.Global.getFloat(v.context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        if (off) return
        v.alpha = 0f
        v.translationY = dp(v.context, 8).toFloat()
        v.animate().alpha(1f).translationY(0f).setStartDelay(delayMs).setDuration(420)
            .setInterpolator(android.view.animation.OvershootInterpolator(1.2f)).start()
    }

    /** The partner breathes (D77): 3.8 s, from its feet; still when the system turns animations off. */
    fun breathe(v: View) {
        val off = Settings.Global.getFloat(v.context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        if (off) return
        v.post { v.pivotY = v.height.toFloat(); v.pivotX = v.width / 2f }
        for ((prop, to) in listOf("scaleY" to 1.03f, "scaleX" to 1.012f)) {
            ObjectAnimator.ofFloat(v, prop, 1f, to).apply {
                duration = 1900
                repeatMode = ValueAnimator.REVERSE
                repeatCount = ValueAnimator.INFINITE
                interpolator = AccelerateDecelerateInterpolator()
                start()
            }
        }
    }
}
