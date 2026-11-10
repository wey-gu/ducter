package co.nowledge.ducter.android

import android.content.ClipboardManager
import android.content.Context
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import co.nowledge.ducter.android.Pebble.dp

// The screens the app draws itself, the iPhone app's (apps/ios/Ducter/DucterApp.swift) in the
// same words: connect, connecting, can't reach. Everything else is the page.

/** A column at most 480 wide, centered: a phone's width on an open foldable or a tablet (D176). */
class Column(c: Context, private val maxDp: Int = 480) : LinearLayout(c) {
    init {
        orientation = VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
    }
    override fun onMeasure(w: Int, h: Int) {
        val max = dp(context, maxDp)
        val size = MeasureSpec.getSize(w)
        super.onMeasure(if (size > max) MeasureSpec.makeMeasureSpec(max, MeasureSpec.EXACTLY) else w, h)
    }
}

private fun Context.label(textId: Int, size: Float, weight: Int = 400, colorId: Int = R.color.ink_soft, center: Boolean = true) =
    TextView(this).apply {
        setText(textId)
        Pebble.text(this, size, weight, colorId)
        setLineSpacing(dp(context, 5).toFloat(), 1f)
        if (center) gravity = Gravity.CENTER_HORIZONTAL
    }

private fun LinearLayout.add(v: View, top: Int = 0, width: Int = MATCH_PARENT, height: Int = WRAP_CONTENT) =
    addView(v, LinearLayout.LayoutParams(width, height).apply { topMargin = dp(context, top); gravity = Gravity.CENTER_HORIZONTAL })

fun partner(c: Context, res: Int, sizeDp: Int) = ImageView(c).apply {
    setImageResource(res)
    adjustViewBounds = true
    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    layoutParams = LinearLayout.LayoutParams(dp(c, sizeDp), WRAP_CONTENT)
}

/** First run: scan the QR code from `ducter pair`, or paste its link, or type address and code. */
class ConnectView(c: Context, private val scan: () -> Unit, private val connect: (PairTarget) -> Unit) : ScrollView(c) {
    private val address = EditText(c)
    private val code = EditText(c)
    private val error = TextView(c)
    /** The partner and what to do; then the ways to do it. One column, or the two halves of a book. */
    private val hero = Column(c)
    private val col = Column(c)
    private val pair = LinearLayout(c)
    private val gap = View(c)

    init {
        isFillViewport = true
        setBackgroundColor(Pebble.color(c, R.color.bg))
        val face = partner(c, R.drawable.idle, 132)
        hero.add(face, 36, dp(c, 132))
        Pebble.breathe(face)
        hero.add(TextView(c).apply { setText(R.string.connect_title); Pebble.display(this, 28f); gravity = Gravity.CENTER_HORIZONTAL }, 14)
        hero.add(c.label(R.string.connect_body, 16f), 14)
        hero.setPadding(dp(c, 24), 0, dp(c, 24), 0)
        col.add(Button(c).apply { setText(R.string.connect_scan); Pebble.primary(this); setOnClickListener { scan() } }, 22)
        col.add(c.label(R.string.connect_or, 13f, colorId = R.color.ink_muted), 18)

        col.add(c.label(R.string.connect_address, 13f, 700, R.color.ink_muted, center = false), 18)
        val row = LinearLayout(c).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        address.apply {
            Pebble.field(this)
            setHint(R.string.connect_address_placeholder)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_NEXT
            isSingleLine = true
        }
        row.addView(address, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        val paste = Button(c).apply {
            setText(R.string.connect_paste)
            Pebble.quiet(this)
            setOnClickListener {
                val cm = context.getSystemService(ClipboardManager::class.java)
                cm.primaryClip?.getItemAt(0)?.coerceToText(context)?.toString()?.let { take(it) }
            }
        }
        row.addView(paste, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { marginStart = dp(c, 8) })
        col.add(row, 6)

        col.add(c.label(R.string.connect_code, 13f, 700, R.color.ink_muted, center = false), 14)
        code.apply {
            Pebble.field(this)
            setHint(R.string.connect_code_placeholder)
            typeface = android.graphics.Typeface.MONOSPACE
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            imeOptions = EditorInfo.IME_ACTION_GO
            isSingleLine = true
            setOnEditorActionListener { _, a, _ -> if (a == EditorInfo.IME_ACTION_GO) { submit(); true } else false }
        }
        col.add(code, 6)
        error.apply { Pebble.text(this, 13f, 700, R.color.failed_ink); visibility = GONE }
        col.add(error, 10)
        col.add(Button(c).apply { setText(R.string.connect_go); Pebble.quiet(this); setOnClickListener { submit() } }, 14)
        col.add(c.label(R.string.connect_safe, 13f, colorId = R.color.ink_muted), 16)
        col.setPadding(dp(c, 24), 0, dp(c, 24), dp(c, 24))
        pair.addView(half(hero))
        pair.addView(gap)
        pair.addView(half(col))
        book(null)
        addView(pair, LayoutParams(MATCH_PARENT, WRAP_CONTENT))
    }

    private fun half(v: View) = FrameLayout(context).apply { addView(v, FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT, Gravity.CENTER)) }

