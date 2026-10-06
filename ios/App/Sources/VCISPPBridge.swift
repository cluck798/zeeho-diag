// VCISPPBridge.swift — 官方诊断仪（VCI）实验桥：TrollStore 环境下探测/使用 iOS 私有蓝牙框架
// 背景：官方诊断仪是蓝牙经典（SPP）设备，iOS 公开 API 不可见。
// 本桥在 TrollStore 平台权限下动态加载私有 BluetoothManager.framework，先探测能力（类/方法），再逐步尝试连接。
import Foundation
import ObjectiveC.runtime

final class VCISPPBridge {

    static let shared = VCISPPBridge()
    private var fwHandle: UnsafeMutableRawPointer?

    private static let fwPath = "/System/Library/PrivateFrameworks/BluetoothManager.framework/BluetoothManager"

    // MARK: - ① 探测私有框架（dlopen + 类/方法枚举）
    func probe() -> [String: Any] {
        var result: [String: Any] = [:]
        let h = dlopen(Self.fwPath, RTLD_NOW)
        fwHandle = h
        result["dlopen"] = (h != nil)
        if h == nil {
            let err = dlerror()
            result["dlopenError"] = err != nil ? String(cString: err!) : "unknown"
            return result
        }

        var classes: [[String: Any]] = []
        for n in ["BluetoothManager", "BluetoothDevice", "BluetoothLocalDevice", "BluetoothXPCClient"] {
            if let cls: AnyClass = NSClassFromString(n) {
                var methods: [String] = []
                var count: UInt32 = 0
                if let list = class_copyMethodList(cls, &count) {
                    for i in 0..<Int(count) {
                        methods.append(NSStringFromSelector(method_getName(list[i])))
                    }
                    free(list)
                }
                var classMethods: [String] = []
                if let meta = object_getClass(cls), let mlist = class_copyMethodList(meta, &count) {
                    for i in 0..<Int(count) {
                        classMethods.append(NSStringFromSelector(method_getName(mlist[i])))
                    }
                    free(mlist)
                }
                let kw = ["RFCOMM", "rfcomm", "SPP", "spp", "L2CAP", "l2cap", "hannel", "onnect", "evice", "air", "pen", "can"]
                let key = methods.filter { m in kw.contains { m.contains($0) } }
                classes.append([
                    "name": n,
                    "instanceMethods": methods.sorted(),
                    "classMethods": classMethods.sorted(),
                    "keyMethods": key.sorted()
                ])
            } else {
                classes.append(["name": n, "missing": true])
            }
        }
        result["classes"] = classes
        return result
    }

    // MARK: - ② 列出已配对 / 已知设备
    func pairedDevices() -> [String: Any] {
        guard let cls: AnyClass = NSClassFromString("BluetoothManager") else {
            return ["error": "BluetoothManager 类不存在（先点①探测）"]
        }
        let sharedSel = NSSelectorFromString("sharedInstance")
        guard let mgr = (cls as AnyObject).perform(sharedSel)?.takeUnretainedValue() else {
            return ["error": "sharedInstance 调用失败"]
        }
        for selName in ["pairedDevices", "connectedDevices", "devices"] {
            let sel = NSSelectorFromString(selName)
            if mgr.responds(to: sel) {
                if let arr = mgr.perform(sel)?.takeUnretainedValue() as? [Any] {
                    var out: [[String: Any]] = []
                    for d in arr {
                        var info: [String: Any] = ["class": String(describing: type(of: d))]
                        for f in ["name", "address", "addressString", "connected", "isConnected"] {
                            let fs = NSSelectorFromString(f)
                            if (d as AnyObject).responds(to: fs), let v = (d as AnyObject).perform(fs)?.takeUnretainedValue() {
                                info[f] = "\(v)"
                            }
                        }
                        out.append(info)
                    }
                    return ["source": selName, "count": out.count, "devices": out]
                }
            }
        }
        return ["error": "未找到设备列表接口（结果见①的方法列表）"]
    }

    // MARK: - JSON 序列化
    static func toJSON(_ obj: [String: Any]) -> String {
        if let data = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted, .sortedKeys]),
           let s = String(data: data, encoding: .utf8) {
            return s
        }
        return "{\"error\":\"serialize failed\"}"
    }
}