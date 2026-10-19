// ble.js — Windows 蓝牙发现模块
// 用 PowerShell 调 Windows.Devices.Bluetooth BLE 广播监听，扫描 zeehok1- 前缀设备
// 设备名规则（还原自 ZeeCare）：zeehok1-[0-9a-z]{10}，RSSI > -95 才认为可连
"use strict";
const { spawn, execFileSync } = require("child_process");

const DEVICE_NAME_REGEX = /^zeehok1-[0-9a-z]{10}$/i;
const MIN_RSSI = -95;

// PowerShell 脚本：启动 BLE 广播监听，输出 name|rssi|addr 行
// 注意：WinRT 类型不能用 New-Object 实例化，必须用 [类型,程序集,ContentType=WindowsRuntime]::new()；
// 事件处理程序里也不能用 Write-Output（输出不会回到父进程管道），必须直接写 Console。
const PS_SCRIPT = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$watcherType = [Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher,Windows.Devices.Bluetooth,ContentType=WindowsRuntime]
$watcher = $watcherType::new()
$watcher.ScanningMode = [Windows.Devices.Bluetooth.Advertisement.BluetoothLEScanningMode]::Active
$seen = @{}
$handler = {
  param($sender, $args)
  try {
    $name = $args.Advertisement.LocalName
    if ($name -and $name -match '^zeehok1-') {
      $rssi = $args.RawSignalStrengthInDBm
      $addr = $args.BluetoothAddress.ToString('X12')
      $key = "$addr|$name"
      $now = Get-Date
      if (-not $seen.ContainsKey($key) -or ($now - $seen[$key]).TotalSeconds -gt 2) {
        $seen[$key] = $now
        [Console]::Out.WriteLine(("{0}|{1}|{2}" -f $name, $rssi, $addr))
        [Console]::Out.Flush()
      }
    }
  } catch {}
}
$watcher.add_Received($handler)
try {
  $watcher.Start()
} catch {
  [Console]::Error.WriteLine("BLE_START_FAILED: " + $_.Exception.Message)
  exit 2
}
$seconds = 30
if ($env:ZEEHO_SCAN_SECONDS) { $seconds = [int]$env:ZEEHO_SCAN_SECONDS }
Start-Sleep -Seconds $seconds
$watcher.Stop()
`;

/**
 * 本机是否有可用的蓝牙适配器（设备管理器里状态 OK 的 Bluetooth 设备）。
 * 检测本身失败时返回 true，避免因为查询问题挡住真实扫描。
 */
function hasBluetoothRadio() {
  try {
    const out = execFileSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command",
        "(Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'OK' } | Measure-Object).Count"],
      { windowsHide: true, timeout: 8000 }
    ).toString().trim();
    return parseInt(out, 10) > 0;
  } catch (e) {
    return true;
  }
}

/**
 * 扫描 BLE 设备（持续 durationMs，返回发现的 zeehok1- 设备列表）
 * @returns {Promise<Array<{name:string, rssi:number, address:string}>>}
 */
function scanBle(durationMs = 12000, log = () => {}) {
  return new Promise((resolve) => {
    const devices = new Map();
    let ps;
    if (!hasBluetoothRadio()) {
      log("本机没有可用的蓝牙适配器（设备管理器未发现状态正常的蓝牙设备），无法扫描车辆；请插 USB 蓝牙 4.0 适配器或换用带蓝牙的电脑/手机");
      return resolve([]);
    }
    try {
      const seconds = Math.max(3, Math.ceil(durationMs / 1000));
      ps = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT], {
        windowsHide: true,
        env: { ...process.env, ZEEHO_SCAN_SECONDS: String(seconds) }
      });
    } catch (e) {
      log("启动蓝牙扫描失败: " + e.message);
      return resolve([]);
    }
    let buf = "";
    ps.stdout.on("data", (d) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        const parts = line.split("|");
        if (parts.length >= 2) {
          const name = parts[0].trim();
          const rssi = parseInt(parts[1], 10);
          const address = parts[2] || "";
          if (DEVICE_NAME_REGEX.test(name)) {
            devices.set(address || name, { name, rssi, address });
            log(`发现设备 ${name} RSSI=${rssi}`);
          }
        }
      }
    });
    ps.stderr.on("data", (d) => {
      const s = d.toString().trim();
      if (!s) return;
      if (s.includes("BLE_START_FAILED:")) {
        log("蓝牙扫描不可用: " + s.replace("BLE_START_FAILED:", "").trim().slice(0, 160));
        return;
      }
      log("BLE 扫描: " + s.slice(0, 200));
    });
    const timer = setTimeout(() => {
      try { ps.kill(); } catch (e) {}
      finish();
    }, durationMs);
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const list = Array.from(devices.values()).filter((d) => d.rssi > MIN_RSSI);
      resolve(list);
    }
    ps.on("close", finish);
    ps.on("error", () => finish());
  });
}

module.exports = { scanBle, DEVICE_NAME_REGEX, MIN_RSSI };
