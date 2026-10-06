// WIFIBridge.swift — 车辆 WiFi（DoIP over TCP）原生传输桥
// 网页层（diag.html）负责 DoIP/UDS 协议逻辑；本桥只做 TCP 连接/收发/事件回传。
// 命令：wifiConnect（payload "host:port"）/ wifiSend（hex）/ wifiClose
// 事件：window.onWifiEvent({type:'connected'|'recv'|'closed'|'error', data:'HEX或说明'})
import Foundation
import Network

final class WIFIBridge {

    static let shared = WIFIBridge()

    /// 事件回传（JSON 字符串），由 ViewController 转发到网页层
    var sink: ((String) -> Void)?

    private var conn: NWConnection?
    private let queue = DispatchQueue(label: "zeeho.wifi.bridge")

    // MARK: - 连接
    func connect(host: String, port: UInt16) {
        close()
        guard let p = NWEndpoint.Port(rawValue: port) else {
            emit(["type": "error", "data": "端口无效"])
            return
        }
        let c = NWConnection(host: NWEndpoint.Host(host), port: p, using: .tcp)
        conn = c
        c.stateUpdateHandler = { [weak self] st in
            switch st {
            case .ready:
                self?.emit(["type": "connected", "data": "\(host):\(port)"])
            case .failed(let e):
                self?.emit(["type": "error", "data": "\(e)"])
                self?.close()
            case .cancelled:
                self?.emit(["type": "closed", "data": ""])
            default:
                break
            }
        }
        c.start(queue: queue)
        receiveLoop(c)
    }

    private func receiveLoop(_ c: NWConnection) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
            guard let self = self else { return }
            if let data = data, !data.isEmpty {
                let hex = data.map { String(format: "%02X", $0) }.joined()
                self.emit(["type": "recv", "data": hex])
            }
            if isComplete || error != nil {
                self.emit(["type": "closed", "data": error.map { "\($0)" } ?? ""])
                return
            }
            self.receiveLoop(c)
        }
    }

    // MARK: - 发送（hex 字符串 → 字节流）
    @discardableResult
    func send(hex: String) -> Bool {
        guard let c = conn else { return false }
        let clean = hex.replacingOccurrences(of: " ", with: "").replacingOccurrences(of: "\n", with: "")
        var bytes: [UInt8] = []
        var s = clean
        while s.count >= 2 {
            let pair = s.prefix(2)
            s.removeFirst(2)
            if let b = UInt8(pair, radix: 16) { bytes.append(b) }
        }
        guard !bytes.isEmpty else { return false }
        c.send(content: Data(bytes), completion: .contentProcessed { _ in })
        return true
    }

    // MARK: - 断开
    func close() {
        conn?.cancel()
        conn = nil
    }

    // MARK: - 事件输出
    private func emit(_ obj: [String: String]) {
        guard let d = try? JSONSerialization.data(withJSONObject: obj, options: []),
              let s = String(data: d, encoding: .utf8) else { return }
        sink?(s)
    }
}