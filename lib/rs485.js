// rs485.js — ZEEHO RS485 私协议解码器（移植自 tools/rs485/decode-rs485log.py + docs/14 实证）
//
// 两条层：
//   1) 链路帧（固定 15 字节）：AB 00 | 0B 00 | cmd q_hi q_lo 02 | 00 00 00 00 | 00 | D | XOR
//      - 第 13 字节 D 就是应用层字节流的一个字节
//      - XOR = bytes[0..13] 逐字节异或，存于第 14 字节
//   2) 应用帧（把全部 D 拼起来）：43 46 | cmd | len | data[len] | chk | 45 44
//      - chk = (cmd + len + Σdata) & 0xFF
//
// 这是 RS485 总线（OBD 针 7/15 @115200 8N1）上跑的协议，与 WiFi/DoIP 的 UDS 完全不同。
// 本模块为纯函数、无 I/O，桌面端 / iOS-bridge / Android 均可复用，且可直接对离线抓包做解码。
"use strict";

const LINK_LEN = 15;            // 链路帧字节数
const LINK_MAGIC = 0xAB;        // 帧头
const APP_HEAD = Buffer.from([0x43, 0x46]); // "CF"
const APP_TAIL = Buffer.from([0x45, 0x44]); // "ED"

// 系统码（README 协议速览，cmd 字节的语义分类）
const RS485_SYSTEM_CODES = {
  0x49: "计量器",
  0x51: "BMS 电池",
  0x59: "MCU 电机",
  0x81: "仪表整车",
  0x89: "TBOX",
  0x8B: "后雷达"
};

// 已实测命令码（docs/14 §5.2 + README 协议速览合并）
const RS485_CMD_NAMES = {
  0x17: "状态双字节(上行)",
  0x41: "状态块(上行,含204dfd)",
  0x49: "状态块(上行)",
  0x51: "状态块(上行)",
  0x59: "状态块(上行)",
  0x71: "触发/写确认(下行)",
  0x80: "逐块读取请求(下行)",
  0x81: "状态块(上行)",
  0x83: "回读块(上行)",
  0x85: "状态块(上行,首4B 00 00 04 20)",
  0x88: "VIN 块(上行)",
  0x8B: "参数块(上行)",
  0x8D: "参数块(上行)",
  0x89: "诊断仪下发寄存器块(下行,64B)",
  0x97: "UTF-8 中文地址(上行,129B)"
};

function describeCmd(cmd) {
  if (RS485_CMD_NAMES[cmd]) return RS485_CMD_NAMES[cmd];
  if (RS485_SYSTEM_CODES[cmd]) return RS485_SYSTEM_CODES[cmd];
  return "未知(0x" + cmd.toString(16).toUpperCase() + ")";
}

function toBytes(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (typeof input === "string") {
    const h = input.replace(/[^0-9A-Fa-f]/g, "");
    if (h.length % 2 !== 0) throw new Error("十六进制长度必须为偶数");
    return Buffer.from(h, "hex");
  }
  throw new Error("不支持的输入类型");
}

// ---------- 链路帧 ----------
function parseLinkFrame(input) {
  const b = toBytes(input);
  if (b.length !== LINK_LEN) {
    return { valid: false, reason: `长度 ${b.length} ≠ ${LINK_LEN}`, xorOk: false, cmd: null, q: null, d: null };
  }
  let xor = 0;
  for (let i = 0; i < LINK_LEN - 1; i++) xor ^= b[i];
  const xorOk = xor === b[LINK_LEN - 1];
  return {
    valid: true,
    xorOk,
    cmd: b[4],
    q: (b[5] << 8) | b[6],
    d: b[13],
    headOk: b[0] === LINK_MAGIC && b[1] === 0x00 && b[2] === 0x0b && b[3] === 0x00
  };
}

// 把若干链路帧的第 13 字节(D)拼成应用层字节流
function reassembleStream(linkFrames) {
  const out = [];
  for (const f of linkFrames) {
    const b = toBytes(f);
    if (b.length === LINK_LEN) out.push(b[13]);
  }
  return Buffer.from(out);
}

