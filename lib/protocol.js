// protocol.js — ZEEHO 车端诊断协议核心层（还原自 ZeeCare 1.1.1 app-service.js）
// 包含：DoIP(ISO 13400) PDU 构造/解析、ISO-TP 封帧/拆帧、UDS 指令表、安全访问算法
"use strict";

// ---------- 字节工具 ----------
function readUint8(data, offset) {
  if (offset >= data.length) return 0;
  return data[offset] & 255;
}
function readUint16BE(data, offset) {
  if (offset + 1 >= data.length) return 0;
  return ((data[offset] & 255) << 8) | (data[offset + 1] & 255);
}
function readUint32BE(data, offset) {
  if (offset + 3 >= data.length) return 0;
  return (data[offset] & 255) * 16777216 + ((data[offset + 1] & 255) << 16) + ((data[offset + 2] & 255) << 8) + (data[offset + 3] & 255);
}
function writeUint8(data, offset, value) {
  data[offset] = value & 255;
}
function writeUint16BE(data, offset, value) {
  data[offset] = (value >> 8) & 255;
  data[offset + 1] = value & 255;
}
function writeUint32BE(data, offset, value) {
  data[offset] = (value >>> 24) & 255;
  data[offset + 1] = (value >>> 16) & 255;
  data[offset + 2] = (value >>> 8) & 255;
  data[offset + 3] = value & 255;
}
function bytesToHex(data) {
  let hex = "";
  for (let i = 0; i < data.length; i++) {
    const b = data[i] & 255;
    hex += (b < 16 ? "0" : "") + b.toString(16).toUpperCase();
  }
  return hex;
}
function hexToBytes(hex) {
  const result = [];
  for (let i = 0; i + 1 < hex.length; i += 2) {
    result.push(parseInt(hex.substr(i, 2), 16));
  }
  return result;
}
function bytesToAscii(data, start, len) {
  let s = "";
  for (let i = start; i < start + len && i < data.length; i++) {
    s += String.fromCharCode(data[i] & 255);
  }
  return s;
}

// ---------- DoIP 常量 ----------
const DOIP_TARGET_ADDRESS_VCDM = 1;
const DOIP_TARGET_ADDRESS_MCU = 2;
const DOIP_TARGET_ADDRESS_ALL = 65535;
const DOIP_VERSION_ISO_2019 = 3;
const DOIP_VERSION_DEFAULT = DOIP_VERSION_ISO_2019;
const DOIP_VERSION_VID_REQUEST = 255;
const DOIP_HEADER_LENGTH = 8;
const PAYLOAD_TYPE_ROUTE_ACTIVE_REQ = 5;
const PAYLOAD_TYPE_TCP_ALIVE_CHECK_REQ = 7;
const PAYLOAD_TYPE_DIAGNOSTIC_MESSAGE = 32769; // 0x8001
const ROUTE_TYPE_CAN = 1;
const ROUTE_PRIORITY_NORMAL = 0;
const DOIP_LENGTH_ROUTE_ACTIVE_REQ = 12;
const DOIP_LENGTH_DIAGNOSTIC_MESSAGE_HEADER = 4;
// 诊断仪源地址（ZeeCare 实测：0x0E00 = 3584）
const DOIP_SOURCE_ADDRESS = 3584;

// ---------- UDS DID 与指令表 ----------
const UDS_SERVICE_READ_DATA_BY_IDENTIFIER_RESPONSE = 98; // 0x62
const UDS_DID_PART_NUMBER = 61831;    // 0xF187
const UDS_DID_VIN = 61840;            // 0xF190
const UDS_DID_SUPPLIER_NAME = 61834;  // 0xF18A
const UDS_DID_CLUSTER_UUID = 61837;   // 0xF18D
const UDS_DID_SOFTWARE_VERSION = 61845; // 0xF195
const UDS_DID_TOTAL_MILEAGE = 61953;  // 0xF201
const UDS_DID_CARD_COUNT = 1539;      // 0x0603

