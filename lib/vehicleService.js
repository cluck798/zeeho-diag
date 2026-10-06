// vehicleService.js — 车辆信息/故障码读取服务（还原自 ZeeCare WifiVehicleInfoService/WifiBaseService）
"use strict";
const P = require("./protocol");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 完整读取车辆信息（只读，安全）
 * 流程与官方一致：路由激活 → 心跳 → 逐条读 DID
 * @param {import('./diagClient').DiagClient} client
 */
async function readVehicleInfo(client, log = () => {}) {
  await client.connect();
  await client.routerActivation();
  client.startHeartbeat();

  const info = { vin: "", softwareVersion: "", partNumber: "", supplierName: "", totalMileage: null, imei: "", cardCount: null, clusterUuid: "" };

  // VIN
  try {
    const r = await client.diagnosticMessageWithRetry({ da: P.DOIP_TARGET_ADDRESS_VCDM, udsData: P.UDS.READ_VIN });
    info.vin = P.parseVin(r.udsData);
    log("VIN: " + info.vin);
  } catch (e) { log("读 VIN 失败: " + e.message); }
  await sleep(200);

  // 软件版本
  try {
    const r = await client.diagnosticMessageWithRetry({ da: P.DOIP_TARGET_ADDRESS_VCDM, udsData: P.UDS.READ_SOFTWARE_VERSION });
    info.softwareVersion = P.parseSoftwareVersion(r.udsData);
    log("软件版本: " + info.softwareVersion);
  } catch (e) { log("读软件版本失败: " + e.message); }
  await sleep(200);

  // 零件号
  try {
    const r = await client.diagnosticMessageWithRetry({ da: P.DOIP_TARGET_ADDRESS_VCDM, udsData: P.UDS.READ_PART_NUMBER });
    info.partNumber = P.parsePartNumber(r.udsData);
    log("零件号: " + info.partNumber);
  } catch (e) { log("读零件号失败: " + e.message); }
  await sleep(200);

  // 供应商
  try {
    const r = await client.diagnosticMessageWithRetry({ da: P.DOIP_TARGET_ADDRESS_VCDM, udsData: P.UDS.READ_SUPPLIER_NAME });
    info.supplierName = P.parseSupplierName(r.udsData);
    log("供应商: " + info.supplierName);
  } catch (e) { log("读供应商失败: " + e.message); }
  await sleep(200);

  // 总里程
  try {
    const r = await client.diagnosticMessageWithRetry({ da: P.DOIP_TARGET_ADDRESS_VCDM, udsData: P.UDS.READ_TOTAL_MILEAGE });
    const m = P.parseTotalMileage(r.udsData);
    info.totalMileage = m >= 0 ? m : null;
    log("总里程: " + info.totalMileage);
  } catch (e) { log("读总里程失败: " + e.message); }
  await sleep(200);

  // IMEI
  try {
    const r = await client.diagnosticMessageWithRetry({ da: P.DOIP_TARGET_ADDRESS_VCDM, udsData: P.UDS.READ_IMEI });
    info.imei = P.parseImei(r.udsData);
    log("IMEI: " + info.imei);
  } catch (e) { log("读 IMEI 失败: " + e.message); }
  await sleep(200);

  // NFC 卡数
  try {
    const r = await client.diagnosticMessageWithRetry({ da: P.DOIP_TARGET_ADDRESS_VCDM, udsData: P.UDS.READ_CARD_COUNT });
    const c = P.parseCardCount(r.udsData);
    info.cardCount = c >= 0 ? c : null;
    log("NFC 卡数: " + info.cardCount);
  } catch (e) { log("读 NFC 卡数失败: " + e.message); }

  return info;
}

/**
 * 检测 VCDM 节点是否在线（移植 checkVcdmNodeOnline）
 */
async function checkVcdmNodeOnline(client, log = () => {}) {
  try {
    await client.connect();
    await client.routerActivation();
    await client.diagnosticMessage({ da: P.DOIP_TARGET_ADDRESS_VCDM, udsData: P.UDS.RS485_NODE_ONLINE_CHECK_END, matchPattern: /710251/ });
    await sleep(200);
    const result = await client.diagnosticMessage({
      da: P.DOIP_TARGET_ADDRESS_VCDM,
      udsData: P.UDS.READ_FAULT_CODE_BY_STATUS_MASK,
      matchPattern: /[0-9a-fA-F]{26,28}590209|00010E00007F0111/
    });
    if (!result) return false;
    const diag = P.parseDiagData(result.slice(P.DOIP_HEADER_LENGTH));
    const hex = P.bytesToHex(diag.udsData);
    return /590209/.test(hex);
  } catch (e) {
    log("VCDM 在线检测失败: " + e.message);
    return false;
  }
}

