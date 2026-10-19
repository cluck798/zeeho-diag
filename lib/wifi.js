// wifi.js — Windows WiFi 连接模块
// 通过 netsh wlan 连接车辆热点：先生成 profile XML，再 connect
// SSID/密码推导规则（还原自 ZeeCare session.uts）：
//   蓝牙设备名 zeehok1-XXXXXXXXXX → SSID = ZEEHO- + 后缀末6位，密码 = 后缀末8位
//   VIN 直连：SSID = VIN 末6位，密码 = VIN 末8位
"use strict";
const { execFile, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

function ps(command, timeout = 8000) {
  return execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], {
    windowsHide: true,
    timeout
  }).toString().trim();
}

/**
 * 无线网卡预检：没有 WLAN 服务或没有无线网卡时，netsh wlan 必然失败，
 * 提前给出可操作的提示，而不是只返回一个空列表让人以为"附近没有热点"。
 * @returns {{ok:boolean, message?:string}}
 */
function preflight() {
  try {
    const svc = ps("(Get-Service wlansvc -ErrorAction SilentlyContinue).Status");
    if (svc !== "Running") {
      return { ok: false, message: "WLAN AutoConfig(wlansvc) 服务未运行，netsh wlan 无法使用；请先确认本机有无线网卡，并在「服务」里启动 wlansvc" };
    }
    const nics = ps("(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceDescription -match 'Wi-Fi|Wireless|802\\.11|WLAN' } | Measure-Object).Count");
    if (parseInt(nics, 10) === 0) {
      return { ok: false, message: "本机没有无线网卡（只有有线/虚拟网卡），无法连接车辆热点 ZEEHO-xxxxxx；请用带 Wi-Fi 的电脑，或插一个 USB 无线网卡" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: true }; // 预检本身失败时不阻塞真实操作
  }
}

function runNetsh(args, timeout = 15000) {
  return new Promise((resolve, reject) => {
    execFile("netsh", args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

// 从蓝牙设备名推导 WiFi 凭证
function credentialsFromDeviceName(name) {
  const parts = String(name || "").split("-");
  if (parts.length < 2) return null;
  const suffix = parts[parts.length - 1];
  if (suffix.length < 8) return null;
  return {
    ssid: "ZEEHO-" + suffix.slice(suffix.length - 6),
    password: suffix.slice(suffix.length - 8)
  };
}

// 从 VIN 推导 WiFi 凭证（OTA 页用法）
function credentialsFromVin(vin) {
  const v = String(vin || "").trim();
  if (v.length < 8) return null;
  return { ssid: v.slice(v.length - 6), password: v.slice(v.length - 8) };
}

// 生成 WPA2-PSK profile XML
function buildProfileXml(ssid, password) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${esc(ssid)}</name>
  <SSIDConfig>
    <SSID>
      <name>${esc(ssid)}</name>
    </SSID>
  </SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>manual</connectionMode>
  <MSM>
    <security>
      <authEncryption>
        <authentication>WPA2PSK</authentication>
        <encryption>AES</encryption>
        <useOneX>false</useOneX>
      </authEncryption>
      <sharedKey>
        <keyType>passPhrase</keyType>
        <protected>false</protected>
        <keyMaterial>${esc(password)}</keyMaterial>
      </sharedKey>
    </security>
  </MSM>
</WLANProfile>`;
}

/**
 * 连接指定 SSID（自动创建 profile）
 * @returns {Promise<{ok:boolean, message:string}>}
 */
async function connectWifi(ssid, password, log = () => {}) {
  const profilePath = path.join(os.tmpdir(), `zeeho-diag-${Date.now()}.xml`);
  try {
    fs.writeFileSync(profilePath, buildProfileXml(ssid, password), "utf8");
    await runNetsh(["wlan", "add", "profile", `filename=${profilePath}`]);
    log(`WiFi profile 已创建: ${ssid}`);
    const out = await runNetsh(["wlan", "connect", `name=${ssid}`, "ssid=" + ssid], 30000);
    log("netsh connect: " + out.trim().replace(/\r?\n/g, " | "));
    // 等待连接建立
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const status = await currentWifiStatus();
      if (status && status.ssid === ssid && /已连接|Connected/i.test(status.state || "")) {
        return { ok: true, message: `已连接 ${ssid}` };
      }
    }
    return { ok: false, message: "连接超时，请确认车辆已开机且距离足够近" };
  } catch (e) {
    return { ok: false, message: "WiFi 连接失败: " + e.message };
  } finally {
    try { fs.unlinkSync(profilePath); } catch (e) {}
  }
}

// 当前 WiFi 连接状态
async function currentWifiStatus() {
  try {
    const out = await runNetsh(["wlan", "show", "interfaces"]);
    const ssid = /SSID\s*[:：]\s*(.+)/i.exec(out);
    const state = /状态\s*[:：]\s*(.+)|State\s*[:：]\s*(.+)/i.exec(out);
    return {
      ssid: ssid ? ssid[1].trim() : "",
      state: state ? (state[1] || state[2] || "").trim() : ""
    };
  } catch (e) {
    return null;
  }
}

// 扫描可见网络（找 ZEEHO- 热点）
async function scanNetworks() {
  try {
    const out = await runNetsh(["wlan", "show", "networks"]);
    const networks = [];
    const re = /SSID\s*\d+\s*[:：]\s*(.+)/gi;
    let m;
    while ((m = re.exec(out)) !== null) {
      const name = m[1].trim();
      if (name) networks.push(name);
    }
    return networks;
  } catch (e) {
    return [];
  }
}

// 断开当前 WiFi
async function disconnectWifi() {
  try {
    await runNetsh(["wlan", "disconnect"]);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { connectWifi, currentWifiStatus, scanNetworks, disconnectWifi, credentialsFromDeviceName, credentialsFromVin, preflight };
