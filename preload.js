// preload.js — 渲染层安全桥
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("diag", {
  bleScan: (durationMs) => ipcRenderer.invoke("ble:scan", durationMs),
  wifiCredentials: (opts) => ipcRenderer.invoke("wifi:credentials", opts),
  wifiScan: () => ipcRenderer.invoke("wifi:scan"),
  wifiConnect: (opts) => ipcRenderer.invoke("wifi:connect", opts),
  wifiStatus: () => ipcRenderer.invoke("wifi:status"),
  wifiDisconnect: () => ipcRenderer.invoke("wifi:disconnect"),
  diagConnect: (opts) => ipcRenderer.invoke("diag:connect", opts),
  readVehicleInfo: () => ipcRenderer.invoke("diag:readVehicleInfo"),
  checkOnline: () => ipcRenderer.invoke("diag:checkOnline"),
  readFaultCodes: () => ipcRenderer.invoke("diag:readFaultCodes"),
  readStreams: (opts) => ipcRenderer.invoke("diag:readStreams", opts),
  readRawDid: (opts) => ipcRenderer.invoke("diag:readRawDid", opts),
  diagDisconnect: () => ipcRenderer.invoke("diag:disconnect"),
  onLog: (cb) => ipcRenderer.on("diag:log", (_e, msg) => cb(msg)),
  onPdu: (cb) => ipcRenderer.on("diag:pdu", (_e, hex) => cb(hex))
});
