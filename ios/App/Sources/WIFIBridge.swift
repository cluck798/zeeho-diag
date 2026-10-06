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
                self?.emit(["type": "error", "data": Self.humanError(e)])
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

    // MARK: - 错误翻译成人话
    static func humanError(_ e: Error) -> String {
        let s = "\(e)"
        if s.contains("rawValue: 53") { return "连接被中止（POSIX 53）：常见原因——本地网络权限未开 / WiFi 被「无线局域网助理」切走 / 网关拒绝" }
        if s.contains("rawValue: 61") { return "端口未开放（POSIX 61）：网关 IP 可能不对（试试 192.168.0.1，或先点「网络自检」）" }
        if s.contains("rawValue: 65") { return "网络不可达（POSIX 65）：手机可能不在车辆热点网段（先点「网络自检」看本机 IP）" }
        if s.contains("rawValue: 51") { return "网络不可达（POSIX 51）：检查是否连着车辆热点" }
        return s
    }

    // MARK: - 本机 en0（WiFi）IPv4 地址
    func localIP() -> String {
        var address = ""
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return "" }
        var ptr: UnsafeMutablePointer<ifaddrs>? = first
        while let cur = ptr {
            let ifa = cur.pointee
            let name = String(cString: ifa.ifa_name)
            if name == "en0", let addr = ifa.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET) {
                var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                if getnameinfo(addr, socklen_t(addr.pointee.sa_len), &hostname, socklen_t(hostname.count), nil, 0, NI_NUMERICHOST) == 0 {
                    address = String(cString: hostname)
                    break
                }
            }
            ptr = ifa.ifa_next
        }
        freeifaddrs(ifaddr)
        return address
    }

    // MARK: - 端口探测（对一组候选网关并发尝试 TCP 连接，1.2 秒超时）
    func probe(hosts: [String], port: UInt16, done: @escaping ([[String: String]]) -> Void) {
        let group = DispatchGroup()
        var results: [[String: String]] = []
        let lock = NSLock()
        for h in hosts {
            guard let p = NWEndpoint.Port(rawValue: port) else { continue }
            group.enter()
            let c = NWConnection(host: NWEndpoint.Host(h), port: p, using: .tcp)
            var finished = false
            let finish: (String) -> Void = { status in
                lock.lock()
                let already = finished
                finished = true
                lock.unlock()
                if already { return }
                lock.lock()
                results.append(["host": h, "status": status])
                lock.unlock()
                c.cancel()
                group.leave()
            }
            c.stateUpdateHandler = { st in
                switch st {
                case .ready: finish("open")
                case .failed: finish("fail")
                default: break
                }
            }
            c.start(queue: queue)
            DispatchQueue.global().asyncAfter(deadline: .now() + 1.2) { finish("timeout") }
        }
        group.notify(queue: DispatchQueue.global()) { done(results) }
    }

    // MARK: - 端口扫描（对同一主机的一组端口并发探测，1.2 秒超时）
    func probePorts(host: String, ports: [UInt16], done: @escaping ([[String: String]]) -> Void) {
        let group = DispatchGroup()
        var results: [[String: String]] = []
        let lock = NSLock()
        for port in ports {
            guard let p = NWEndpoint.Port(rawValue: port) else { continue }
            group.enter()
            let c = NWConnection(host: NWEndpoint.Host(host), port: p, using: .tcp)
            var finished = false
            let finish: (String) -> Void = { status in
                lock.lock()
                let already = finished
                finished = true
                lock.unlock()
                if already { return }
                lock.lock()
                results.append(["port": "\(port)", "status": status])
                lock.unlock()
                c.cancel()
                group.leave()
            }
            c.stateUpdateHandler = { st in
                switch st {
                case .ready: finish("open")
                case .failed: finish("fail")
                default: break
                }
            }
            c.start(queue: queue)
            DispatchQueue.global().asyncAfter(deadline: .now() + 1.2) { finish("timeout") }
        }
        group.notify(queue: DispatchQueue.global()) { done(results) }
    }

    // MARK: - 事件输出
    private func emit(_ obj: [String: String]) {
        guard let d = try? JSONSerialization.data(withJSONObject: obj, options: []),
              let s = String(data: d, encoding: .utf8) else { return }
        sink?(s)
    }
}