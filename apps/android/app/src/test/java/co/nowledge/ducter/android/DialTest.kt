package co.nowledge.ducter.android

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** D278: 你来打 / You call. Only a full number is dialled; the sheet reads the same in the shade. */
class DialTest {
    @Test fun onlyAFullNumber() {
        assertTrue(Dial.telOk("+862161234567"))
        assertTrue(Dial.telOk("+14155550123"))
        assertFalse(Dial.telOk("110"))
        assertFalse(Dial.telOk("+110"))
        assertFalse(Dial.telOk("13800000000"))
        assertFalse(Dial.telOk("+86 21 6123 4567"))
        assertFalse(Dial.telOk("+8613800000000;rm"))
        assertFalse(Dial.telOk("*21*+8613800000000#")) // call forwarding codes never
    }

    private fun msg(to: String) = JSONObject().put("callId", "call_1").put("to", to).put("name", "浦东 4S 店").put(
        "sheet",
        JSONObject().put("goal", "问小保养要多久").put("open", "你好，我想问一下小保养要多久。").put("ask", JSONArray(listOf("要预约吗？", " "))).put("dont", JSONArray(listOf("车架号"))).put("note", JSONArray()),
    )

    @Test fun theSheet() {
        assertNull(Dial.Sheet.from(msg("110")))
        val s = Dial.Sheet.from(msg("+862161234567"))!!
        assertEquals(listOf("要预约吗？"), s.ask) // blanks dropped
        val zh = Dial.text(s, Dial.Labels("开场白", "要问的", "不要透露", "需要记下", false))
        assertEquals("开场白：你好，我想问一下小保养要多久。\n\n要问的：\n· 要预约吗？\n\n不要透露：\n· 车架号", zh)
        val en = Dial.text(s, Dial.Labels("Open with", "Ask", "Don't share", "Note down", true))
        assertTrue(en.startsWith("Open with: 你好"))
        assertTrue(en.contains("Ask:\n· 要预约吗？"))
    }
}
