// routines.js — 写类维修操作（复刻本项目 tools/rs485·diagpc 的「写类硬禁」红线）
//
// 安全模型（与本项目 AGENTS.md / docs 红线一致）：
//   * 默认禁止一切写操作。
//   * 每个写函数都必须显式传入 allowWrite:true，否则直接抛错——绝不悄悄放行。
//   * 不臆造 ABS 排气 / 胎压匹配所需的 routine ID；由调用方（已实测抓取到的）传入。
//   * 写操作会直接改变车辆状态，调用方 UI 必须弹确认、记录硬件/固件版本、遵循回滚指引。
"use strict";
const P = require("./protocol");
const ecus = require("./ecus");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function checkAllow(allowWrite, action) {
  if (!allowWrite) {
    throw new Error(`安全拦截：${action} 需要 allowWrite=true。写操作会直接改变车辆状态，请在确认风险后显式开启。`);
  }
}

function resolveDaOf(opts = {}) {
  if (opts.ecu) return ecus.resolveDa(opts.ecu);
  if (opts.da != null) return ecus.resolveDa(opts.da);
  return ecus.resolveDa(P.DOIP_TARGET_ADDRESS_VCDM);
}

/**
 * 清除故障码（UDS 0x14 FF FF FF，清除所有 DTC）。
 * @returns {Promise<{ok:boolean, message:string, raw:string}>}
 */
async function clearFaultCodes(client, opts = {}) {
  const { allowWrite = false, ecu = null, da = null, timeout = 1500, log = () => {} } = opts;
  checkAllow(allowWrite, "清除故障码");
  const info = resolveDaOf({ ecu, da });
  if (info.warn) log("⚠ " + info.warn);
  await client.connect();
  await client.routerActivation();
  client.startHeartbeat();
  const udsData = [0x14, 0xff, 0xff, 0xff];
  const r = await client.diagnosticMessage({ da: info.da, udsData, matchPattern: null, timeout });
  if (!r) return { ok: false, message: "无响应（超时）", raw: "" };
  const diag = P.parseDiagData(r.slice(P.DOIP_HEADER_LENGTH));
  const hex = P.bytesToHex(diag.udsData);
  // 0x54 = 0x14 正响应；0x7F = 负响应
  const ok = /^54/.test(hex);
  log(ok ? "清除故障码：正响应" : "清除故障码：负响应 " + hex);
  return { ok, message: ok ? "已清除" : "被拒绝 " + hex, raw: hex };
}

/**
 * ECU 复位（UDS 0x11 0x01 硬复位）。
 */
async function ecuReset(client, opts = {}) {
  const { allowWrite = false, ecu = null, da = null, timeout = 1500, log = () => {} } = opts;
  checkAllow(allowWrite, "ECU 复位");
  const info = resolveDaOf({ ecu, da });
  if (info.warn) log("⚠ " + info.warn);
  await client.connect();
  await client.routerActivation();
  client.startHeartbeat();
  const udsData = [0x11, 0x01];
  const r = await client.diagnosticMessage({ da: info.da, udsData, matchPattern: null, timeout });
  if (!r) return { ok: false, message: "无响应（超时）", raw: "" };
  const diag = P.parseDiagData(r.slice(P.DOIP_HEADER_LENGTH));
  const hex = P.bytesToHex(diag.udsData);
  const ok = /^51/.test(hex); // 0x51 = 0x11 正响应
  log(ok ? "ECU 复位：正响应" : "ECU 复位：负响应 " + hex);
  return { ok, message: ok ? "已复位" : "被拒绝 " + hex, raw: hex };
}

/**
 * 通用例程控制（UDS 0x31）。用于 ABS 排气 / 胎压匹配等——routine ID 必须由调用方提供
 * （来自实测抓包），本模块不臆造任何厂商私有 routine ID。
 * @param {object} opts { routineId:'0201', sub='01'(start)|'02'(stop)|'03'(result), data?:[], ecu?, da?, allowWrite }
 */
async function runRoutine(client, opts = {}) {
  const { allowWrite = false, routineId, sub = "01", ecu = null, da = null, data = [], timeout = 2000, log = () => {} } = opts;
  checkAllow(allowWrite, "例程控制(0x31)");
  if (!routineId || !/^[0-9a-fA-F]{4}$/.test(routineId.trim())) {
    throw new Error("必须提供 4 位十六进制 routine ID（来自实测抓包），例如 0201。");
  }
  const rid = parseInt(routineId.trim(), 16);
  const subByte = parseInt(sub, 16);
  const info = resolveDaOf({ ecu, da });
  if (info.warn) log("⚠ " + info.warn);
  await client.connect();
  await client.routerActivation();
  client.startHeartbeat();
  const udsData = [0x31, subByte, (rid >> 8) & 0xff, rid & 0xff, ...(data || [])];
  const r = client.diagnosticMessage ? await client.diagnosticMessage({ da: info.da, udsData, matchPattern: null, timeout }) : null;
  if (!r) return { ok: false, message: "无响应（超时）", raw: "" };
  const diag = P.parseDiagData(r.slice(P.DOIP_HEADER_LENGTH));
  const hex = P.bytesToHex(diag.udsData);
  const ok = new RegExp("^71" + sub).test(hex); // 0x71 = 0x31 正响应
  log(ok ? `例程 ${routineId} (0x${sub}): 正响应` : `例程 ${routineId}: 负响应 ${hex}`);
  return { ok, message: ok ? "例程响应" : "被拒绝 " + hex, raw: hex };
}

module.exports = { clearFaultCodes, ecuReset, runRoutine, checkAllow };
