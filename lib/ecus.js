// ecus.js — ZEEHO ECU 全景登记表（汇集本项目 research 成果）
//
// 来源：
//   * ZeeCare 逆向（zeeho-diag 既有）：VCDM=1 / MCU=2 为 DoIP 逻辑地址（已在真机验证）
//   * tools/diagpc/doip.py + docs/10、docs/14：各 ECU 的 CAN 逻辑地址（实测/文档，未验证网关是否接受）
//
// 关键事实（docs/14 实证）：
//   * RS485 总线（OBD 针 7/15 @115200 8N1）是主通道；CAN 500k 是旁路。
//   * RS485 上跑的是私协议 `43 46 … 45 44`（见 lib/rs485.js），不是 UDS；
//     WiFi/DoIP 通道才是 UDS（0x22 读 DID 等）。本表同时收录两条路径的地址。
//
// 寻址模型说明：
//   * `doipDa` = ZeeCare 的 DoIP 诊断消息目标逻辑地址（仅 VCDM/MCU 已验证）。
//   * `canId`  = CAN 侧逻辑地址（docs 实测），是 RS485/CAN 总线上各 ECU 的真实地址。
//   * 其它 ECU 的 `doipDa` 未知——resolveDa 会返回 canId 并打 `verified:false` 警告，
//     让用户自行尝试，绝不臆造一个地址。
"use strict";

// ---------- ECU 登记表 ----------
// 字段：key 唯一键；label 中文名；role 职责；doipDa DoIP逻辑地址(或null)；canReq/canRes CAN地址；verified 是否已在DoIP验证；note
const ECUS = [
  {
    key: "vcdm", label: "VCDM 整车控制器", role: "车辆中央诊断网关/身份聚合",
    doipDa: 1, canReq: null, canRes: null, verified: true,
    note: "ZeeCare DoIP 逻辑地址 1；承载 VIN/软件版本/零件号/供应商/里程/IMEI/NFC卡数 等身份 DID。"
  },
  {
    key: "mcu", label: "MCU 电机控制器", role: "电机驱动/FOC/扭矩",
    doipDa: 2, canReq: 0x721, canRes: 0x7A1, verified: true,
    note: "ZeeCare DoIP 逻辑地址 2；CAN 0x721/0x7A1（docs/10）。datastreams 的 mcu/mcuLite 组落在此 ECU。"
  },
  {
    key: "dash", label: "DASH 仪表", role: "仪表/整车显示",
    doipDa: null, canReq: 0x714, canRes: 0x794, verified: false,
    note: "CAN 0x714/0x794（doip.py）。DoIP 逻辑地址未知，未验证网关是否接受。"
  },
  {
    key: "labms", label: "LABMS 低压电池管理", role: "12V 蓄电池管理",
    doipDa: null, canReq: 0x722, canRes: 0x7A2, verified: false,
    note: "CAN 0x722/0x7A2（doip.py）。DoIP 逻辑地址未知。"
  },
  {
    key: "bms", label: "BMS 动力电池管理", role: "高压电池包/单体/SOC/SOH",
    doipDa: null, canReq: null, canRes: null, verified: false,
    note: "datastreams 的 bms/bms2/vcu 组（DID 0D37~0D63）落在此类 ECU。具体 CAN 地址 docs 未单列，需扫描确认。"
  },
  {
    key: "bms2", label: "BMS2 副电池管理", role: "第二电池管理节点",
    doipDa: null, canReq: 0x723, canRes: null, verified: false,
    note: "CAN 0x723（doip.py）。"
  },
  {
    key: "chg", label: "CHG 充电机", role: "车载充电机/充电协商",
    doipDa: null, canReq: 0x724, canRes: null, verified: false,
    note: "CAN 0x724（doip.py）。"
  },
  {
    key: "abs", label: "ABS 防抱死制动", role: "制动防抱死/ABS排气",
    doipDa: null, canReq: 0x7E1, canRes: 0x7E9, verified: false,
    note: "CAN 0x7E1/0x7E9（doip.py）。ABS 排气例程(0x31)落在此 ECU；routine ID 需实测抓取，未硬编码。"
  },
  {
    key: "tbox", label: "TBOX 联网盒", role: "蜂窝联网/远程",
    doipDa: null, canReq: 0x717, canRes: null, verified: false,
    note: "CAN 0x717（doip.py）。"
  },
  {
    key: "brs", label: "BRS 后雷达", role: "倒车雷达",
    doipDa: null, canReq: 0x727, canRes: null, verified: false,
    note: "CAN 0x727（doip.py）。对应 RS485 应用 cmd 0x8B（后雷达）。"
  }
];

const ECU_BY_KEY = Object.fromEntries(ECUS.map((e) => [e.key, e]));

// ZeeCare 已验证的 DoIP 逻辑地址 → ECU（用于反向解析）
const ECU_BY_DOIP = Object.fromEntries(
  ECUS.filter((e) => e.doipDa != null).map((e) => [e.doipDa, e])
);

/**
 * 解析目标地址。
 * 接受：ECU key（如 "abs"）、数字 DoIP 逻辑地址（如 2）、或 0x 字符串。
 * 返回 { da, canReq, canRes, verified, label, key, warn }
 *   da: 实际用于 DoIP 诊断消息的目标地址（优先 doipDa，否则回退 canReq）
 *   warn: 非空表示该研究地址未经真机验证
 */
function resolveDa(input) {
  let da = null;
  let ecu = null;
  let warn = "";

  if (input == null) {
    return { da: 1, canReq: null, canRes: null, verified: true, label: "VCDM(默认)", key: "vcdm", warn: "" };
  }
  if (typeof input === "string") {
    const s = input.trim().toLowerCase();
    if (ECU_BY_KEY[s]) ecu = ECU_BY_KEY[s];
    else if (/^0x[0-9a-f]+$/.test(s)) da = parseInt(s, 16);
    else if (/^\d+$/.test(s)) da = parseInt(s, 10);
  } else if (typeof input === "number") {
    da = input;
  }

  if (ecu) {
    da = ecu.doipDa != null ? ecu.doipDa : ecu.canReq;
    if (ecu.doipDa == null) {
      warn = `「${ecu.label}」的 DoIP 逻辑地址未知（仅 CAN 地址 0x${(ecu.canReq || 0).toString(16).toUpperCase()} 已知，未验证网关是否接受此地址）`;
    }
    return {
      da, canReq: ecu.canReq, canRes: ecu.canRes,
      verified: ecu.verified, label: ecu.label, key: ecu.key, warn
    };
  }

  if (da != null) {
    const known = ECU_BY_DOIP[da];
    if (known) {
      return { da, canReq: known.canReq, canRes: known.canRes, verified: true, label: known.label, key: known.key, warn: "" };
    }
    warn = `DoIP 逻辑地址 ${da} 不在已验证表(1=VCDM,2=MCU)内，按原始地址下发，可能无响应。`;
    return { da, canReq: null, canRes: null, verified: false, label: `DA=${da}`, key: null, warn };
  }
  return { da: 1, canReq: null, canRes: null, verified: true, label: "VCDM(默认)", key: "vcdm", warn: "" };
}

/** 返回前台展示用的登记表（隐藏内部实现细节） */
function listEcus() {
  return ECUS.map((e) => ({
    key: e.key, label: e.label, role: e.role,
    doipDa: e.doipDa, canReq: e.canReq, canRes: e.canRes,
    verified: e.verified, note: e.note
  }));
}

module.exports = { ECUS, ECU_BY_KEY, resolveDa, listEcus };
