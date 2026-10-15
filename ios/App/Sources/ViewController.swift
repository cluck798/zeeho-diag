// ViewController.swift — 诊断页容器（WKWebView 加载 diag.html）
// 网页层通过 window.r485(cmd, data, cb) 调用原生 BLE 桥：
//   window.webkit.messageHandlers.rs485.postMessage({command, data, id})
// 原生事件经 RS485BLEManager.sink 回推：window.__r485Event(json)
// 命令回调经 evaluateJavaScript 回传：window.__r485Cb(id, json)
import UIKit
import WebKit

final class ViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {

    private var webView: WKWebView!
    private var diagBanner: UILabel?

    /// 注入到诊断页的桥接脚本（r485 帮助函数 + 回调派发）。
    /// 注意：WKUserScript 的 source 必须是纯 JS——不能包 <script> 标签，
    /// 否则按 JS 解析直接语法错误、整段静默失效（事件/回调全部丢失）。
    private static let hookScript = """
    (function(){if(window.__r485Hook)return;window.__r485Hook=1;
    window.r485=function(cmd,data,cb){
      var id='r485_'+Date.now()+'_'+Math.floor(Math.random()*1e6);
      window.__r485Cbs=window.__r485Cbs||{};
      if(cb)window.__r485Cbs[id]=cb;
      try{window.webkit.messageHandlers.rs485.postMessage({command:cmd,data:data||'',id:id})}catch(e){if(cb)cb(null)}
    };
    window.__r485Cb=function(id,json){try{var cb=(window.__r485Cbs||{})[id];if(cb){delete window.__r485Cbs[id];cb(json)}}catch(e){}};
    window.__r485Event=function(json){try{if(window.onR485Event)window.onR485Event(json)}catch(e){}};
    })();
    """

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 10 / 255.0, green: 15 / 255.0, blue: 24 / 255.0, alpha: 1.0)

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let userCtrl = WKUserContentController()
        userCtrl.add(self, name: "rs485")
        userCtrl.addUserScript(WKUserScript(source: Self.hookScript,
                                            injectionTime: .atDocumentEnd,
                                            forMainFrameOnly: true))
        config.userContentController = userCtrl

        let wv = WKWebView(frame: .zero, configuration: config)
        wv.navigationDelegate = self
        wv.translatesAutoresizingMaskIntoConstraints = false
        wv.isOpaque = false
        wv.backgroundColor = view.backgroundColor
        wv.scrollView.backgroundColor = view.backgroundColor
        wv.scrollView.contentInsetAdjustmentBehavior = .never
        view.addSubview(wv)
        webView = wv
        NSLayoutConstraint.activate([
            wv.topAnchor.constraint(equalTo: view.topAnchor),
            wv.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            wv.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            wv.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])

        // BLE 事件 → 网页层
        RS485BLEManager.sharedInstance().sink = { [weak self] json in
            DispatchQueue.main.async {
                self?.evaluateJS("window.__r485Event&&window.__r485Event(\(json));")
            }
        }

        // WiFi(DoIP) 事件 → 网页层
        WIFIBridge.shared.sink = { [weak self] json in
            DispatchQueue.main.async {
                self?.evaluateJS("window.onWifiEvent&&window.onWifiEvent(\(json));")
            }
        }

        if let url = Bundle.main.url(forResource: "diag", withExtension: "html") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            webView.loadHTMLString("<h3 style='color:#fff;font-family:sans-serif'>diag.html 未打包进 App</h3>", baseURL: nil)
        }
    }

    // MARK: - 网页命令分发
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "rs485", let body = message.body as? [String: Any] else { return }
        let cmd = body["command"] as? String ?? ""
        let payload = body["data"] as? String ?? ""
        let cbId = body["id"] as? String ?? ""
        let mgr = RS485BLEManager.sharedInstance()

        func reply(_ json: String?) {
            guard !cbId.isEmpty else { return }
            let arg = (json?.isEmpty == false) ? json! : "null"
            evaluateJS("window.__r485Cb&&window.__r485Cb('\(cbId)', \(arg));")
        }

        switch cmd {
        case "scan":
            mgr.bleStartScan(payload.isEmpty ? nil : payload)
            reply(nil)
        case "stopScan":
            mgr.bleStopScan()
            reply(nil)
        case "connect":
            mgr.bleConnect(payload)
            reply(nil)
        case "disconnect":
            mgr.bleDisconnect()
            reply(nil)
        case "send":
            let ok = mgr.bleSendHex(payload)
            reply(ok ? "{\"ok\":true}" : "{\"ok\":false}")
        case "state":
            reply(mgr.bleState())
        case "vciProbe":
            reply(VCISPPBridge.toJSON(VCISPPBridge.shared.probe()))
        case "vciPaired":
            reply(VCISPPBridge.toJSON(VCISPPBridge.shared.pairedDevices()))
        case "wifiConnect":
            let parts = payload.split(separator: ":")
            let host = parts.first.map(String.init) ?? "192.168.49.1"
            let port = parts.count > 1 ? (UInt16(parts[1]) ?? 13400) : 13400
            WIFIBridge.shared.connect(host: host, port: port)
            reply(nil)
        case "wifiSend":
            let ok = WIFIBridge.shared.send(hex: payload)
            reply(ok ? "{\"ok\":true}" : "{\"ok\":false}")
        case "wifiClose":
            WIFIBridge.shared.close()
            reply(nil)
        case "wifiSelfCheck":
            let ip = WIFIBridge.shared.localIP()
            var candidates: [String] = []
            let parts = ip.split(separator: ".")
            if parts.count == 4 && (ip.hasPrefix("192.168.") || ip.hasPrefix("10.") || ip.hasPrefix("172.")) {
                candidates.append(parts[0..<3].joined(separator: ".") + ".1")
            }
            for c in ["192.168.49.1", "192.168.0.1", "192.168.1.1", "192.168.4.1", "10.0.0.1"] where !candidates.contains(c) {
                candidates.append(c)
            }
            let port = UInt16(payload) ?? 13400
            WIFIBridge.shared.probe(hosts: candidates, port: port) { [weak self] res in
                var out: [String: Any] = ["localIP": ip, "port": Int(port), "results": res]
                if let open = res.first(where: { $0["status"] == "open" }) { out["found"] = open["host"] }
                let json = (try? JSONSerialization.data(withJSONObject: out)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
                DispatchQueue.main.async {
                    self?.evaluateJS("window.onWiFiSelfCheck&&window.onWiFiSelfCheck(\(json));")
                }
            }
            reply(nil)
        case "wifiPortScan":
            let host = payload.isEmpty ? "192.168.49.1" : payload
            let ports: [UInt16] = [22, 23, 80, 443, 3000, 5000, 7000, 8000, 8080, 8443, 8888, 9000, 10950, 13400]
            WIFIBridge.shared.probePorts(host: host, ports: ports) { [weak self] res in
                var out: [String: Any] = ["host": host, "results": res]
                out["open"] = res.filter { $0["status"] == "open" }.map { $0["port"] ?? "" }
                let json = (try? JSONSerialization.data(withJSONObject: out)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
                DispatchQueue.main.async {
                    self?.evaluateJS("window.onWifiPortScan&&window.onWifiPortScan(\(json));")
                }
            }
            reply(nil)
        default:
            reply(nil)
        }
    }

    private func evaluateJS(_ js: String) {
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    // MARK: - 加载自检（页面脚本没跑起来时给出可见提示，避免"按钮全没反应"无从排查）
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.evaluateJavaScript("window.__diagReady===1") { [weak self] res, err in
            guard (res as? Bool) != true else { return }
            let ver = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
            let reason = (err != nil) ? "探测执行失败" : "diag.html 内联脚本未执行（可能被拦截或语法不兼容）"
            DispatchQueue.main.async { self?.showDiagBanner("页面初始化失败（v\(ver)）：\(reason)。请截图反馈开发者。") }
        }
    }

    private func showDiagBanner(_ text: String) {
        if diagBanner == nil {
            let lb = UILabel()
            lb.numberOfLines = 0
            lb.font = .systemFont(ofSize: 13, weight: .semibold)
            lb.textColor = .white
            lb.backgroundColor = UIColor.systemRed
            lb.layer.cornerRadius = 8
            lb.clipsToBounds = true
            lb.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(lb)
            view.bringSubviewToFront(lb)
            NSLayoutConstraint.activate([
                lb.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 6),
                lb.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
                lb.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12)
            ])
            diagBanner = lb
        }
        diagBanner?.text = " " + text + " "
    }
}