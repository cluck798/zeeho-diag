// app.js — 渲染层逻辑
const $ = (id) => document.getElementById(id);

const state = { devices: [], selected: null, diagConnected: false };

function log(msg) {
  const box = $("logBox");
  const t = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  box.textContent += `[${t}] ${msg}\n`;
  box.scrollTop = box.scrollHeight;
  // 限制长度
  if (box.textContent.length > 60000) box.textContent = box.textContent.slice(-40000);
}

function setPill(text, cls) {
  const pill = $("connPill");
  pill.textContent = text;
  pill.className = "status-pill" + (cls ? " " + cls : "");
}

function setBusy(btn, busy, busyText) {
  if (busy) {
    btn.dataset.orig = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>' + (busyText || "处理中…");
  } else {
    btn.disabled = false;
    if (btn.dataset.orig) btn.textContent = btn.dataset.orig;
  }
}

// ---------- 日志订阅 ----------
window.diag.onLog((msg) => log(msg));
window.diag.onPdu((hex) => log("PDU " + hex));

// ---------- 步骤1：蓝牙扫描 ----------
$("btnBleScan").addEventListener("click", async () => {
  const btn = $("btnBleScan");
  setBusy(btn, true, "扫描中…");
  try {
    const devices = await window.diag.bleScan(12000);
    state.devices = devices;
    renderDevices();
    if (!devices.length) log("未发现车辆蓝牙广播。请确认车辆已开机，或手动输入蓝牙名/VIN。");
  } finally {
    setBusy(btn, false);
  }
});

function renderDevices() {
  const list = $("devList");
  list.innerHTML = "";
  for (const d of state.devices) {
    const el = document.createElement("div");
    el.className = "dev-item" + (state.selected === d.name ? " sel" : "");
    el.innerHTML = `<span>${d.name}</span><span class="rssi">RSSI ${d.rssi} dBm</span>`;
    el.addEventListener("click", () => selectDevice(d.name));
    list.appendChild(el);
  }
}

async function selectDevice(name) {
  state.selected = name;
  renderDevices();
  const cred = await window.diag.wifiCredentials({ deviceName: name });
  if (cred) {
    $("ssid").value = cred.ssid;
    $("pwd").value = cred.password;
    $("credHint").textContent = `已推导 WiFi 凭证：SSID=${cred.ssid}，密码=${cred.password}`;
    log(`由蓝牙名 ${name} 推导 WiFi：${cred.ssid} / ${cred.password}`);
  } else {
    $("credHint").textContent = "无法由该名称推导 WiFi 凭证（后缀不足 8 位）";
  }
}

$("btnManual").addEventListener("click", () => {
  const name = $("manualName").value.trim();
  if (!name) return;
  selectDevice(name);
});

$("btnVin").addEventListener("click", async () => {
  const vin = $("manualVin").value.trim();
  if (!vin) return;
  const cred = await window.diag.wifiCredentials({ vin });
  if (cred) {
    $("ssid").value = cred.ssid;
    $("pwd").value = cred.password;
    $("credHint").textContent = `已推导 WiFi 凭证：SSID=${cred.ssid}，密码=${cred.password}`;
    log(`由 VIN 推导 WiFi：${cred.ssid} / ${cred.password}`);
  } else {
    $("credHint").textContent = "VIN 至少需要 8 位";
  }
});

// ---------- 步骤2：WiFi ----------
$("btnWifiScan").addEventListener("click", async () => {
  const btn = $("btnWifiScan");
  setBusy(btn, true, "扫描中…");
  try {
    const nets = await window.diag.wifiScan();
    log("可见 ZEEHO 热点: " + (nets.length ? nets.join(", ") : "（无）"));
    if (nets.length === 1) $("ssid").value = nets[0];
  } finally {
    setBusy(btn, false);
  }
});

$("btnWifiConnect").addEventListener("click", async () => {
  const ssid = $("ssid").value.trim();
  const password = $("pwd").value;
  if (!ssid) { log("请填写 SSID"); return; }
  const btn = $("btnWifiConnect");
  setBusy(btn, true, "连接中…");
  try {
    const r = await window.diag.wifiConnect({ ssid, password });
    log(r.message);
    $("wifiTag").textContent = "WiFi: " + (r.ok ? "已连接 " + ssid : "未连接");
    $("wifiTag").className = "tag " + (r.ok ? "ok" : "err");
  } finally {
    setBusy(btn, false);
  }
});

$("btnWifiDisconnect").addEventListener("click", async () => {
  await window.diag.wifiDisconnect();
  $("wifiTag").textContent = "WiFi: 已断开";
  $("wifiTag").className = "tag";
  log("已断开 WiFi");
});

// 定时刷新 WiFi 状态
setInterval(async () => {
  try {
    const st = await window.diag.wifiStatus();
    if (st && st.ssid) {
      $("wifiTag").textContent = `WiFi: ${st.ssid} (${st.state})`;
      $("wifiTag").className = "tag " + (/已连接|Connected/i.test(st.state) ? "ok" : "");
    }
  } catch (e) {}
}, 5000);

