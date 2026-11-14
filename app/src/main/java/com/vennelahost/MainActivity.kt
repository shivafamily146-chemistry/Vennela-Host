package com.vennelahost

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var address: EditText
    private lateinit var shell: LinearLayout
    private val prefs by lazy { getSharedPreferences("vennela", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showConnectScreen()
    }

    private fun showConnectScreen() {
        shell = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(28, 48, 28, 24)
            setBackgroundColor(0xFF101827.toInt())
        }
        val title = TextView(this).apply {
            text = "Vennela Host"
            textSize = 28f
            setTextColor(0xFFFFFFFF.toInt())
        }
        val hint = TextView(this).apply {
            text = "Connect to your running Vennela Host panel. Use your HTTPS domain for cloud hosting, or localhost for Termux on this phone."
            textSize = 14f
            setTextColor(0xFFB8C5D6.toInt())
            setPadding(0, 12, 0, 20)
        }
        address = EditText(this).apply {
            hint = "https://your-panel.example.com"
            setSingleLine(true)
            setTextColor(0xFFFFFFFF.toInt())
            setHintTextColor(0xFF8898AC.toInt())
            setText(prefs.getString("url", "") ?: "")
        }
        val connect = Button(this).apply {
            text = "Connect"
            setOnClickListener { connectToPanel(address.text.toString().trim()) }
        }
        shell.addView(title)
        shell.addView(hint)
        shell.addView(address, LinearLayout.LayoutParams(-1, -2))
        shell.addView(connect, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 18 })
        setContentView(shell)
    }

    private fun connectToPanel(raw: String) {
        val url = raw.trim().trimEnd('/')
        val local = url.startsWith("http://localhost:") ||
            url.startsWith("http://127.0.0.1:") ||
            url.startsWith("http://10.0.2.2:")
        if (!(url.startsWith("https://") || local)) {
            Toast.makeText(this, "Use HTTPS for cloud panels. HTTP is allowed only for localhost.", Toast.LENGTH_LONG).show()
            return
        }
        prefs.edit().putString("url", url).apply()
        showPanel(url)
    }

    private fun showPanel(url: String) {
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()
            loadUrl(url)
        }
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF101827.toInt())
        }
        val bar = LinearLayout(this).apply {
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            setPadding(8, 4, 8, 4)
        }
        val change = Button(this).apply {
            text = "Change panel"
            setOnClickListener { web.stopLoading(); showConnectScreen() }
        }
        bar.addView(change)
        layout.addView(bar, LinearLayout.LayoutParams(-1, -2))
        layout.addView(web, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(layout)
    }

    @Deprecated("Deprecated in Android API")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }
}
