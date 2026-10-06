// ble.js — Windows 蓝牙发现模块
// 用 PowerShell 调 Windows.Devices.Bluetooth BLE 广播监听，扫描 zeehok1- 前缀设备
// 设备名规则（还原自 ZeeCare）：zeehok1-[0-9a-z]{10}，RSSI > -95 才认为可连
"use strict";
const { spawn } = require("child_process");

const DEVICE_NAME_REGEX = /^zeehok1-[0-9a-z]{10}$/i;
const MIN_RSSI = -95;

// PowerShell 脚本：启动 BLE 广播监听，输出 JSON 行 {name, rssi, addr}
const PS_SCRIPT = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher,Windows.Devices.Bluetooth,ContentType=WindowsRuntime]
$watcher = New-Object Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher
$watcher.ScanningMode = [Windows.Devices.Bluetooth.Advertisement.BluetoothLEScanningMode]::Active
$seen = @{}
$watcher.Received.Add({
  param($sender, $args)
  $adv = $args
  $name = $adv.Advertisement.LocalName
  if ($name -and $name -match '^zeehok1-') {
    $rssi = $adv.RawSignalStrengthInDBm
    $addr = $adv.BluetoothAddress.ToString('X12')
    $key = "$addr|$name"
    $now = Get-Date
    if (-not $seen.ContainsKey($key) -or ($now - $seen[$key]).TotalSeconds -gt 2) {
      $seen[$key] = $now
      Write-Output ("{0}|{1}|{2}" -f $name, $rssi, $addr)
    }
  }
})
$watcher.Start()
Start-Sleep -Seconds 30
$watcher.Stop()
`;

/**
 * 扫描 BLE 设备（持续 durationMs，返回发现的 zeehok1- 设备列表）
 * @returns {Promise<Array<{name:string, rssi:number, address:string}>>}
 */
function scanBle(durationMs = 12000, log = () => {}) {
  return new Promise((resolve) => {
    const devices = new Map();
    let ps;
    try {
      ps = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT], { windowsHide: true });
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
      if (s) log("BLE 扫描: " + s.slice(0, 200));
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
