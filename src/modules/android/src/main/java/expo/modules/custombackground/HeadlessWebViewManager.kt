package expo.modules.custombackground

import android.annotation.SuppressLint
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class HeadlessWebViewManager(private val context: Context) {
    private var webView: WebView? = null
    private val handler = Handler(Looper.getMainLooper())

    companion object {
        private const val TAG = "HeadlessWebViewManager"
    }

    @SuppressLint("SetJavaScriptEnabled")
    fun initialize() {
        handler.post {
            if (webView != null) {
                Log.d(TAG, "WebView already initialized")
                return@post
            }

            Log.d(TAG, "Initializing Headless WebView")

            webView = WebView(context).apply {
                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    databaseEnabled = true
                    cacheMode = WebSettings.LOAD_DEFAULT
                    allowFileAccess = false
                    allowContentAccess = false
                }

                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        Log.d(TAG, "WebView page loaded: $url")
                    }
                }
            }

            Log.d(TAG, "Headless WebView initialized")
        }
    }

    fun loadUrl(url: String) {
        handler.post {
            webView?.loadUrl(url)
        }
    }

    fun evaluateJavaScript(script: String, callback: ((String?) -> Unit)? = null) {
        handler.post {
            webView?.evaluateJavascript(script) { result ->
                callback?.invoke(result)
            }
        }
    }

    fun destroy() {
        handler.post {
            webView?.let { view ->
                Log.d(TAG, "Destroying Headless WebView")
                view.stopLoading()
                view.clearHistory()
                view.clearCache(true)
                view.destroy()
            }
            webView = null
        }
    }

    fun isInitialized(): Boolean = webView != null
}