const UDS = {
  READ_CLUSTER_UUID: [3, 34, (UDS_DID_CLUSTER_UUID >> 8) & 255, UDS_DID_CLUSTER_UUID & 255],
  READ_VIN: [3, 34, (UDS_DID_VIN >> 8) & 255, UDS_DID_VIN & 255],
  READ_SOFTWARE_VERSION: [3, 34, (UDS_DID_SOFTWARE_VERSION >> 8) & 255, UDS_DID_SOFTWARE_VERSION & 255],
  READ_SUPPLIER_NAME: [3, 34, (UDS_DID_SUPPLIER_NAME >> 8) & 255, UDS_DID_SUPPLIER_NAME & 255],
  READ_PART_NUMBER: [3, 34, (UDS_DID_PART_NUMBER >> 8) & 255, UDS_DID_PART_NUMBER & 255],
  READ_IMEI: [3, 34, 7, 0],
  READ_CARD_COUNT: [3, 34, 6, 3],
  READ_TOTAL_MILEAGE: [3, 34, (UDS_DID_TOTAL_MILEAGE >> 8) & 255, UDS_DID_TOTAL_MILEAGE & 255],
  ECU_RESET_HARD: [2, 17, 1],
  CLEAR_FAULT_CODE_ALL: [4, 20, 255, 255, 255],
  READ_FAULT_CODE_BY_STATUS_MASK: [3, 25, 2, 9],
  RS485_READ_FAULT_CODE: [5, 49, 1, 81, 0, 5],
  RS485_NODE_ONLINE_CHECK: [5, 1, 81, 0, 5],
  RS485_NODE_ONLINE_CHECK_END: [4, 49, 2, 81, 0],
  EXTENDED_SESSION: [16, 3],      // 0x10 0x03
  SECURITY_SEED: [39, 1],         // 0x27 0x01
  // 0x27 0x02 + key[4] 由 secureSessionKeys 动态构造
};

// ---------- DoIP PDU 构造 ----------
function buildDoipHeader(payloadType, payloadLength, version = DOIP_VERSION_DEFAULT) {
  const header = new Uint8Array(DOIP_HEADER_LENGTH);
  writeUint8(header, 0, version);
  writeUint8(header, 1, ~version & 255);
  writeUint16BE(header, 2, payloadType);
  writeUint32BE(header, 4, payloadLength);
  return header;
}
function buildDoipPdu(payloadType, payloadBytes, version = DOIP_VERSION_DEFAULT) {
  const header = buildDoipHeader(payloadType, payloadBytes.length, version);
  return Buffer.concat([Buffer.from(header), Buffer.from(payloadBytes)]);
}
function buildRouteActivationReqPdu({ sourceAddress = DOIP_SOURCE_ADDRESS, destAddress = DOIP_TARGET_ADDRESS_VCDM, routeType = ROUTE_TYPE_CAN, routePriority = ROUTE_PRIORITY_NORMAL, routeTimeout = 30 } = {}) {
  const payload = new Uint8Array(DOIP_LENGTH_ROUTE_ACTIVE_REQ);
  writeUint16BE(payload, 0, sourceAddress);
  writeUint16BE(payload, 2, destAddress);
  writeUint8(payload, 4, routeType);
  writeUint8(payload, 5, routePriority);
  writeUint16BE(payload, 10, routeTimeout);
  return buildDoipPdu(PAYLOAD_TYPE_ROUTE_ACTIVE_REQ, payload);
}
function buildRouteAliveCheckReqPdu(opts = {}) {
  const payload = new Uint8Array(DOIP_LENGTH_ROUTE_ACTIVE_REQ);
  writeUint16BE(payload, 0, opts.sourceAddress != null ? opts.sourceAddress : DOIP_SOURCE_ADDRESS);
  writeUint16BE(payload, 2, opts.destAddress != null ? opts.destAddress : DOIP_TARGET_ADDRESS_VCDM);
  writeUint8(payload, 4, opts.routeType != null ? opts.routeType : ROUTE_TYPE_CAN);
  writeUint8(payload, 5, opts.routePriority != null ? opts.routePriority : ROUTE_PRIORITY_NORMAL);
  writeUint16BE(payload, 10, opts.routeTimeout != null ? opts.routeTimeout : 30);
  return buildDoipPdu(PAYLOAD_TYPE_TCP_ALIVE_CHECK_REQ, payload);
}
function buildDiagnosticMessagePdu(sa, ta, udsData) {
  const payload = new Uint8Array(DOIP_LENGTH_DIAGNOSTIC_MESSAGE_HEADER);
  writeUint16BE(payload, 0, sa);
  writeUint16BE(payload, 2, ta);
  return buildDoipPdu(PAYLOAD_TYPE_DIAGNOSTIC_MESSAGE, [...payload, ...udsData]);
}

