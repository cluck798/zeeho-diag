// RS485BLE.swift — RS485 蓝牙透传模块（I6328A-485 / VG6328A 等）CoreBluetooth 桥
// 模块默认参数：串口 115200 8N1（与车辆 RS485 诊断波特率一致，出厂默认即 115200）
// 默认 GATT：Service 0xFFE0 / 0xFFE1 = WriteWithoutResponse（下行 APP→RS485）/ 0xFFE2 = Notify（上行）
// 事件流与命令经 WebViewController 桥接（网页层 window.__r485Event / window.r485()）
import Foundation
import CoreBluetooth

@objcMembers
final class RS485BLEManager: NSObject {

    // MARK: - 单例（ObjC runtime 从 WebViewController 调用）
    private static let _shared = RS485BLEManager()
    @objc class func sharedInstance() -> RS485BLEManager { return _shared }

    /// 事件回调（JSON 字符串）。由 WebViewController 在启动时设置。
    @objc var sink: ((String) -> Void)?

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var writeChar: CBCharacteristic?
    private var notifyChar: CBCharacteristic?
    private var scanFilter: String?
    private var discoveredOrder: [UUID] = []
    private var discovered: [UUID: [String: Any]] = [:]
    private var serviceList: [[String: Any]] = []

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    // MARK: - 对外接口（浏览器侧命令）

    @objc func bleState() -> String {
        return jsonString(["type": "state", "state": stateName(central.state)])
    }

    @objc func bleStartScan(_ filter: String?) {
        scanFilter = (filter?.isEmpty ?? true) ? nil : filter
        guard central.state == .poweredOn else {
            emit(["type": "error", "error": "蓝牙不可用：" + stateName(central.state)])
            return
        }
        discovered.removeAll()
        discoveredOrder.removeAll()
        central.scanForPeripherals(withServices: nil, options: nil)
        emit(["type": "scanStarted"])
    }

    @objc func bleStopScan() {
        if central.isScanning { central.stopScan() }
        emit(["type": "scanStopped"])
    }

    @objc func bleConnect(_ uuidStr: String) {
        bleStopScan()
        var target: CBPeripheral? = nil
        if let uuid = UUID(uuidString: uuidStr) {
            target = central.retrievePeripherals(withIdentifiers: [uuid]).first
        }
        guard let p = target else {
            emit(["type": "error", "error": "找不到设备（请先扫描）"])
            return
        }
        peripheral = p
        p.delegate = self
        emit(["type": "connecting", "id": uuidStr, "name": p.name ?? ""])
        central.connect(p, options: nil)
    }

    @objc func bleDisconnect() {
        if let p = peripheral {
            central.cancelPeripheralConnection(p)
        }
    }

    /// 发送 hex 数据（自动按 MTU 分片，FFE1 优先 writeWithoutResponse）
    @objc func bleSendHex(_ hex: String) -> Bool {
        guard let p = peripheral, p.state == .connected else {
            emit(["type": "error", "error": "未连接设备"])
            return false
        }
        guard let ch = writeChar else {
            emit(["type": "error", "error": "未找到可写特征（0xFFE1）"])
            return false
        }
        let clean = hex.filter { $0.isHexDigit }
        guard clean.count >= 2 else { return false }
        var data = Data()
        var idx = clean.startIndex
        while idx < clean.endIndex {
            let next = clean.index(idx, offsetBy: 2, limitedBy: clean.endIndex) ?? clean.endIndex
            if let b = UInt8(clean[idx..<next], radix: 16) { data.append(b) }
            idx = next
        }
        let withoutRsp = ch.properties.contains(.writeWithoutResponse)
        let type: CBCharacteristicWriteType = withoutRsp ? .withoutResponse : .withResponse
        let maxLen = max(20, min(p.maximumWriteValueLength(for: type), 180))
        sendChunks(data: data, char: ch, type: type, maxLen: maxLen)
        emit(["type": "tx", "hex": clean.uppercased(), "len": data.count])
        return true
    }

    @objc func bleIsConnected() -> Bool {
        return peripheral?.state == .connected && writeChar != nil
    }

    // MARK: - 内部

