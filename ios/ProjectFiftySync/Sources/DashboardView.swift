import SwiftUI
import WebKit

/// The dashboard itself, shown full-screen inside the app.
///
/// This loads the live GitHub Pages dashboard rather than a bundled copy, for
/// two reasons. First, it stays identical to the web version with no second
/// codebase: every data.json / training-log.json update and every dashboard
/// change shows up here on the next load. Second, the backend's read routes
/// only answer CORS requests from `functionalcorefitness.github.io` (see
/// `backend/src/routes/latest.js`), so the HealthKit overlay only works when
/// the page is served from that origin.
struct DashboardView: View {
    static let url = URL(string: "https://functionalcorefitness.github.io/Project-50/")!

    var body: some View {
        DashboardWebView(url: Self.url)
            .background(Color(red: 0x14 / 255, green: 0x1a / 255, blue: 0x22 / 255))
            .ignoresSafeArea(edges: .bottom)
    }
}

extension Notification.Name {
    /// Posted after a sync uploads new days, so the dashboard reloads and the
    /// freshly synced HealthKit values show without a manual refresh.
    static let dashboardShouldReload = Notification.Name("dashboardShouldReload")
}

private struct DashboardWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // Default (persistent) data store, so the dashboard's localStorage
        // survives app restarts the same way it does in Safari.
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        // Match the dashboard's own background so there is no white flash
        // before the first paint.
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0x14 / 255, green: 0x1a / 255, blue: 0x22 / 255, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif

        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.pullToRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        context.coordinator.webView = webView
        context.coordinator.load()
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let url: URL
        weak var webView: WKWebView?
        private var lastLoadedAt: Date?

        /// How stale the page may get before returning to the app reloads it.
        private let staleAfter: TimeInterval = 10 * 60

        init(url: URL) {
            self.url = url
            super.init()
            // Selector-based observers are removed automatically when the
            // coordinator goes away, so there is no deinit bookkeeping.
            let center = NotificationCenter.default
            center.addObserver(self, selector: #selector(willEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
            center.addObserver(self, selector: #selector(reloadRequested), name: .dashboardShouldReload, object: nil)
        }

        @objc private func willEnterForeground() {
            guard let last = lastLoadedAt, Date().timeIntervalSince(last) > staleAfter else { return }
            load()
        }

        // Sync posts this from whatever thread it finished on.
        @objc nonisolated private func reloadRequested() {
            Task { @MainActor in self.load() }
        }

        func load() {
            // Bypass the HTTP cache so a pushed dashboard update is never
            // hidden behind a stale copy.
            webView?.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        }

        @objc func pullToRefresh(_ sender: UIRefreshControl) {
            load()
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            lastLoadedAt = Date()
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            showError(error, in: webView)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            showError(error, in: webView)
        }

        /// Pages on the dashboard's own site (update.html, workout.html, the
        /// PDFs) stay in the app; anything else (YouTube, race sign-ups,
        /// trail links) opens in Safari or its own app.
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let target = action.request.url else { return .allow }
            let scheme = target.scheme ?? ""
            let isWeb = scheme == "http" || scheme == "https"
            let isInternal = ["about", "data", "blob"].contains(scheme)
            let isExternalApp = !isWeb && !isInternal // mailto:, tel:, sms:, maps
            if isExternalApp || (isWeb && target.host != url.host && action.navigationType == .linkActivated) {
                _ = await UIApplication.shared.open(target)
                return .cancel
            }
            return .allow
        }

        /// `target="_blank"` links and `window.open` arrive here instead of
        /// as a navigation; route them the same way.
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let target = action.request.url {
                if target.host == url.host {
                    webView.load(action.request)
                } else {
                    UIApplication.shared.open(target)
                }
            }
            return nil
        }

        private func showError(_ error: Error, in webView: WKWebView) {
            webView.scrollView.refreshControl?.endRefreshing()
            // A cancelled load (e.g. a reload started over an earlier one)
            // is not a failure worth showing.
            if (error as NSError).code == NSURLErrorCancelled { return }
            let message = error.localizedDescription
                .replacingOccurrences(of: "&", with: "&amp;")
                .replacingOccurrences(of: "<", with: "&lt;")
            let html = """
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <body style="background:#141a22;color:#e8edf3;font:16px -apple-system,system-ui;padding:48px 24px;text-align:center">
            <h2 style="margin:0 0 8px">Dashboard didn't load</h2>
            <p style="color:#9aa7b6">\(message)</p>
            <p style="color:#9aa7b6">Pull down to try again.</p>
            </body>
            """
            webView.loadHTMLString(html, baseURL: nil)
        }
    }
}