// ---------- DoIP 解析 ----------
function isSupportedVersion(version) {
  return version === 1 || version === 2 || version === 3 || version === DOIP_VERSION_VID_REQUEST;
}
function parseDoipHeader(data) {
  if (data.length < DOIP_HEADER_LENGTH) return { valid: false, version: 0, payloadType: 0, payloadLength: 0 };
  const version = readUint8(data, 0);
  const inverseVersion = readUint8(data, 1);
  const payloadType = readUint16BE(data, 2);
  const payloadLength = readUint32BE(data, 4);
  const valid = version === DOIP_VERSION_VID_REQUEST ? true : ((version ^ inverseVersion) === 255 && isSupportedVersion(version));
  return { valid, version, inverseVersion, payloadType, payloadLength };
}
// 从 TCP 字节流缓存中切出完整 DoIP PDU（移植 extractCompleteDoipPdus）
function extractCompleteDoipPdus(buffer) {
  const packets = [];
  let offset = 0;
  while (offset + DOIP_HEADER_LENGTH <= buffer.length) {
    const header = parseDoipHeader(buffer.slice(offset, offset + DOIP_HEADER_LENGTH));
    if (!header.valid) { offset += 1; continue; }
    const packetLength = DOIP_HEADER_LENGTH + header.payloadLength;
    if (offset + packetLength > buffer.length) break;
    packets.push(buffer.slice(offset, offset + packetLength));
    offset += packetLength;
  }
  return { packets, remaining: buffer.slice(offset) };
}
// 解析诊断消息载荷（DoIP payload 部分）
function parseDiagData(payload) {
  return {
    sourceAddress: readUint16BE(payload, 0),
    destAddress: readUint16BE(payload, 2),
    fragmentFlag: readUint8(payload, 4),
    fragmentNumber: readUint16BE(payload, 6),
    udsData: Array.from(payload.slice(8))
  };
}

// ---------- ISO-TP ----------
function buildIsoTpSingleFrame(data) {
  if (data.length > 7) throw new Error("单帧数据不能超过7字节，请使用首帧+连续帧");
  const result = new Uint8Array(8);
  result[0] = data.length;
  for (let i = 0; i < data.length; i++) result[1 + i] = data[i];
  return result;
}
function buildIsoTpFlowControlFrame(blockSize = 0, stMin = 0) {
  const result = new Uint8Array(8);
  result[0] = 48;
  result[1] = blockSize & 255;
  result[2] = stMin & 255;
  return result;
}
// 多帧重组（移植 parseIsoTpResponse）：frames 为 ISO-TP 帧数组
function parseIsoTpResponse(frames) {
  const result = [];
  let totalLen = 0;
  let receivedLen = 0;
  let isFirst = true;
  for (const frame of frames) {
    if (frame.length < 1) continue;
    const pci = frame[0];
    if (isFirst) {
      if ((pci & 240) === 0) {
        const len = pci & 15;
        for (let j = 0; j < len && j + 1 < frame.length; j++) result.push(frame[1 + j]);
        break;
      } else if ((pci & 240) === 16) {
        totalLen = ((pci & 15) << 8) | (frame[1] & 255);
        for (let j = 0; j < 6 && j + 2 < frame.length; j++) result.push(frame[2 + j]);
        receivedLen = Math.min(6, totalLen);
        isFirst = false;
      }
    } else {
      if ((pci & 240) === 32) {
        const remaining = totalLen - receivedLen;
        const chunkLen = Math.min(7, remaining);
        for (let j = 0; j < chunkLen && j + 1 < frame.length; j++) result.push(frame[1 + j]);
        receivedLen += chunkLen;
        if (receivedLen >= totalLen) break;
      } else if (pci === 48) {
        continue; // 流控帧跳过
      }
    }
  }
  if (result.length === 0) return null;
  const outLen = totalLen > 0 ? Math.min(totalLen, result.length) : result.length;
  return result.slice(0, outLen);
}

