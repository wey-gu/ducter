package co.nowledge.ducter.android

import android.animation.ValueAnimator
import android.content.Context
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Outline
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * D238's indicator, chosen by research/74 §7 (the literal pill read right 3/3 by naive raters; a
 * glow, a mascot, a tag and a red dot didn't): while a task holds the phone, a small clay pill sits
 * in the status bar, over every app: the partner's face, **{name} 正在用这台手机 / {name} is using
 * this phone**, under it what it is doing now, and **停下 / Stop**. Each tap the task makes shows as
 * a soft ring where it lands, so the person sees where it acts. An accessibility overlay: it needs
 * no "draw over other apps" permission, and the screen reads never include it.
 */
class HandsetPill(private val c: Context) {
    private val wm = c.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private var pill: View? = null
    private var title: TextView? = null
    private var line: TextView? = null
    private var rings: Rings? = null
    /** Ducter's language from the home ("zh" / "en"): the pill speaks it, one language with the
     *  lines the home sends; unset (auto), the phone's own. */
    var lang: String = ""
    private val loc: Context
        get() = if (lang.isEmpty()) c else c.createConfigurationContext(Configuration(c.resources.configuration).apply { setLocale(java.util.Locale.forLanguageTag(lang)) })
    private val still get() = Settings.Global.getFloat(c.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f

    private fun params(touchable: Boolean, full: Boolean) = WindowManager.LayoutParams(
        if (full) WindowManager.LayoutParams.MATCH_PARENT else WindowManager.LayoutParams.WRAP_CONTENT,
        if (full) WindowManager.LayoutParams.MATCH_PARENT else WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            (if (touchable) 0 else WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE) or (if (full) WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS else 0),
        PixelFormat.TRANSLUCENT,
    ).apply {
        gravity = if (full) Gravity.TOP or Gravity.START else Gravity.TOP or Gravity.CENTER_HORIZONTAL
        if (!full) y = Pebble.dp(c, 4)
        if (Build.VERSION.SDK_INT >= 30) layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
        else if (Build.VERSION.SDK_INT >= 28) layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    }

    private fun words(turn: String): String {
        val name = Store(c).personaName
        return this@HandsetPill.loc.getString(if (turn == "you") R.string.handset_pill_you else R.string.handset_pill, name)
    }

    fun show(task: String, turn: String) {
        // The words go in before the window is added, so it is measured with them (else it keeps
        // the width of an empty pill and cuts the name: seen on the emulator).
        if (pill == null) build(words(turn))
        title?.let { fit(it, words(turn)) }
        line?.text = if (turn == "you") this@HandsetPill.loc.getString(R.string.handset_pill_you_line) else task
        (pill?.background as? GradientDrawable)?.setStroke(Pebble.dp(c, if (turn == "you") 2 else 1), Pebble.color(c, if (turn == "you") R.color.accent else R.color.line2))
    }

    /** The name line at its whole width, up to a limit (a long partner name ends in "…"). */
    private fun fit(t: TextView, s: String) {
        t.text = s
        t.minWidth = minOf(Pebble.dp(c, 220), t.paint.measureText(s).toInt() + Pebble.dp(c, 2))
    }

    /** What the task is doing now ("点「发送」"), under its name; empty keeps the task's title. */
    fun doing(s: String) {
        if (s.isNotEmpty()) line?.text = s
    }

    private fun build(first: String) {
        val d = Pebble.dp(c, 1)
        val face = ImageView(c).apply {
            setImageResource(R.drawable.idle)
            scaleType = ImageView.ScaleType.CENTER_CROP
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(v: View, o: Outline) = o.setOval(0, 0, v.width, v.height)
            }
            clipToOutline = true
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Pebble.color(c, R.color.surface)) }
        }
        val t = TextView(c).apply { Pebble.text(this, 12.5f, 700); isSingleLine = true; ellipsize = android.text.TextUtils.TruncateAt.END; maxWidth = Pebble.dp(c, 220) }
        fit(t, first)
        val l = TextView(c).apply { Pebble.text(this, 11f, 500, R.color.ink_muted); isSingleLine = true; ellipsize = android.text.TextUtils.TruncateAt.END; maxWidth = Pebble.dp(c, 190) }
        val words = LinearLayout(c).apply {
            orientation = LinearLayout.VERTICAL
            addView(t, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
            addView(l, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = d * 2 })
        }
        val stop = Button(c).apply {
            text = this@HandsetPill.loc.getString(R.string.handset_stop)
            Pebble.primary(this)
            Pebble.text(this, 13f, 700, R.color.on_accent)
            minHeight = Pebble.dp(c, 32)
            minimumHeight = Pebble.dp(c, 32)
            minWidth = 0
            minimumWidth = 0
            isSingleLine = true
            setPadding(Pebble.dp(c, 14), 0, Pebble.dp(c, 14), Pebble.dp(c, Pebble.LEDGE))
            contentDescription = this@HandsetPill.loc.getString(R.string.handset_stop_about)
            setOnClickListener {
                performHapticFeedback(android.view.HapticFeedbackConstants.CONFIRM)
                Handset.stopTapped(c)
            }
        }
        val row = LinearLayout(c).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(d * 6, d * 5, d * 6, d * 5)
            background = GradientDrawable().apply {
                cornerRadius = Pebble.dp(c, 22).toFloat()
                setColor(Pebble.color(c, R.color.bg))
                setStroke(d, Pebble.color(c, R.color.line2))
            }
            elevation = Pebble.dp(c, 6).toFloat()
            addView(face, LinearLayout.LayoutParams(Pebble.dp(c, 28), Pebble.dp(c, 28)))
            addView(words, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { leftMargin = d * 8; rightMargin = d * 10 })
            addView(stop, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, Pebble.dp(c, 36)))
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
        }
        title = t
        line = l
        pill = row
        val r = Rings(c)
        rings = r
        try {
            wm.addView(r, params(touchable = false, full = true))
            wm.addView(row, params(touchable = true, full = false))
        } catch (e: Exception) {
            pill = null
            rings = null
            return
        }
        // It arrives the way a pebble settles: down from the edge, a small overshoot, still.
        if (!still) {
            row.translationY = -Pebble.dp(c, 40).toFloat()
            row.alpha = 0f
            row.animate().translationY(0f).alpha(1f).setDuration(420).setInterpolator(android.view.animation.OvershootInterpolator(1.4f)).start()
            Pebble.breathe(face)
        }
    }

    fun hide() {
        val p = pill
        val r = rings
        pill = null
        rings = null
        title = null
        line = null
        if (p != null) {
            if (still) remove(p) else p.animate().translationY(-Pebble.dp(c, 40).toFloat()).alpha(0f).setDuration(240).withEndAction { remove(p) }.start()
        }
        if (r != null) remove(r)
    }

    private fun remove(v: View) = try { wm.removeView(v) } catch (_: Exception) {}

    /** A soft ring where the task taps (screen pixels). */
    fun ring(x: Float, y: Float) = rings?.at(x, y, still)

    /** Out of the way for a picture of the screen, then back. */
    fun hideFor(then: () -> Unit) {
        val p = pill
        if (p == null) return then()
        p.alpha = 0f
        rings?.alpha = 0f
        p.postDelayed({
            then()
            p.postDelayed({ p.alpha = 1f; rings?.alpha = 1f }, 300)
        }, 80)
    }

    private class Rings(c: Context) : FrameLayout(c) {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Pebble.color(c, R.color.accent) }
        private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Pebble.color(c, R.color.accent) }
        private var x = 0f
        private var y = 0f
        private var t = 1f
        private val r0 = Pebble.dp(c, 10).toFloat()
        private val r1 = Pebble.dp(c, 30).toFloat()

        init {
            setWillNotDraw(false)
            setBackgroundColor(Color.TRANSPARENT)
        }

        fun at(px: Float, py: Float, still: Boolean) {
            val loc = IntArray(2).also { getLocationOnScreen(it) }
            x = px - loc[0]
            y = py - loc[1]
            if (still) {
                t = 0.5f
                invalidate()
                postDelayed({ t = 1f; invalidate() }, 500)
                return
            }
            ValueAnimator.ofFloat(0f, 1f).apply {
                duration = 520
                interpolator = DecelerateInterpolator()
                addUpdateListener { t = it.animatedValue as Float; invalidate() }
                start()
            }
        }

        override fun onDraw(canvas: Canvas) {
            if (t >= 1f) return
            val a = ((1f - t) * 255).toInt()
            paint.alpha = a
            paint.strokeWidth = Pebble.dp(context, 3).toFloat() * (1f - t * 0.5f)
            fill.alpha = (a * 0.25f).toInt()
            val r = r0 + (r1 - r0) * t
            canvas.drawCircle(x, y, r, fill)
            canvas.drawCircle(x, y, r, paint)
        }
    }
}
