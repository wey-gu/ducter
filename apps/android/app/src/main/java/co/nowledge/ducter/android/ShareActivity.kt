package co.nowledge.ducter.android

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Outline
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputType
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.ViewOutlineProvider
import android.view.WindowInsets
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.IntentCompat
import co.nowledge.ducter.android.Pebble.dp
import kotlin.math.cos
import kotlin.math.sin

/**
 * D537: 分享到 Ducter / Share to Ducter. Android's share sheet hands over a link, words, pictures
 * or files; this sheet rises over the app they came from (dimmed, still in view): who it goes to,
 * what is going, a note (附言) and Send. Nothing leaves the phone before Send. Then it goes, or
 * waits in the outbox with one quiet line, and the sheet lets go.
 */
class ShareActivity : Activity() {
    private lateinit var sender: ShareSender
    private lateinit var store: Store
    private lateinit var plan: SharePlan
    private val main = Handler(Looper.getMainLooper())
    private var partners: List<SharePartner> = emptyList()
    private var chosen = "default"
    private var from: String? = null

    private val sheet by lazy { LinearLayout(this) }
    private val title by lazy { TextView(this) }
    private val face by lazy { ImageView(this) }
    private val note by lazy { EditText(this) }
    private val pickRow by lazy { LinearLayout(this) }
    private val pick by lazy { LinearLayout(this) }
    private val line by lazy { TextView(this) }
    private val send by lazy { Button(this) }
    private val cancel by lazy { Button(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sender = ShareSender(this)
        store = Store(this)
        plan = planOf(intent)
        from = sourceApp()
        partners = sender.partners(null)
        chosen = store.lastSharePartner?.takeIf { id -> partners.any { it.id == id } } ?: partners.first().id
        build()
        // The partners as the home says them now, and anything still waiting in the outbox.
        if (sender.paired) Thread {
            val base = sender.home()
            val me = base?.let { sender.me(it) }
            if (me != null) main.post { setPartners(sender.partners(me)) }
            if (base != null) try { sender.drain() } catch (_: Exception) {}
        }.start()
    }

    // MARK: what came in

    private fun planOf(i: Intent): SharePlan {
        val streams = mutableListOf<Uri>()
        if (i.action == Intent.ACTION_SEND_MULTIPLE) IntentCompat.getParcelableArrayListExtra(i, Intent.EXTRA_STREAM, Uri::class.java)?.let { streams += it }
        else IntentCompat.getParcelableExtra(i, Intent.EXTRA_STREAM, Uri::class.java)?.let { streams += it }
        i.clipData?.let { c -> for (k in 0 until c.itemCount) c.getItemAt(k).uri?.let { if (it !in streams) streams += it } }
        val cr = contentResolver
        val items = streams.filter { it.scheme == "content" || it.scheme == "file" }.map { u ->
            Incoming(u.toString(), cr.getType(u) ?: i.type?.takeIf { !it.contains('*') }, sender.nameOf(cr, u), sender.sizeOf(cr, u))
        }
        val text = i.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
        return Share.plan(text, i.getStringExtra(Intent.EXTRA_SUBJECT), items)
    }

    /** The app it was shared from, by its name, when Android says (never Ducter itself). */
    private fun sourceApp(): String? = try {
        val pkg = referrer?.takeIf { it.scheme == "android-app" }?.host
        if (pkg == null || pkg == packageName || pkg == "android" || pkg.startsWith("com.android.intentresolver")) null
        else packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString().takeIf { it.isNotBlank() }
    } catch (_: Exception) {
        null
    }

    // MARK: the sheet

    private fun build() {
        val c = this
        val root = FrameLayout(c)
        root.setBackgroundColor(Pebble.color(c, R.color.scrim))
        root.setOnClickListener { finishQuiet() }
        window.setDecorFitsSystemWindowsCompat()

        sheet.orientation = LinearLayout.VERTICAL
        sheet.isClickable = true // a tap on the sheet never reaches the dim behind it
        sheet.background = GradientDrawable().apply {
            val r = dp(c, 24).toFloat()
            cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f)
            setColor(Pebble.color(c, R.color.bg))
        }
        sheet.elevation = dp(c, 12).toFloat()
        val pad = dp(c, 20)
        sheet.setPadding(pad, dp(c, 10), pad, pad)

        // The grabber: where a sheet is held.
        sheet.addView(View(c).apply {
            background = GradientDrawable().apply { cornerRadius = dp(c, 2).toFloat(); setColor(Pebble.color(c, R.color.line)) }
        }, LinearLayout.LayoutParams(dp(c, 36), dp(c, 4)).apply { gravity = Gravity.CENTER_HORIZONTAL; bottomMargin = dp(c, 14) })

        // Who it goes to: the partner, in its own clay, and its name.
        val head = LinearLayout(c).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        face.setImageResource(R.drawable.idle)
        face.adjustViewBounds = true
        face.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        head.addView(face, LinearLayout.LayoutParams(dp(c, 44), dp(c, 44)))
        Pebble.display(title, 20f)
        title.maxLines = 1
        title.ellipsize = TextUtils.TruncateAt.END
        head.addView(title, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { marginStart = dp(c, 10) })
        sheet.addView(head)

        val body = LinearLayout(c).apply { orientation = LinearLayout.VERTICAL }
        val scroll = ScrollView(c).apply { isFillViewport = false; addView(body) }
        sheet.addView(scroll, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f).apply { topMargin = dp(c, 14) })