// ---------- UDS 响应解析 ----------
function findReadDidResponseOffset(udsData, did) {
  if (udsData.length < 3) return -1;
  const didHigh = (did >> 8) & 255;
  const didLow = did & 255;
  for (let offset = 0; offset <= udsData.length - 3; offset++) {
    if (udsData[offset] === UDS_SERVICE_READ_DATA_BY_IDENTIFIER_RESPONSE && udsData[offset + 1] === didHigh && udsData[offset + 2] === didLow) {
      return offset;
    }
  }
  return -1;
}
function getReadDidResponseDataBytes(udsData, did) {
  const offset = findReadDidResponseOffset(udsData, did);
  if (offset < 0) return [];
  const dataStart = offset + 3;
  if (udsData.length <= dataStart) return [];
  return udsData.slice(dataStart);
}
function parseReadDidAsciiValue(udsData, did) {
  const offset = findReadDidResponseOffset(udsData, did);
  if (offset < 0) return "";
  const dataStart = offset + 3;
  if (udsData.length <= dataStart) return "";
  return bytesToAscii(udsData, dataStart, udsData.length - dataStart);
}
function parseReadDidUnsignedValue(udsData, did) {
  const dataBytes = getReadDidResponseDataBytes(udsData, did);
  if (dataBytes.length === 0) return -1;
  let value = 0;
  for (const b of dataBytes) value = (value << 8) | (b & 255);
  return value;
}
function parseVin(udsData) {
  const vin = parseReadDidAsciiValue(udsData, UDS_DID_VIN);
  return vin.length !== 17 ? "" : vin;
}
function parseSoftwareVersion(udsData) {
  return parseReadDidAsciiValue(udsData, UDS_DID_SOFTWARE_VERSION);
}
function parsePartNumber(udsData) {
  return parseReadDidAsciiValue(udsData, UDS_DID_PART_NUMBER).trim();
}
function parseSupplierName(udsData) {
  return parseReadDidAsciiValue(udsData, UDS_DID_SUPPLIER_NAME);
}
function parseTotalMileage(udsData) {
  return parseReadDidUnsignedValue(udsData, UDS_DID_TOTAL_MILEAGE) * 0.1;
}
function parseCardCount(udsData) {
  const offset = findReadDidResponseOffset(udsData, UDS_DID_CARD_COUNT);
  if (offset < 0) return -1;
  const dataStart = offset + 3;
  if (udsData.length <= dataStart) return -1;
  const count = udsData[dataStart] & 255;
  return count < 0 || count > 2 ? -1 : count;
}
function parseImei(udsData) {
  return parseReadDidAsciiValue(udsData, 1792); // 0x0700
}

// ---------- 安全访问（Level 1） ----------
// computeLevel1Key(seed, xor=[0x34,0x66,0x2E,0x8D])
function computeLevel1Key(seed, xor) {
  const cal = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) cal[i] = (seed[i] ^ xor[i]) & 255;
  const key0 = (((cal[2] & 240) << 4) | (cal[3] & 240)) & 255;
  const key1 = (((cal[3] & 47) << 2) | (cal[1] & 3)) & 255;
  const key2 = (((cal[1] & 252) >> 2) | (cal[0] & 192)) & 255;
  const key3 = (((cal[0] & 15) << 4) | (cal[2] & 15)) & 255;
  return [key0, key1, key2, key3];
}
const SECURITY_XOR = [52, 102, 46, 141]; // 0x34 0x66 0x2E 0x8D

// ---------- CRC16-CCITT（MCP2 用，0x1021） ----------
function crc16(buffer, offset = 0, length = -1) {
  const bytes = new Uint8Array(buffer);
  const end = length >= 0 ? Math.min(offset + length, bytes.length) : bytes.length;
  let crc = 65535;
  for (let i = offset; i < end; i++) {
    crc ^= bytes[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 32768) !== 0 ? ((crc << 1) ^ 4129) & 65535 : (crc << 1) & 65535;
    }
  }
  return crc & 65535;
}

module.exports = {
  bytesToHex, hexToBytes, bytesToAscii,
  DOIP_TARGET_ADDRESS_VCDM, DOIP_TARGET_ADDRESS_MCU, DOIP_TARGET_ADDRESS_ALL,
  DOIP_SOURCE_ADDRESS, DOIP_HEADER_LENGTH,
  PAYLOAD_TYPE_ROUTE_ACTIVE_REQ, PAYLOAD_TYPE_TCP_ALIVE_CHECK_REQ, PAYLOAD_TYPE_DIAGNOSTIC_MESSAGE,
  buildDoipHeader, buildDoipPdu, buildRouteActivationReqPdu, buildRouteAliveCheckReqPdu, buildDiagnosticMessagePdu,
  parseDoipHeader, extractCompleteDoipPdus, parseDiagData,
  buildIsoTpSingleFrame, buildIsoTpFlowControlFrame, parseIsoTpResponse,
  UDS, UDS_DID_VIN, UDS_DID_SOFTWARE_VERSION, UDS_DID_PART_NUMBER, UDS_DID_SUPPLIER_NAME, UDS_DID_TOTAL_MILEAGE, UDS_DID_CARD_COUNT, UDS_DID_CLUSTER_UUID,
  findReadDidResponseOffset, getReadDidResponseDataBytes, parseReadDidAsciiValue, parseReadDidUnsignedValue,
  parseVin, parseSoftwareVersion, parsePartNumber, parseSupplierName, parseTotalMileage, parseCardCount, parseImei,
  computeLevel1Key, SECURITY_XOR, crc16
};
