// ViewController.swift — 诊断页容器（WKWebView 加载 diag.html）
// 网页层通过 window.r485(cmd, data, cb) 调用原生 BLE 桥：
//   window.webkit.messageHandlers.rs485.postMessage({command, data, id})
// 原生事件经 RS485BLEManager.sink 回推：window.__r485Event(json)
// 命令回调经 evaluateJavaScript 回传：window.__r485Cb(id, json)
import UIKit
import WebKit

final class ViewController: UIViewController, WKScriptMessageHandler {

    private var webView: WKWebView!

    /// 注入到诊断页的桥接脚本（r485 帮助函数 + 回调派发；独立 App 无「返回面板」按钮，隐藏之）
    private static let hookScript = """
    <script>(function(){if(window.__r485Hook)return;window.__r485Hook=1;
    window.r485=function(cmd,data,cb){
      var id='r485_'+Date.now()+'_'+Math.floor(Math.random()*1e6);
      window.__r485Cbs=window.__r485Cbs||{};
      if(cb)window.__r485Cbs[id]=cb;
      try{window.webkit.messageHandlers.rs485.postMessage({command:cmd,data:data||'',id:id})}catch(e){if(cb)cb(null)}
    };
    window.__r485Cb=function(id,json){try{var cb=(window.__r485Cbs||{})[id];if(cb){delete window.__r485Cbs[id];cb(json)}}catch(e){}};
    window.__r485Event=function(json){try{if(window.onR485Event)window.onR485Event(json)}catch(e){}};
    var b=document.getElementById('btnBack');if(b)b.style.display='none';
    })();</script>
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
            let host = payload.isEmpty ? "192.168.0.1" : payload
            let ports: [UInt16] = [22, 23, 80, 443, 3000, 5000, 7000, 8000, 8080, 8443, 8888, 9000, 13400]
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
}