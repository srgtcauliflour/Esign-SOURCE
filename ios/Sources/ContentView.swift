import SwiftUI
import WebKit

enum SideVaultConfig {
    static var serverURL: URL {
        let fallback = URL(string: "http://localhost:4567")!
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "SIDEVAULT_SERVER_URL") as? String,
            !raw.isEmpty,
            let url = URL(string: raw)
        else {
            return fallback
        }
        return url
    }
}

struct ContentView: View {
    @State private var loadFailed = false
    @State private var reloadToken = UUID()

    var body: some View {
        ZStack {
            WebView(url: SideVaultConfig.serverURL, loadFailed: $loadFailed)
                .id(reloadToken)
                .ignoresSafeArea()

            if loadFailed {
                VStack(spacing: 12) {
                    Text("Couldn't reach SideVault")
                        .font(.headline)
                    Text(SideVaultConfig.serverURL.absoluteString)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Button("Retry") {
                        loadFailed = false
                        reloadToken = UUID()
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding()
                .background(.ultraThinMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .padding()
            }
        }
    }
}

struct WebView: UIViewRepresentable {
    let url: URL
    @Binding var loadFailed: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.navigationDelegate = context.coordinator
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    class Coordinator: NSObject, WKNavigationDelegate {
        let parent: WebView

        init(_ parent: WebView) {
            self.parent = parent
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            parent.loadFailed = true
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            parent.loadFailed = true
        }
    }
}