// ---------- 步骤3：诊断 ----------
$("btnDiagConnect").addEventListener("click", async () => {
  const btn = $("btnDiagConnect");
  setBusy(btn, true, "连接中…");
  try {
    const r = await window.diag.diagConnect({});
    log(r.message);
    state.diagConnected = r.ok;
    setPill(r.ok ? "诊断已连接" : "诊断未连接", r.ok ? "ok" : "err");
  } finally {
    setBusy(btn, false);
  }
});

$("btnReadInfo").addEventListener("click", async () => {
  const btn = $("btnReadInfo");
  setBusy(btn, true, "读取中…");
  try {
    const r = await window.diag.readVehicleInfo();
    if (!r.ok) { log("读取失败: " + r.message); return; }
    const info = r.info;
    const kv = $("infoKv");
    kv.style.display = "grid";
    kv.innerHTML = "";
    const rows = [
      ["VIN 车架号", info.vin || "—"],
      ["软件版本", info.softwareVersion || "—"],
      ["零件号", info.partNumber || "—"],
      ["供应商", info.supplierName || "—"],
      ["总里程", info.totalMileage != null ? info.totalMileage.toFixed(1) + " km" : "—"],
      ["IMEI", info.imei || "—"],
      ["NFC 卡数", info.cardCount != null ? String(info.cardCount) : "—"]
    ];
    for (const [k, v] of rows) {
      kv.innerHTML += `<div class="k">${k}</div><div class="v">${v}</div>`;
    }
    log("车辆信息读取完成");
  } finally {
    setBusy(btn, false);
  }
});

$("btnCheckOnline").addEventListener("click", async () => {
  const btn = $("btnCheckOnline");
  setBusy(btn, true, "检测中…");
  try {
    const r = await window.diag.checkOnline();
    log("VCDM 节点: " + (r.online ? "在线" : "离线/无响应"));
  } finally {
    setBusy(btn, false);
  }
});

$("btnReadFault").addEventListener("click", async () => {
  const btn = $("btnReadFault");
  setBusy(btn, true, "读取中…");
  try {
    const r = await window.diag.readFaultCodes();
    if (r.ok) {
      $("faultRow").style.display = "flex";
      $("faultHex").textContent = r.hex || "（空响应）";
      log("故障码响应: " + (r.hex || "空"));
    } else {
      log("读故障码失败: " + r.message);
    }
  } finally {
    setBusy(btn, false);
  }
});

$("btnDiagDisconnect").addEventListener("click", async () => {
  await window.diag.diagDisconnect();
  state.diagConnected = false;
  setPill("未连接", "");
  log("已断开诊断连接");
});

// ---------- 步骤4：实时数据（数据流） ----------
let dsAutoTimer = null;
let dsReading = false;

async function readStreamsOnce() {
  if (dsReading) return;
  dsReading = true;
  const btn = $("btnDsRead");
  setBusy(btn, true, "读取中…");
  try {
    const r = await window.diag.readStreams({ group: $("dsGroup").value, da: $("dsTarget").value });
    if (!r.ok) { log("数据流读取失败: " + r.message); return; }
    renderStreams(r.items);
  } catch (e) {
    log("数据流读取异常: " + e.message);
  } finally {
    dsReading = false;
    setBusy(btn, false);
  }
}

function renderStreams(items) {
  const grid = $("dsGrid");
  grid.innerHTML = "";
  for (const it of items) {
    const hasVal = it.ok && it.value !== null && it.value !== undefined;
    const valText = hasVal ? String(it.value) : "—";
    const el = document.createElement("div");
    el.className = "ds-item" + (hasVal ? "" : " fail");
    el.innerHTML =
      `<div class="n">${it.name}<span class="did">${it.did}</span></div>` +
      `<div class="v">${valText}<small>${hasVal ? (it.unit || "") : ""}</small></div>`;
    el.title = it.raw ? "UDS 响应: " + it.raw : (it.err || "无响应");
    grid.appendChild(el);
  }
}

$("btnDsRead").addEventListener("click", readStreamsOnce);

$("btnDsAuto").addEventListener("click", () => {
  const btn = $("btnDsAuto");
  if (dsAutoTimer) {
    clearInterval(dsAutoTimer);
    dsAutoTimer = null;
    btn.textContent = "自动刷新: 关";
    return;
  }
  btn.textContent = "自动刷新: 开 (5s)";
  dsAutoTimer = setInterval(() => { readStreamsOnce(); }, 5000);
});

$("btnRawDid").addEventListener("click", async () => {
  const did = $("rawDid").value.trim();
  if (!did) return;
  const btn = $("btnRawDid");
  setBusy(btn, true, "读取中…");
  try {
    const r = await window.diag.readRawDid({ did, da: $("dsTarget").value });
    $("rawOut").textContent = r.ok ? r.hex : (r.message || "失败");
  } finally {
    setBusy(btn, false);
  }
});

setPill("未连接", "");
log("极核诊断工具已启动。步骤：1) 蓝牙扫描或手动输入 → 2) 连接车辆热点 → 3) 连接诊断接口并读取。");