    private func sendChunks(data: Data, char: CBCharacteristic, type: CBCharacteristicWriteType, maxLen: Int) {
        guard let p = peripheral else { return }
        if data.count <= maxLen {
            p.writeValue(data, for: char, type: type)
            return
        }
        p.writeValue(data.prefix(maxLen), for: char, type: type)
        let rest = Data(data.dropFirst(maxLen))
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) { [weak self] in
            self?.sendChunks(data: rest, char: char, type: type, maxLen: maxLen)
        }
    }

    /// 特征选择：优先 FFE0 服务下的 FFE1（写）/ FFE2（通知），否则回退到第一个可用特征
    private func pickCharacteristics() {
        guard let p = peripheral else { return }
        var w: CBCharacteristic?
        var n: CBCharacteristic?
        // 第一趟：找 FFE1 / FFE2
        for s in p.services ?? [] {
            for c in s.characteristics ?? [] {
                let u = c.uuid.uuidString.uppercased()
                if u.contains("FFE1") && (c.properties.contains(.write) || c.properties.contains(.writeWithoutResponse)) { w = c }
                if u.contains("FFE2") && (c.properties.contains(.notify) || c.properties.contains(.indicate)) { n = c }
            }
        }
        // 第二趟：回退
        if w == nil || n == nil {
            for s in p.services ?? [] {
                for c in s.characteristics ?? [] {
                    if w == nil && (c.properties.contains(.write) || c.properties.contains(.writeWithoutResponse)) { w = c }
                    if n == nil && (c.properties.contains(.notify) || c.properties.contains(.indicate)) { n = c }
                }
            }
        }
        writeChar = w
        notifyChar = n
        if let n = n, !n.isNotifying {
            p.setNotifyValue(true, for: n)
        }
        var info: [String: Any] = ["type": "ready", "write": w?.uuid.uuidString ?? "", "notify": n?.uuid.uuidString ?? ""]
        info["ok"] = (w != nil && n != nil)
        emit(info)
    }

    private func emit(_ obj: [String: Any]) {
        let s = jsonString(obj)
        if let sink = sink {
            sink(s)
        }
    }

    private func jsonString(_ obj: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
              let s = String(data: data, encoding: .utf8) else { return "{\"type\":\"error\",\"error\":\"json\"}" }
        return s
    }

    private func stateName(_ s: CBManagerState) -> String {
        switch s {
        case .poweredOn: return "poweredOn"
        case .poweredOff: return "poweredOff"
        case .unauthorized: return "unauthorized"
        case .unsupported: return "unsupported"
        case .resetting: return "resetting"
        default: return "unknown"
        }
    }
}

// MARK: - CBCentralManagerDelegate
extension RS485BLEManager: CBCentralManagerDelegate {

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        emit(["type": "state", "state": stateName(central.state)])
        if central.state != .poweredOn && central.isScanning {
            central.stopScan()
            emit(["type": "scanStopped"])
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        if let f = scanFilter, !f.isEmpty {
            let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? ""
            if !name.localizedCaseInsensitiveContains(f) { return }
        }
        let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? "(未命名)"
        let info: [String: Any] = ["type": "device", "id": peripheral.identifier.uuidString, "name": name, "rssi": RSSI.intValue]
        if discovered[peripheral.identifier] == nil { discoveredOrder.append(peripheral.identifier) }
        discovered[peripheral.identifier] = info
        emit(info)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        serviceList = []
        emit(["type": "connected", "id": peripheral.identifier.uuidString, "name": peripheral.name ?? ""])
        peripheral.discoverServices(nil)
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        emit(["type": "connectFailed", "error": error?.localizedDescription ?? "连接失败"])
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        writeChar = nil
        notifyChar = nil
        emit(["type": "disconnected", "error": error?.localizedDescription ?? ""])
    }
}

// MARK: - CBPeripheralDelegate
extension RS485BLEManager: CBPeripheralDelegate {

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error = error {
            emit(["type": "error", "error": "服务发现失败：" + error.localizedDescription])
            return
        }
        for s in peripheral.services ?? [] {
            peripheral.discoverCharacteristics(nil, for: s)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        var chars: [[String: Any]] = []
        for c in service.characteristics ?? [] {
            chars.append([
                "uuid": c.uuid.uuidString,
                "write": c.properties.contains(.write) || c.properties.contains(.writeWithoutResponse),
                "notify": c.properties.contains(.notify) || c.properties.contains(.indicate)
            ])
        }
        serviceList.append(["uuid": service.uuid.uuidString, "chars": chars])
        emit(["type": "services", "list": serviceList])
        pickCharacteristics()
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil, let d = characteristic.value, !d.isEmpty else { return }
        let hex = d.map { String(format: "%02X", $0) }.joined()
        emit(["type": "data", "hex": hex, "len": d.count])
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        emit(["type": "notifyState", "uuid": characteristic.uuid.uuidString, "on": characteristic.isNotifying])
    }
}