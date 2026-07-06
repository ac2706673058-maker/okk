package com.lextv.app

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale

class MainActivity : Activity(), TextToSpeech.OnInitListener {

    private lateinit var web: WebView
    private var tts: TextToSpeech? = null
    private var ttsReady = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        web = WebView(this)
        web.settings.javaScriptEnabled = true
        web.settings.allowFileAccess = true
        web.settings.domStorageEnabled = true
        web.settings.mediaPlaybackRequiresUserGesture = false
        web.setBackgroundColor(0xFF0D111E.toInt())
        web.addJavascriptInterface(Bridge(), "Bridge")
        web.isFocusable = false
        web.isFocusableInTouchMode = false
        setContentView(web)
        hideSystemUi()
        tts = TextToSpeech(this, this)
        web.loadUrl("file:///android_asset/www/index.html")
    }

    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val r = tts?.setLanguage(Locale.US)
            ttsReady = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED
        }
        runOnUiThread { web.evaluateJavascript("window.onTtsReady && window.onTtsReady($ttsReady)", null) }
    }

    private fun sendKey(name: String): Boolean {
        runOnUiThread { web.evaluateJavascript("window.onTvKey && window.onTvKey('$name')", null) }
        return true
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_DPAD_UP -> sendKey("UP")
            KeyEvent.KEYCODE_DPAD_DOWN -> sendKey("DOWN")
            KeyEvent.KEYCODE_DPAD_LEFT -> sendKey("LEFT")
            KeyEvent.KEYCODE_DPAD_RIGHT -> sendKey("RIGHT")
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> sendKey("OK")
            KeyEvent.KEYCODE_BACK -> sendKey("BACK")
            KeyEvent.KEYCODE_MENU -> sendKey("MENU")
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY -> sendKey("PLAY")
            else -> super.onKeyDown(keyCode, event)
        }
    }

    override fun onDestroy() {
        tts?.shutdown()
        super.onDestroy()
    }

    inner class Bridge {

        @JavascriptInterface
        fun speak(text: String, rate: Float) {
            if (!ttsReady) return
            tts?.setSpeechRate(rate)
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "lex")
        }

        @JavascriptInterface
        fun stopSpeak() { tts?.stop() }

        @JavascriptInterface
        fun isTtsReady(): Boolean = ttsReady

        @JavascriptInterface
        fun save(key: String, json: String) {
            try { File(filesDir, "$key.json").writeText(json) } catch (_: Exception) {}
        }

        @JavascriptInterface
        fun load(key: String): String {
            return try {
                val f = File(filesDir, "$key.json")
                if (f.exists()) f.readText() else ""
            } catch (_: Exception) { "" }
        }

        // 词库清单:内置assets/decks + 外部扩展目录(未来新增词书的口子)
        // 外部目录: /sdcard/Android/data/com.lextv.app/files/decks/*.json
        @JavascriptInterface
        fun getDecks(): String {
            val out = JSONArray()
            try {
                val mf = assets.open("decks/manifest.json").bufferedReader().readText()
                val arr = JSONObject(mf).getJSONArray("decks")
                for (i in 0 until arr.length()) {
                    val d = arr.getJSONObject(i)
                    d.put("source", "asset")
                    out.put(d)
                }
            } catch (_: Exception) {}
            try {
                val ext = File(getExternalFilesDir(null), "decks")
                if (ext.exists()) {
                    ext.listFiles { f -> f.name.endsWith(".json") }?.sortedBy { it.name }?.forEach { f ->
                        val d = JSONObject()
                        d.put("id", "ext_" + f.nameWithoutExtension)
                        d.put("name", f.nameWithoutExtension)
                        d.put("icon", "\uD83D\uDCD8")
                        d.put("files", JSONArray().put(f.name))
                        d.put("source", "ext")
                        out.put(d)
                    }
                }
            } catch (_: Exception) {}
            return out.toString()
        }

        @JavascriptInterface
        fun readDeckFile(source: String, name: String): String {
            return try {
                if (source == "ext") File(File(getExternalFilesDir(null), "decks"), name).readText()
                else assets.open("decks/$name").bufferedReader().readText()
            } catch (_: Exception) { "[]" }
        }

        @JavascriptInterface
        fun exitApp() { runOnUiThread { finish() } }
    }
}
