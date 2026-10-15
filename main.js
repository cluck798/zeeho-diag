// main.js — 极核诊断工具主进程
// 流程：蓝牙扫描发现车辆 → 推导 WiFi 凭证 → netsh 连接车辆热点 → TCP DoIP 诊断读取
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { DiagClient } = require("./lib/diagClient");
const vehicle = require("./lib/vehicleService");
const wifi = require("./lib/wifi");
const ble = require("./lib/ble");
const ecus = require("./lib/ecus");
const rs485 = require("./lib/rs485");
const routines = require("./lib/routines");

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;
let diagClient = null;

const logLine = (msg) => {
  console.log(`[${new Date().toLocaleTimeString("zh-CN", { hour12: false })}] ${msg}`);
  if (win && !win.isDestroyed()) {
    try { win.webContents.send("diag:log", msg); } catch (e) {}
  }
};

function iconPath() {
  const candidates = [
    path.join(__dirname, "build", "icon.png"),
    path.join(__dirname, "..", "ZEEHO.png")
  ];
  for (const p of candidates) {
    try { if (require("fs").existsSync(p)) return p; } catch (e) {}
  }
  return null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    title: "极核诊断工具",
    icon: iconPath() || undefined,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

// ---------- IPC ----------
function registerIpc() {
  // 蓝牙扫描
  ipcMain.handle("ble:scan", async (_e, durationMs) => {
    logLine("开始蓝牙扫描…");
    const devices = await ble.scanBle(Number(durationMs) || 12000, logLine);
    logLine(`蓝牙扫描完成，发现 ${devices.length} 台车辆`);
    return devices;
  });

  // 推导 WiFi 凭证
  ipcMain.handle("wifi:credentials", (_e, { deviceName, vin }) => {
    if (deviceName) return wifi.credentialsFromDeviceName(deviceName);
    if (vin) return wifi.credentialsFromVin(vin);
    return null;
  });

  // 扫描可见 WiFi（找 ZEEHO- 热点）
  ipcMain.handle("wifi:scan", async () => {
    const networks = await wifi.scanNetworks();
    return networks.filter((n) => /^ZEEHO-/i.test(n));
  });

  // 连接 WiFi
  ipcMain.handle("wifi:connect", async (_e, { ssid, password }) => {
    logLine(`连接 WiFi: ${ssid}`);
    return await wifi.connectWifi(ssid, password, logLine);
  });

  // 当前 WiFi 状态
  ipcMain.handle("wifi:status", async () => {
    return await wifi.currentWifiStatus();
  });

  // 断开 WiFi
  ipcMain.handle("wifi:disconnect", async () => {
    return await wifi.disconnectWifi();
  });

  // TCP 连接 + 路由激活
  ipcMain.handle("diag:connect", async (_e, { host, port } = {}) => {
    try {
      if (diagClient) diagClient.close();
      diagClient = new DiagClient({ host: host || undefined, port: port || undefined, log: logLine });
      diagClient.onRawPdu = (hex) => {
        if (win && !win.isDestroyed()) {
          try { win.webContents.send("diag:pdu", hex); } catch (e) {}
        }
      };
      await diagClient.connect();
      await diagClient.routerActivation();
      diagClient.startHeartbeat();
      return { ok: true, message: "已连接车辆诊断接口" };
    } catch (e) {
      return { ok: false, message: "诊断连接失败: " + e.message };
    }
  });

  // 读取车辆信息
  ipcMain.handle("diag:readVehicleInfo", async () => {
    if (!diagClient) return { ok: false, message: "未连接" };
    try {
      const info = await vehicle.readVehicleInfo(diagClient, logLine);
      return { ok: true, info };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });

  // VCDM 在线检测
  ipcMain.handle("diag:checkOnline", async () => {
    if (!diagClient) return { ok: false, message: "未连接" };
    const online = await vehicle.checkVcdmNodeOnline(diagClient, logLine);
    return { ok: true, online };
  });

  // 读故障码（原始字节，UI 展示 hex）
  ipcMain.handle("diag:readFaultCodes", async () => {
    if (!diagClient) return { ok: false, message: "未连接" };
    const udsData = await vehicle.readFaultCodes(diagClient, logLine);
    return { ok: true, hex: require("./lib/protocol").bytesToHex(udsData) };
  });

  // 实时数据（数据流）读取：group=bms|mcu|... da=vcdm|mcu | ecu=<ECU key>
  ipcMain.handle("diag:readStreams", async (_e, { group, da, ecu } = {}) => {
    if (!diagClient) return { ok: false, message: "未连接" };
    const { groups } = require("./lib/datastreams");
    const defs = groups[group];
    if (!defs || !defs.length) return { ok: false, message: "未知数据组: " + group };
    let target = da === "vcdm" ? 1 : 2; // 1=VCDM, 2=MCU（默认 MCU）
    let label = da === "vcdm" ? "VCDM(1)" : "MCU(2)";
    if (ecu) {
      const info = ecus.resolveDa(ecu);
      target = info.da;
      label = `${info.label}(DA=${info.da})`;
      if (info.warn) logLine("⚠ " + info.warn);
    }
    logLine(`读取数据流 [${group}] 目标=${label}，共 ${defs.length} 项…`);
    try {
      const items = await vehicle.readDataStreams(diagClient, defs, { da: target, timeout: 1000, log: logLine });
      const okCount = items.filter((i) => i.ok).length;
      logLine(`数据流读取完成：成功 ${okCount}/${items.length}`);
      return { ok: true, items };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });

  // 自定义 DID 读取（试验用）
  ipcMain.handle("diag:readRawDid", async (_e, { did, da } = {}) => {
    if (!diagClient) return { ok: false, message: "未连接" };
    const target = da === "vcdm" ? 1 : 2;
    try {
      const r = await vehicle.readRawDid(diagClient, did, { da: target });
      logLine(`自定义 DID ${did} → ${r.ok ? r.hex : r.message}`);
      return r;
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });

  // 断开诊断
  ipcMain.handle("diag:disconnect", async () => {
    if (diagClient) { diagClient.close(); diagClient = null; }
    return { ok: true };
  });

  // ---------- 本项目 research 能力注入 ----------

  // ECU 全景登记表
  ipcMain.handle("ecu:list", async () => ecus.listEcus());

  // DID 扫描（研究：发现某 ECU 暴露的 DID）
  ipcMain.handle("diag:scanDids", async (_e, { start, end, ecu, da } = {}) => {
    if (!diagClient) return { ok: false, message: "未连接" };
    try {
      const found = await vehicle.scanDids(diagClient, {
        startHex: start, endHex: end, ecu, da,
        onProgress: (p) => logLine(`DID 扫描 ${p.scanned}/${p.total}，命中 ${p.found}`),
        onFound: (f) => logLine(`  命中 DID 0x${f.did} → ${f.hex}`),
        log: logLine
      });
      return { ok: true, found };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });

  // 读取某 ECU 身份 DID（多 ECU 探查，只读）
  ipcMain.handle("diag:readEcuInfo", async (_e, { ecu, da } = {}) => {
    if (!diagClient) return { ok: false, message: "未连接" };
    try {
      const info = await vehicle.readEcuInfo(diagClient, ecu != null ? ecu : da, { log: logLine });
      return { ok: true, info };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });

  // RS485 离线日志解码（粘贴 *_RS485.txt 文本或纯链路帧 hex）
  ipcMain.handle("rs485:decode", async (_e, { text, hex } = {}) => {
    try {
      const res = text ? rs485.decodeRs485Log(text) : rs485.decodeRs485LinkHex(hex || "");
      return { ok: true, ...res };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });

  // 写操作（必须 allowWrite，复刻红线）
  ipcMain.handle("diag:clearFaultCodes", async (_e, { ecu, da, allowWrite } = {}) => {
    if (!diagClient) return { ok: false, message: "未连接" };
    try {
      const r = await routines.clearFaultCodes(diagClient, { ecu, da, allowWrite, log: logLine });
      return { ok: r.ok, message: r.message, raw: r.raw };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });

  ipcMain.handle("diag:ecuReset", async (_e, { ecu, da, allowWrite } = {}) => {
    if (!diagClient) return { ok: false, message: "未连接" };
    try {
      const r = await routines.ecuReset(diagClient, { ecu, da, allowWrite, log: logLine });
      return { ok: r.ok, message: r.message, raw: r.raw };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });

  ipcMain.handle("diag:runRoutine", async (_e, { ecu, da, routineId, sub, data, allowWrite } = {}) => {
    if (!diagClient) return { ok: false, message: "未连接" };
    try {
      const r = await routines.runRoutine(diagClient, { ecu, da, routineId, sub, data, allowWrite, log: logLine });
      return { ok: r.ok, message: r.message, raw: r.raw };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (diagClient) { try { diagClient.close(); } catch (e) {} }
  if (process.platform !== "darwin") app.quit();
});