        if (plan.empty) {
            body.addView(muted(getString(R.string.share_nothing)))
        } else {
            preview(body)
        }
        if (plan.overCount) body.addView(muted(getString(R.string.share_over)), lp(8))
        if (plan.tooBig.isNotEmpty()) body.addView(muted(getString(R.string.share_too_big)), lp(8))

        note.apply {
            Pebble.field(this)
            gravity = Gravity.TOP or Gravity.START
            minimumHeight = dp(c, 88)
            minLines = 3
            maxLines = 6
            setPadding(dp(c, 14), dp(c, 13), dp(c, 14), dp(c, 13))
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            isSingleLine = false
        }
        body.addView(note, lp(16))

        // To whom, when there is more than one partner (D513): after the note, as on the iPhone.
        pickRow.orientation = LinearLayout.VERTICAL
        pickRow.addView(TextView(c).apply { setText(R.string.share_to); Pebble.text(this, 13f, 700, R.color.ink_muted) })
        pick.orientation = LinearLayout.HORIZONTAL
        pickRow.addView(HorizontalScrollView(c).apply { isHorizontalScrollBarEnabled = false; addView(pick) }, lp(6))
        body.addView(pickRow, lp(16))
        line.apply { Pebble.text(this, 13f, 400, R.color.ink_muted); visibility = View.GONE; setLineSpacing(dp(c, 3).toFloat(), 1f) }
        body.addView(line, lp(10))

