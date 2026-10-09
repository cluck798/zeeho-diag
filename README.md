# ZEEHO 无线诊断（zeeho-diag）

极核（ZEEHO）电动摩托车无线诊断工具集：**iPhone / 电脑通过蓝牙适配器直连车辆诊断总线**，读取实时数据、执行 ABS 排气、胎压传感器匹配等维修操作。

> ⚠️ 免责声明：仅供个人车辆维护学习使用。写操作（ABS 排气 / 胎压匹配 / NFC 卡 / 清码）会直接改变车辆状态，请按维修手册流程、在安全场地谨慎操作，风险自负。

## 组件

| 目录 | 说明 |
| --- | --- |
| `ios/` | **iOS 诊断 App**（独立工程，XcodeGen 构建；TrollStore 安装。首页功能格：看数据流（横屏仪表盘）/ ABS 排气 / 胎压传感器 / NFC 卡 / 高级工具；支持横屏） |
| `esp32/` | **ESP32 BLE↔CAN 桥固件**（Arduino；GPIO5/4 接 SN65HVD230 收发器，CANH/L 接诊断口 CAN-H/CAN-L——AE5 六位口 B/E 脚、AE4+ 八位口 B/F 脚，500K。BLE 名 `ZEEHO-CAN`，UUID 同商用 6328 模块） |
| `tools/` | `diag.html` 生成器（`make_diag_html.js` + 数据 `rs485_items.json`），改 UI/数据后重新生成到 `ios/App/Resources/diag.html` |
| `enclosure/` | 外壳（`node make_case_stl.js` 普通保护壳；`make_case_stl_v2.js` 直插式；**`make_case_stl_v3.js [obd16\|type2\|type3]` U 盘款**——插件式主体 + 盖 + 防护帽，配 SVG 结构预览）|
| 根目录 | **桌面诊断工具**（Electron，Windows）：`npm install && npm start`。WiFi/DoIP 直连 + 蓝牙 VCI 扫描 |

## 硬件

1. **RS485 通道（数据流/整车）**：淘宝「I6328A-485」等 RS485 转蓝牙透传模块，出厂默认 115200 8N1，接线 —— 模块 A/B 接诊断口 **7/15 脚**，供电 3.3~5V。
2. **CAN 通道（ABS 排气/胎压匹配）**：ESP32 + SN65HVD230（推荐，3.3V 直连）或 TJA1050（5V 供电，RXD 需分压），固件烧录见 `esp32/zeeho_can_bridge.ino` 头注释。

## 协议速览

- **RS485 帧**：`4346 | 系统码 | 40 | payload | 校验(逐字节和低8位) | 4544`；系统码：49 计量器 / 51 BMS / 59 MCU / 81 仪表整车 / 89 TBOX / 8B 后雷达。
- **CAN**：UDS over ISO-TP，500K；诊断地址 `0x7E1/0x714`（响应 +0x80）；例：读 VIN `22 F190`。
- 数据流解析脚本与命令表由 `tools/` 生成维护，App 内置 93 项（电池/电机/仪表等）。

## iOS 构建

推送 `ios/**` 改动到 `main` 即触发 GitHub Actions 构建，产物发布到 Release `diag-latest`（未签名 IPA，TrollStore 直接安装）。