// ---------- 应用帧 ----------
// 在字节流中切出 43 46 … 45 44 应用帧（允许误锚点，用长度+结束符+校验和消歧）
function parseAppFrames(stream) {
  const s = toBytes(stream);
  const frames = [];
  let i = 0;
  const n = s.length;
  while (true) {
    const j = s.indexOf(APP_HEAD, i);
    if (j < 0 || j + 4 > n) break;
    const len = s[j + 3];
    const end = j + 4 + len + 1 + 2; // hdr4 + data + chk1 + tail2
    if (len === 0 || end > n) { i = j + 2; continue; }
    if (s.slice(end - 2, end).equals(APP_TAIL) === false) { i = j + 2; continue; }
    const cmd = s[j + 2];
    const data = s.slice(j + 4, j + 4 + len);
    const chk = s[j + 4 + len];
    const expect = (cmd + len + sum(data)) & 0xff;
    frames.push({
      offset: j,
      cmd,
      cmdName: describeCmd(cmd),
      len,
      data: Buffer.from(data),
      chk,
      chkOk: chk === expect
    });
    i = end;
  }
  return frames;
}

function sum(buf) {
  let t = 0;
  for (const x of buf) t += x;
  return t;
}

// ---------- 离线日志解码（*_RS485.txt 格式：ts | hex）----------
// 每行一帧 15 字节（30 hex）。复用 decode-rs485log.py 的同款逻辑。
function decodeRs485Log(text) {
  const linkFrames = [];
  let xorErrors = 0;
  const lines = String(text || "").split(/\r?\n/);
  for (const line of lines) {
    const s = line.trim();
    if (!s.includes("|")) continue;
    const hexPart = s.split("|").slice(1).join("|");
    const hx = hexPart.replace(/[^0-9A-Fa-f]/g, "");
    if (hx.length !== LINK_LEN * 2) continue;
    const bytes = Buffer.from(hx, "hex");
    const f = parseLinkFrame(bytes);
    if (!f.xorOk) xorErrors++;
    linkFrames.push(bytes);
  }
  const stream = reassembleStream(linkFrames);
  const appFrames = parseAppFrames(stream);
  const cmdDist = {};
  for (const fr of appFrames) {
    const k = "0x" + fr.cmd.toString(16).toUpperCase();
    cmdDist[k] = (cmdDist[k] || 0) + 1;
  }
  return {
    linkFrames: linkFrames.length,
    xorErrors,
    streamBytes: stream.length,
    appFrames: appFrames.length,
    cmdDistribution: cmdDist,
    frames: appFrames // 明细
  };
}

// 把"连续的链路帧十六进制"（每 30 hex = 一帧）直接解码
function decodeRs485Hex(hexString) {
  return decodeRs485Log(hexString); // 格式兼容（按 | 缺失跳过，纯 hex 也行？下面兜底）
}

// 若输入是一整段纯 hex（无 | 分隔），按 30 hex 切块当链路帧
function decodeRs485LinkHex(hexString) {
  const hx = String(hexString).replace(/[^0-9A-Fa-f]/g, "");
  const linkFrames = [];
  let xorErrors = 0;
  for (let i = 0; i + LINK_LEN * 2 <= hx.length; i += LINK_LEN * 2) {
    const bytes = Buffer.from(hx.slice(i, i + LINK_LEN * 2), "hex");
    const f = parseLinkFrame(bytes);
    if (!f.xorOk) xorErrors++;
    linkFrames.push(bytes);
  }
  const stream = reassembleStream(linkFrames);
  const appFrames = parseAppFrames(stream);
  return { linkFrames: linkFrames.length, xorErrors, appFrames: appFrames.length, frames: appFrames };
}

module.exports = {
  LINK_LEN, APP_HEAD, APP_TAIL,
  RS485_SYSTEM_CODES, RS485_CMD_NAMES, describeCmd,
  parseLinkFrame, reassembleStream, parseAppFrames,
  decodeRs485Log, decodeRs485Hex, decodeRs485LinkHex
};
