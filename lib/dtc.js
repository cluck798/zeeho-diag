// dtc.js — UDS 故障码解码（ISO 14229 / SAE J2012）
// 0x19 0x02 响应格式：59 02 <组掩码 1 字节> [3 字节 DTC + 1 字节状态] × N
// 3 字节 DTC = 2 字节故障码 + 1 字节故障类型(FTB)，例如 01 23 16 → P0123-16
// 仅做格式解码，不包含厂商故障码含义；含义需要厂商维修手册。
"use strict";

const SYSTEM_LETTERS = ["P", "C", "B", "U"];

// 状态字节位（ISO 14229-1 DTCStatus）
const STATUS_BITS = [
  [0x01, "当前故障"],
  [0x02, "本周期失败"],
  [0x04, "待定"],
  [0x08, "已确认"],
  [0x10, "清码后未测试"],
  [0x20, "清码后失败"],
  [0x40, "本周期未测试"],
  [0x80, "警告灯点亮"]
];

function toBytes(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => v & 0xff);
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Array.from(value, (v) => v & 0xff);
  return [];
}

function hex2(bytes) {
  return bytes.map((b) => (b < 16 ? "0" : "") + b.toString(16).toUpperCase()).join("");
}

/** 3 字节 DTC → "P0123-16"；不足 3 字节返回空串。 */
function decodeDtcCode(bytes) {
  const b = toBytes(bytes);
  if (b.length < 3) return "";
  const letter = SYSTEM_LETTERS[(b[0] >> 6) & 3];
  const firstDigit = (b[0] >> 4) & 3;
  const number = ((b[0] & 0x0f) << 8) | b[1];
  let hex = number.toString(16).toUpperCase();
  while (hex.length < 3) hex = "0" + hex;
  return `${letter}${firstDigit}${hex}-${hex2([b[2]])}`;
}

/** 状态字节 → ["当前故障", "已确认", ...] */
function decodeDtcStatus(statusByte) {
  const s = statusByte & 0xff;
  return STATUS_BITS.filter(([bit]) => (s & bit) !== 0).map(([, label]) => label);
}

/**
 * 解析 0x19 0x02 的正响应。
 * @param {number[]|Buffer} udsData 不含 DoIP 头的 UDS 数据
 * @returns {{supported:boolean, mask:number|null, dtcs:Array<{index:number, raw:string, code:string, statusByte:number, status:string[], statusText:string}>}}
 */
function parseDtcResponse(udsData) {
  const u = toBytes(udsData);
  const out = { supported: false, mask: null, dtcs: [] };
  if (u.length < 3 || u[0] !== 0x59 || u[1] !== 0x02) return out;
  out.supported = true;
  out.mask = u[2];
  for (let i = 3; i + 3 < u.length; i += 4) {
    const codeBytes = u.slice(i, i + 3);
    const statusByte = u[i + 3];
    const status = decodeDtcStatus(statusByte);
    out.dtcs.push({
      index: out.dtcs.length + 1,
      raw: hex2(codeBytes) + hex2([statusByte]),
      code: decodeDtcCode(codeBytes),
      statusByte,
      status,
      statusText: `0x${hex2([statusByte])}${status.length ? "（" + status.join("/") + "）" : ""}`
    });
  }
  return out;
}

/** 一行可读文本，例如 "DTC1  P0123-16  状态 0x2F（已确认/警告灯点亮）" */
function formatDtcLine(dtc) {
  return `DTC${dtc.index}  ${dtc.code}  状态 ${dtc.statusText}`;
}

module.exports = { decodeDtcCode, decodeDtcStatus, parseDtcResponse, formatDtcLine };