    /**
     * D180: held open like a book, the partner on one side of the fold and the form on the other
     * (start, end: the fold in this view's pixels); otherwise one column.
     */
    fun book(fold: Pair<Int, Int>?) {
        val (a, b) = pair.getChildAt(0) to pair.getChildAt(2)
        if (fold == null) {
            pair.orientation = LinearLayout.VERTICAL
            pair.gravity = Gravity.NO_GRAVITY
            a.layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT)
            gap.layoutParams = LinearLayout.LayoutParams(0, 0)
            b.layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dp(context, 8) }
        } else {
            pair.orientation = LinearLayout.HORIZONTAL
            pair.gravity = Gravity.CENTER_VERTICAL
            a.layoutParams = LinearLayout.LayoutParams(fold.first - paddingLeft, WRAP_CONTENT)
            gap.layoutParams = LinearLayout.LayoutParams(fold.second - fold.first, 0)
            b.layoutParams = LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f)
        }
        pair.requestLayout()
    }

    /** A whole link connects at once; a bare address waits for the code. */
    fun take(s: String) {
        val t = PairTarget.parse(s) ?: return fail()
        if (t.code != null) {
            performHapticFeedback(android.view.HapticFeedbackConstants.CONFIRM)
            connect(t)
        } else {
            address.setText(s.trim())
            code.requestFocus()
        }
    }

    private fun submit() {
        val t = PairTarget.parse(address.text.toString(), code.text.toString()) ?: return fail()
        error.visibility = GONE
        connect(t)
    }

    private fun fail() {
        error.setText(R.string.connect_err_address)
        error.visibility = VISIBLE
    }
}

/** Between launch and the page's first paint: the partner, standing by (no white flash). */
fun loadingView(c: Context): View = Column(c).apply {
    gravity = Gravity.CENTER
    setBackgroundColor(Pebble.color(c, R.color.bg))
    val face = partner(c, R.drawable.idle, 120)
    add(face, 0, dp(c, 120))
    Pebble.breathe(face)
    add(c.label(R.string.conn_connecting, 13f, 700, R.color.ink_muted), 18)
}

/** The page couldn't load at all (the home is asleep, or the tunnel is closed). */
fun unreachableView(c: Context, host: String, retry: () -> Unit, other: () -> Unit): View {
    val col = Column(c).apply {
        gravity = Gravity.CENTER
        setPadding(dp(c, 24), dp(c, 24), dp(c, 24), dp(c, 24))
        val face = partner(c, R.drawable.napping, 150)
        add(face, 0, dp(c, 150))
        Pebble.breathe(face)
        add(TextView(c).apply {
            text = c.getString(R.string.connect_err_unreachable, host)
            Pebble.text(this, 16f, colorId = R.color.ink_soft)
            setLineSpacing(dp(c, 5).toFloat(), 1f)
            gravity = Gravity.CENTER_HORIZONTAL
        }, 16)
        add(Button(c).apply { setText(R.string.connect_other); Pebble.quiet(this); setOnClickListener { other() } }, 40)
        add(Button(c).apply { setText(R.string.retry); Pebble.primary(this); setOnClickListener { retry() } }, 12)
    }
    return FrameLayout(c).apply {
        setBackgroundColor(Pebble.color(c, R.color.bg))
        addView(col, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT, Gravity.CENTER))
    }
}

/**
 * An update, offered once (D179): a card at the bottom, never a blocking dialog. Its words are the
 * device card's (有新版本 / 更新 / 在下载… / 在核对…), its what's new the release's own lines in
 * the page's language.
 */
class UpdateCard(c: Context) : FrameLayout(c) {
    private val col = Column(c, 520)
    private val title = TextView(c)
    private val notes = TextView(c)
    private val status = TextView(c)
    private val buttons = LinearLayout(c)
    val later = Button(c)
    val go = Button(c)

    init {
        col.background = Pebble.card(c)
        col.elevation = dp(c, 8).toFloat()
        col.gravity = Gravity.START
        col.setPadding(dp(c, 20), dp(c, 18), dp(c, 20), dp(c, 16))
        Pebble.text(title, 18f, 800)
        Pebble.text(notes, 15f, colorId = R.color.ink_soft)
        notes.setLineSpacing(dp(c, 4).toFloat(), 1f)
        Pebble.text(status, 13f, 700, R.color.ink_muted)
        col.addView(title)
        col.addView(notes, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dp(c, 8) })
        col.addView(status, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dp(c, 8) })
        buttons.orientation = LinearLayout.HORIZONTAL
        buttons.gravity = Gravity.END
        Pebble.quiet(later)
        Pebble.primary(go)
        later.setText(R.string.update_later)
        buttons.addView(later, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        buttons.addView(go, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { marginStart = dp(c, 10) })
        col.addView(buttons, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dp(c, 14) })
        addView(col, LayoutParams(MATCH_PARENT, WRAP_CONTENT, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL))
    }

    fun show(t: String, lines: List<String>, st: String?, goLabel: String?, laterLabel: String?) {
        title.text = t
        notes.text = lines.joinToString("\n") { "· $it" }
        notes.visibility = if (lines.isEmpty()) GONE else VISIBLE
        status.text = st ?: ""
        status.visibility = if (st.isNullOrEmpty()) GONE else VISIBLE
        go.text = goLabel ?: ""
        go.visibility = if (goLabel == null) GONE else VISIBLE
        later.text = laterLabel ?: ""
        later.visibility = if (laterLabel == null) GONE else VISIBLE
        buttons.visibility = if (goLabel == null && laterLabel == null) GONE else VISIBLE
    }
}