        val row = LinearLayout(c).apply { orientation = LinearLayout.HORIZONTAL }
        cancel.apply { setText(R.string.share_cancel); Pebble.quiet(this); setOnClickListener { finishQuiet() } }
        send.apply { Pebble.primary(this); setOnClickListener { go() } }
        // The primary first, on the left (ui.md "Buttons", D533); Cancel after it.
        row.addView(send, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1.6f))
        row.addView(cancel, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { marginStart = dp(c, 10) })
        sheet.addView(row, lp(16))

        // A phone's width on a foldable or a tablet (D176): at most 600 wide, at the foot.
        val holder = Column(c, 600)
        holder.addView(sheet, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        root.addView(holder, FrameLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL))
        root.setOnApplyWindowInsetsListener { v, ins ->
            val (top, bottom) = if (Build.VERSION.SDK_INT >= 30) ins.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime()).let { it.top to it.bottom }
            else @Suppress("DEPRECATION") (ins.systemWindowInsetTop to ins.systemWindowInsetBottom)
            v.setPadding(0, top + dp(c, 24), 0, 0)
            sheet.setPadding(pad, dp(c, 10), pad, pad + bottom)
            ins
        }
        setContentView(root)
        setPartners(partners)

        if (!sender.paired) {
            note.visibility = View.GONE
            pickRow.visibility = View.GONE
            say(getString(R.string.share_unpaired))
            send.setText(R.string.share_open_app)
            send.setOnClickListener {
                startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                finishQuiet()
            }
        } else if (plan.empty) {
            note.visibility = View.GONE
            pickRow.visibility = View.GONE
            send.isEnabled = false
            send.alpha = 0.5f
        }

        // The note is where the person starts, with the keyboard up (as the iPhone's sheet).
        if (note.visibility == View.VISIBLE) note.postDelayed({
            note.requestFocus()
            getSystemService(android.view.inputmethod.InputMethodManager::class.java)?.showSoftInput(note, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT)
        }, 250)

        // The sheet rises from the foot and the dim comes in (Pebble's enter; at once when animations are off).
        val off = Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        if (!off) {
            root.alpha = 0f
            root.animate().alpha(1f).setDuration(180).start()
            sheet.translationY = dp(c, 120).toFloat()
            sheet.animate().translationY(0f).setDuration(320).setInterpolator(android.view.animation.DecelerateInterpolator(2f)).start()
        }
    }

    private fun lp(top: Int) = LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT).apply { topMargin = dp(this@ShareActivity, top) }

    private fun muted(s: String) = TextView(this).apply { text = s; Pebble.text(this, 13f, 400, R.color.ink_muted); setLineSpacing(dp(context, 3).toFloat(), 1f) }

    private fun card(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = GradientDrawable().apply { cornerRadius = dp(context, 18).toFloat(); setColor(Pebble.color(context, R.color.surface)); setStroke(dp(context, 1), Pebble.color(context, R.color.line)) }
        setPadding(dp(context, 14), dp(context, 12), dp(context, 14), dp(context, 12))
    }

    /** What is going: a link under its title, the words, the pictures in a row, each file on its card. */
    private fun preview(body: LinearLayout) {
        val c = this
        val url = plan.url
        if (url != null) {
            body.addView(card().apply {
                addView(TextView(c).apply { text = plan.title ?: Share.host(url); Pebble.text(this, 16f, 700); maxLines = 2; ellipsize = TextUtils.TruncateAt.END })
                addView(TextView(c).apply { text = Share.host(url); Pebble.text(this, 13f, 400, R.color.ink_muted); maxLines = 1; ellipsize = TextUtils.TruncateAt.END }, lp(4))
                contentDescription = "${plan.title ?: ""} ${Share.host(url)}"
            }, lp(0))
        }
        val words = plan.text?.let { t -> url?.let { t.replace(it, " ").trim() } ?: t }?.takeIf { it.isNotBlank() && it != plan.title }
        if (words != null) {
            body.addView(card().apply {
                addView(TextView(c).apply { text = words; Pebble.text(this, 15f, 400, R.color.ink_soft); maxLines = 4; ellipsize = TextUtils.TruncateAt.END; setLineSpacing(dp(c, 4).toFloat(), 1f) })
            }, lp(if (url != null) 8 else 0))
        }
        val pics = plan.items.filter { it.picture }
        if (pics.isNotEmpty()) {
            val strip = LinearLayout(c).apply { orientation = LinearLayout.HORIZONTAL }
            val size = if (pics.size == 1) dp(c, 140) else dp(c, 76)
            for ((k, p) in pics.withIndex()) {
                val v = ImageView(c).apply {
                    scaleType = ImageView.ScaleType.CENTER_CROP
                    setBackgroundColor(Pebble.color(c, R.color.sunken))
                    clipToOutline = true
                    outlineProvider = object : ViewOutlineProvider() {
                        override fun getOutline(view: View, o: Outline) = o.setRoundRect(0, 0, view.width, view.height, dp(c, 12).toFloat())
                    }
                    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                }
                strip.addView(v, LinearLayout.LayoutParams(size, size).apply { if (k > 0) marginStart = dp(c, 6) })
                Thread { thumb(Uri.parse(p.uri), size)?.let { b -> main.post { v.setImageBitmap(b) } } }.start()
            }
            strip.contentDescription = if (pics.size == 1) getString(R.string.share_picture) else getString(R.string.share_pictures, pics.size)
            body.addView(HorizontalScrollView(c).apply { isHorizontalScrollBarEnabled = false; addView(strip) }, lp(if (url != null || words != null) 10 else 0))
        }
        for (f in plan.items.filter { !it.picture }) body.addView(fileCard(f), lp(8))
    }

    /** A file: its drawn badge (a small page that says its extension), its name and size. */
    private fun fileCard(f: Incoming): View {
        val c = this
        val row = LinearLayout(c).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = GradientDrawable().apply { cornerRadius = dp(c, 18).toFloat(); setColor(Pebble.color(c, R.color.surface)); setStroke(dp(c, 1), Pebble.color(c, R.color.line)) }
            setPadding(dp(c, 12), dp(c, 10), dp(c, 14), dp(c, 10))
            minimumHeight = dp(c, 64)
        }
        // D286's badge: a little page whose band, in its family's colour, says the extension.
        val ext = Share.badge(f.name)
        val night = (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES
        val badge = FrameLayout(c).apply {
            background = GradientDrawable().apply { cornerRadius = dp(c, 5).toFloat(); setColor(Pebble.color(c, R.color.sunken)); setStroke(dp(c, 1), Pebble.color(c, R.color.line)) }
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            addView(TextView(c).apply {
                text = ext.take(4)
                Pebble.text(this, 9f, 800, R.color.surface)
                setTextColor(if (night) 0xFF1A130D.toInt() else 0xFFFFFFFF.toInt())
                gravity = Gravity.CENTER
                val r = dp(c, 5).toFloat()
                background = GradientDrawable().apply { cornerRadii = floatArrayOf(0f, 0f, 0f, 0f, r, r, r, r); setColor(Share.familyColor(ext, night)) }
            }, FrameLayout.LayoutParams(MATCH_PARENT, dp(c, 16), Gravity.BOTTOM))
        }
        row.addView(badge, LinearLayout.LayoutParams(dp(c, 36), dp(c, 44)))
        val words = LinearLayout(c).apply { orientation = LinearLayout.VERTICAL }
        words.addView(TextView(c).apply { text = f.name ?: ext; Pebble.text(this, 15f, 700); maxLines = 2; ellipsize = TextUtils.TruncateAt.MIDDLE })
        // Its size and, for a PDF, its pages: each fact its own element (D291).
        val facts = LinearLayout(c).apply { orientation = LinearLayout.HORIZONTAL }
        f.size?.let { facts.addView(TextView(c).apply { text = Share.size(it); Pebble.text(this, 13f, 400, R.color.ink_muted) }) }
        words.addView(facts, lp(2))
        if (ext == "PDF") Thread {
            val n = pages(Uri.parse(f.uri))
            if (n > 0) main.post { facts.addView(TextView(c).apply { text = resources.getQuantityString(R.plurals.share_pages, n, n); Pebble.text(this, 13f, 400, R.color.ink_muted) }, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { marginStart = dp(c, 10) }) }
        }.start()
        row.addView(words, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f).apply { marginStart = dp(c, 12) })
        return row
    }

    /** A PDF's page count, read on the phone (Android's own PdfRenderer); 0 when it can't be read. */
    private fun pages(uri: Uri): Int = try {
        contentResolver.openFileDescriptor(uri, "r")?.use { fd -> android.graphics.pdf.PdfRenderer(fd).use { it.pageCount } } ?: 0
    } catch (_: Exception) {
        0
    }

    private fun thumb(uri: Uri, px: Int): Bitmap? = try {
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, o) }
        var s = 1
        while (minOf(o.outWidth, o.outHeight) / (s * 2) >= px) s *= 2
        contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = s }) }
    } catch (_: Exception) {
        null
    }

    // MARK: the partners

    private fun setPartners(list: List<SharePartner>) {
        partners = list
        if (partners.none { it.id == chosen }) chosen = partners.first().id
        pick.removeAllViews()
        pickRow.visibility = if (partners.size > 1 && sender.paired && !plan.empty) View.VISIBLE else View.GONE
        for ((k, p) in partners.withIndex()) {
            val on = p.id == chosen
            // A clay chip, never a pill (D69, D73): the partner in its own clay, its name; the chosen one
            // in the accent on its ledge.
            val chip = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                minimumHeight = dp(context, 44)
                setPadding(dp(context, 8), 0, dp(context, 14), 0)
                val fill = GradientDrawable().apply {
                    cornerRadius = dp(context, Pebble.RADIUS_SMALL).toFloat()
                    setColor(Pebble.color(context, if (on) R.color.accent else R.color.surface))
                    if (!on) setStroke(dp(context, 1), Pebble.color(context, R.color.line))
                }
                val ledge = GradientDrawable().apply {
                    cornerRadius = dp(context, Pebble.RADIUS_SMALL).toFloat()
                    setColor(Pebble.color(context, if (on) R.color.press_accent else R.color.press_quiet))
                }
                background = android.graphics.drawable.LayerDrawable(arrayOf(ledge, fill)).apply {
                    setLayerInset(0, 0, dp(context, 3), 0, 0)
                    setLayerInset(1, 0, 0, 0, dp(context, 3))
                }
                addView(ImageView(context).apply {
                    setImageResource(R.drawable.idle)
                    adjustViewBounds = true
                    colorFilter = clay(p.look)
                    importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
                }, LinearLayout.LayoutParams(dp(context, 24), dp(context, 24)))
                addView(TextView(context).apply {
                    text = p.name
                    Pebble.text(this, 15f, if (on) 700 else 500, if (on) R.color.on_accent else R.color.ink)
                    maxLines = 1
                }, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { marginStart = dp(context, 6); bottomMargin = dp(context, 3) })
                isSelected = on
                isClickable = true
                contentDescription = p.name
                setOnClickListener { chosen = p.id; setPartners(partners) }
            }
            pick.addView(chip, LinearLayout.LayoutParams(WRAP_CONTENT, dp(this, 47)).apply { if (k > 0) marginStart = dp(this@ShareActivity, 8) })
        }
        val who = partners.first { it.id == chosen }
        title.text = getString(R.string.share_title, who.name)
        note.hint = getString(R.string.share_note_hint, who.name)
        if (sender.paired) send.setText(R.string.share_send)
        face.colorFilter = clay(who.look)
    }

    /** D497: a partner's look as its clay recoloured: CSS's hue-rotate() then saturate() (LOOK_CLAY). */
    private fun clay(look: String): ColorMatrixColorFilter? {
        val (deg, sat) = when (look) {
            "sage" -> 95.0 to 0.62f
            "sky" -> 175.0 to 0.85f
            "plum" -> 255.0 to 0.7f
            "apricot" -> -28.0 to 1f
            else -> return null
        }
        val a = Math.toRadians(deg)
        val cs = cos(a).toFloat()
        val sn = sin(a).toFloat()
        val hue = ColorMatrix(floatArrayOf(
            0.213f + cs * 0.787f - sn * 0.213f, 0.715f - cs * 0.715f - sn * 0.715f, 0.072f - cs * 0.072f + sn * 0.928f, 0f, 0f,
            0.213f - cs * 0.213f + sn * 0.143f, 0.715f + cs * 0.285f + sn * 0.140f, 0.072f - cs * 0.072f - sn * 0.283f, 0f, 0f,
            0.213f - cs * 0.213f - sn * 0.787f, 0.715f - cs * 0.715f + sn * 0.715f, 0.072f + cs * 0.928f + sn * 0.072f, 0f, 0f,
            0f, 0f, 0f, 1f, 0f,
        ))
        hue.postConcat(ColorMatrix().apply { setSaturation(sat) })
        return ColorMatrixColorFilter(hue)
    }

    // MARK: Send

    private fun say(s: String) {
        line.text = s
        line.visibility = View.VISIBLE
    }

    private fun go() {
        if (plan.empty || !send.isEnabled) return
        send.isEnabled = false
        cancel.isEnabled = false
        note.isEnabled = false
        send.setText(R.string.share_sending)
        val who = partners.first { it.id == chosen }
        val entry = OutEntry(
            clientId = Share.clientId(), at = System.currentTimeMillis(), note = note.text.toString().trim(),
            partner = who.id.takeIf { it != "default" || partners.size > 1 }, url = plan.url, title = plan.title, text = plan.text, from = from,
        )
        Thread {
            val kept = sender.keep(entry, plan.items)
            val out = try { sender.drain(kept.clientId) } catch (_: Exception) { Outcome.Offline }
            main.post { done(out ?: Outcome.Offline, who) }
        }.start()
    }

    private fun done(out: Outcome, who: SharePartner) {
        store.lastSharePartner = who.id
        when (out) {
            Outcome.Sent -> { send.text = getString(R.string.share_sent, who.name); send.performHapticFeedback(android.view.HapticFeedbackConstants.CONFIRM); main.postDelayed({ finishQuiet() }, 900) }
            Outcome.TooOld -> { say(getString(R.string.share_too_old)); send.setText(R.string.share_send); main.postDelayed({ finishQuiet() }, 2600) }
            Outcome.Refused -> { say(getString(R.string.share_refused)); send.setText(R.string.share_send); cancel.isEnabled = true }
            else -> { say(getString(R.string.share_queued)); send.setText(R.string.share_send); main.postDelayed({ finishQuiet() }, 2400) }
        }
    }

    private fun finishQuiet() {
        if (isFinishing) return
        finish()
        if (Build.VERSION.SDK_INT >= 34) overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, 0, android.R.anim.fade_out)
        else @Suppress("DEPRECATION") overridePendingTransition(0, android.R.anim.fade_out)
    }

    private fun android.view.Window.setDecorFitsSystemWindowsCompat() {
        if (Build.VERSION.SDK_INT >= 30) setDecorFitsSystemWindows(false)
    }
}
