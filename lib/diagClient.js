// diagClient.js — ZEEHO 车端诊断传输层（还原自 ZeeCare tcpSocketClient.uts）
// TCP 192.168.49.1:13400 DoIP；路由激活 → 心跳(2s) → 诊断消息收发
// 响应分发规则（按 PDU 十六进制前缀）：
//   03FC0006 路由激活响应 / 03FC0008 alive-check 响应
//   03FC8001(8003?) 诊断正响应 / 03FC8002 诊断消息（含 NACK/多帧）
"use strict";
const net = require("net");
const P = require("./protocol");

const WIFI_SOCKET_HOST = "192.168.49.1";
const DEFAULT_TCP_PORT = 13400;
const DEFAULT_TCP_CONNECT_TIMEOUT = 5000;
const DEFAULT_TCP_TIMEOUT = 3000;
const HEARTBEAT_INTERVAL = 2000;

class DiagClient {
  constructor({ host = WIFI_SOCKET_HOST, port = DEFAULT_TCP_PORT, log = () => {} } = {}) {
    this.host = host;
    this.port = port;
    this.log = log;
    this.socket = null;
    this.connected = false;
    this.rxBuffer = Buffer.alloc(0);
    this.heartbeatTimer = null;
    // 当前等待的诊断响应回调（单消息模式）
    this.pendingDiag = null; // { matchPattern, resolve, timer }
    this.onRawPdu = null; // 外部观察钩子
  }

  // ---------- 连接 ----------
  connect() {
    if (this.connected && this.socket) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`TCP 连接超时 (${this.host}:${this.port})`));
      }, DEFAULT_TCP_CONNECT_TIMEOUT);
      socket.once("connect", () => {
        clearTimeout(timer);
        this.socket = socket;
        this.connected = true;
        this.rxBuffer = Buffer.alloc(0);
        this._bindSocket();
        this.log(`TCP 已连接 ${this.host}:${this.port}`);
        resolve();
      });
      socket.once("error", (err) => {
        clearTimeout(timer);
        if (!this.connected) reject(err);
      });
    });
  }

  _bindSocket() {
    const socket = this.socket;
    socket.on("data", (chunk) => {
      this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);
      const { packets, remaining } = P.extractCompleteDoipPdus(this.rxBuffer);
      this.rxBuffer = remaining;
      for (const pkt of packets) this._dispatchPdu(pkt);
    });
    socket.on("error", (err) => {
      this.log("TCP 错误: " + (err && err.message));
    });
    socket.on("close", () => {
      this.connected = false;
      this.stopHeartbeat();
      if (this.pendingDiag) {
        clearTimeout(this.pendingDiag.timer);
        this.pendingDiag.resolve(null);
        this.pendingDiag = null;
      }
      this.log("TCP 连接已关闭");
    });
  }

  close() {
    this.stopHeartbeat();
    if (this.socket) {
      try { this.socket.destroy(); } catch (e) {}
      this.socket = null;
    }
    this.connected = false;
    this.rxBuffer = Buffer.alloc(0);
  }

  // ---------- PDU 分发（移植 emitCompletedPackets） ----------
  _dispatchPdu(pdu) {
    const hex = P.bytesToHex(pdu).toUpperCase();
    if (this.onRawPdu) this.onRawPdu(hex);
    // 03FC0006: 路由激活响应
    if (/^03FC0006/.test(hex)) { this.log("路由激活响应: " + hex); return; }
    // 03FC0008: alive check 响应
    if (/^03FC0008/.test(hex)) { return; }
    // 03FC8002 00000007 0001 0E00 003E80: tester present 响应，忽略
    if (/^03FC80020000000700010E00003E80/.test(hex)) return;
    // 诊断消息（正响应/多帧）
    if (/^03FC8001/.test(hex) || /^03FC8003/.test(hex) || /^03FC8002/.test(hex)) {
      if (this.pendingDiag) {
        const { matchPattern, resolve, timer } = this.pendingDiag;
        if (!matchPattern || matchPattern.test(hex)) {
          clearTimeout(timer);
          this.pendingDiag = null;
          resolve(pdu);
          return;
        }
      }
      return;
    }
  }

  // ---------- 发送 ----------
  _send(pdu) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) return reject(new Error("TCP 未连接"));
      this.socket.write(pdu, (err) => (err ? reject(err) : resolve()));
    });
  }

  // 路由激活（每次诊断前调用，与官方一致）
  async routerActivation() {
    await this.connect();
    const pdu = P.buildRouteActivationReqPdu();
    this.log("路由激活请求: " + P.bytesToHex(pdu));
    await this._send(pdu);
  }

  // 心跳（alive check，2 秒间隔）
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.connected) return;
      const pdu = P.buildRouteAliveCheckReqPdu();
      this._send(pdu).catch(() => {});
    }, HEARTBEAT_INTERVAL);
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
  }
  stopHeartbeat() {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  /**
   * 发送一条 UDS 诊断消息并等待响应（移植 requestDiagnosticMessage）
   * @param {object} opts { da: 目标地址, udsData: UDS 字节数组, matchPattern?: 正则(匹配整包hex), timeout?: ms }
   * @returns {Promise<Buffer|null>} 完整 DoIP PDU（含头），超时返回 null
   */
  diagnosticMessage({ da = P.DOIP_TARGET_ADDRESS_VCDM, udsData, matchPattern = null, timeout = DEFAULT_TCP_TIMEOUT }) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.connect();
        const pdu = P.buildDiagnosticMessagePdu(P.DOIP_SOURCE_ADDRESS, da, udsData);
        this.log("诊断请求: " + P.bytesToHex(pdu));
        // 等待上一个 pending 结束（串行）
        if (this.pendingDiag) {
          clearTimeout(this.pendingDiag.timer);
          this.pendingDiag.resolve(null);
          this.pendingDiag = null;
        }
        const timer = setTimeout(() => {
          if (this.pendingDiag) {
            this.pendingDiag = null;
            this.log("诊断响应超时: " + P.bytesToHex(udsData));
            resolve(null);
          }
        }, timeout);
        this.pendingDiag = { matchPattern, resolve, timer };
        await this._send(pdu);
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * 带重试的诊断（移植 diagnosticMessage 4 次重试 + 重新路由激活）
   */
  async diagnosticMessageWithRetry(opts, retries = 4) {
    for (let i = 0; i < retries; i++) {
      try {
        if (i > 0) {
          await sleep(500);
          await this.routerActivation();
          this.startHeartbeat();
        }
        await sleep(50);
        const pdu = await this.diagnosticMessage(opts);
        if (!pdu) continue;
        const diag = P.parseDiagData(pdu.slice(P.DOIP_HEADER_LENGTH));
        if (diag.udsData.length === 0) continue;
        return diag;
      } catch (e) {
        this.log(`诊断重试 ${i + 1}/${retries}: ${e && e.message}`);
        if (i === retries - 1) throw e;
      }
    }
    return { sourceAddress: 0, destAddress: 0, udsData: [] };
  }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

module.exports = { DiagClient, WIFI_SOCKET_HOST, DEFAULT_TCP_PORT };
