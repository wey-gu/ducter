package co.nowledge.ducter.android

import android.speech.SpeechRecognizer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// D305: the voice bridge's pure parts (design/voice.md, "The app bridge").
class VoiceTest {
    @Test fun levelFromRms() {
        assertEquals(0.0, VoiceLogic.level(-2f), 0.0)
        assertEquals(0.0, VoiceLogic.level(-10f), 0.0)
        assertEquals(0.5, VoiceLogic.level(4f), 0.0)
        assertEquals(1.0, VoiceLogic.level(10f), 0.0)
        assertEquals(1.0, VoiceLogic.level(30f), 0.0)
    }

    @Test fun errorsInTheBridgesWords() {
        assertNull(VoiceLogic.why(SpeechRecognizer.ERROR_NO_MATCH))
        assertNull(VoiceLogic.why(SpeechRecognizer.ERROR_SPEECH_TIMEOUT))
        assertEquals("mic", VoiceLogic.why(SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS))
        assertEquals("network", VoiceLogic.why(SpeechRecognizer.ERROR_NETWORK))
        assertEquals("network", VoiceLogic.why(SpeechRecognizer.ERROR_NETWORK_TIMEOUT))
        assertEquals("network", VoiceLogic.why(SpeechRecognizer.ERROR_SERVER))
        assertEquals("network", VoiceLogic.why(11))
        assertEquals("lang", VoiceLogic.why(12))
        assertEquals("lang", VoiceLogic.why(13))
        assertEquals("busy", VoiceLogic.why(SpeechRecognizer.ERROR_RECOGNIZER_BUSY))
        assertEquals("busy", VoiceLogic.why(10))
        assertEquals("nomic", VoiceLogic.why(SpeechRecognizer.ERROR_AUDIO))
        assertEquals("error", VoiceLogic.why(SpeechRecognizer.ERROR_CLIENT))
        assertEquals("error", VoiceLogic.why(99))
    }

    @Test fun whereTheWordsAreMade() {
        val google = "com.google.android.googlequicksearchbox/com.google.android.voicesearch.serviceapi.GoogleRecognitionService"
        assertEquals("device", VoiceLogic.whereOf(true, google))
        assertEquals("google", VoiceLogic.whereOf(false, google))
        assertEquals("google", VoiceLogic.whereOf(false, "com.google.android.tts/x"))
        assertEquals("service", VoiceLogic.whereOf(false, "com.iflytek.speechsuite/.RecognitionService"))
        assertEquals("service", VoiceLogic.whereOf(false, null))
        assertEquals("service", VoiceLogic.whereOf(false, ""))
    }

    @Test fun tags() {
        assertEquals("zh-CN", VoiceLogic.tag("zh-CN"))
        assertEquals("en-US", VoiceLogic.tag("en_US"))
        assertEquals("en-US", VoiceLogic.tag(""))
        assertEquals("en-US", VoiceLogic.tag(null))
    }
}
