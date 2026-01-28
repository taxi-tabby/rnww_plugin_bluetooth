import Foundation
import WebKit

class HeadlessWebViewManager: NSObject {
    private var webView: WKWebView?

    func initialize() {
        guard webView == nil else { return }

        DispatchQueue.main.async {
            let config = WKWebViewConfiguration()
            config.allowsInlineMediaPlayback = true

            self.webView = WKWebView(frame: .zero, configuration: config)
            self.webView?.navigationDelegate = self
        }
    }

    func loadURL(_ urlString: String) {
        guard let url = URL(string: urlString) else { return }

        DispatchQueue.main.async {
            self.webView?.load(URLRequest(url: url))
        }
    }

    func evaluateJavaScript(_ script: String, completion: ((Any?, Error?) -> Void)? = nil) {
        DispatchQueue.main.async {
            self.webView?.evaluateJavaScript(script, completionHandler: completion)
        }
    }

    func destroy() {
        DispatchQueue.main.async {
            self.webView?.stopLoading()
            self.webView?.navigationDelegate = nil
            self.webView = nil
        }
    }

    var isInitialized: Bool {
        return webView != nil
    }
}

extension HeadlessWebViewManager: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("[HeadlessWebViewManager] Page loaded: \(webView.url?.absoluteString ?? "unknown")")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("[HeadlessWebViewManager] Navigation failed: \(error.localizedDescription)")
    }
}