/**
 * 读取故障码（19 02 09，按状态掩码）
 * 返回原始 UDS 响应字节（上层解析位流）
 */
async function readFaultCodes(client, log = () => {}) {
  try {
    await client.connect();
    await client.routerActivation();
    client.startHeartbeat();
    const r = await client.diagnosticMessageWithRetry({ da: P.DOIP_TARGET_ADDRESS_VCDM, udsData: P.UDS.READ_FAULT_CODE_BY_STATUS_MASK });
    return r.udsData;
  } catch (e) {
    log("读故障码失败: " + e.message);
    return [];
  }
}

/**
 * 读取实时数据（数据流）：对定义表中每一项发 UDS 0x22 读 DID，按脚本解析
 * @param {import('./diagClient').DiagClient} client
 * @param {Array} items lib/datastreams.js 中的定义项 {name,unit,did,idx,args,expr,fmt}
 * @param {object} opts { da: 目标地址(1=VCDM,2=MCU), timeout: 单条超时ms, onItem: 回调 }
 */
async function readDataStreams(client, items, opts = {}) {
  const { da = P.DOIP_TARGET_ADDRESS_MCU, timeout = 1000, onItem = null, log = () => {} } = opts;
  await client.connect();
  await client.routerActivation();
  client.startHeartbeat();

  const results = [];
  for (const it of items) {
    const did = parseInt(it.did, 16);
    const udsData = [0x22, (did >> 8) & 0xff, did & 0xff];
    let entry = { name: it.name, unit: it.unit, did: it.did, ok: false, value: null, raw: "" };
    const t0 = Date.now();
    try {
      const r = await client.diagnosticMessage({ da, udsData, matchPattern: new RegExp("62" + it.did, "i"), timeout });
      if (r) {
        const diag = P.parseDiagData(r.slice(P.DOIP_HEADER_LENGTH));
        const off = P.findReadDidResponseOffset(diag.udsData, did);
        if (off >= 0) {
          entry.raw = P.bytesToHex(diag.udsData);
          // 字节位置相对响应头起点（62 DIDH DIDL 之后即为数据区）
          const vals = (it.idx || []).map((i) => diag.udsData[off + i] != null ? diag.udsData[off + i] : 0);
          try {
            const fn = new Function(...(it.args || []), "return (" + it.expr + ");");
            let v = fn(...vals);
            if (typeof v === "number" && isFinite(v)) {
              v = /\.\d/.test(it.expr) || /%\.\d/.test(it.fmt || "") ? Number(v.toFixed(1)) : Math.round(v);
              entry.value = v;
            } else {
              entry.value = v;
            }
            entry.ok = entry.value !== null && entry.value !== undefined;
          } catch (e2) {
            log("解析失败 " + it.name + ": " + e2.message);
          }
        }
      }
    } catch (e) {
      entry.err = e.message;
    }
    entry.ms = Date.now() - t0;
    results.push(entry);
    if (onItem) onItem(entry);
  }
  return results;
}

/**
 * 原始 DID 读取（试验用）：发送 UDS 22 <DID>，返回完整 UDS 响应 hex
 */
async function readRawDid(client, didHex, opts = {}) {
  const { da = P.DOIP_TARGET_ADDRESS_MCU, timeout = 1200 } = opts;
  const did = parseInt(String(didHex).replace(/[^0-9a-fA-F]/g, "").slice(0, 4), 16);
  if (isNaN(did)) return { ok: false, message: "DID 无效" };
  await client.connect();
  await client.routerActivation();
  client.startHeartbeat();
  const udsData = [0x22, (did >> 8) & 0xff, did & 0xff];
  const r = await client.diagnosticMessage({ da, udsData, matchPattern: null, timeout });
  if (!r) return { ok: false, message: "无响应（超时）" };
  const diag = P.parseDiagData(r.slice(P.DOIP_HEADER_LENGTH));
  return { ok: true, hex: P.bytesToHex(diag.udsData), udsData: diag.udsData };
}

module.exports = { readVehicleInfo, checkVcdmNodeOnline, readFaultCodes, readDataStreams, readRawDid };
