/*
 * zeeho_can_bridge.ino — ZEEHO 无线诊断 CAN 桥（ESP32 + CAN 收发器）
 * ============================================================
 * 用途：手机(iOS 极核面板 App 的 RS 诊断页)通过蓝牙直连车辆 CAN 总线，
 *       执行 UDS 诊断（状态读取 / ABS 排气 / 清码 等）。
 *
 * ── 硬件接线（推荐 SN65HVD230，3.3V 直连最省事）──
 *   ESP32 GPIO5  -> 收发器 CTX/TXD  （CAN_TX）
 *   ESP32 GPIO4  <- 收发器 CRX/RXD  （CAN_RX）
 *   收发器 3V3   -> ESP32 3.3V
 *   收发器 GND   -> ESP32 GND（并与车辆诊断口 GND 相连，共地）
 *   收发器 CANH  -> 车辆诊断口 CAN-H（AE5 六位口 B 脚 / AE4+ 八位口 B 脚，线色 BR/O）
 *   收发器 CANL  -> 车辆诊断口 CAN-L（AE5 六位口 E 脚 / AE4+ 八位口 F 脚，线色 BR/G）
 *   （车载供电）诊断口 12V电源(A 脚) → 12V→5V 降压 → ESP32 5V；切勿把 12V 直接接 5V 引脚
 *   若用 TJA1050：需 5V 供电，且 RXD 输出为 5V 电平，
 *   必须在 RXD->GPIO4 之间加分压（如 10k/20k）或电平转换，否则会打坏 ESP32！
 *
 * ── 烧录 ──
 *   Arduino IDE：开发板选 "ESP32 Dev Module"，直接上传（无需额外库，
 *   TWAI 驱动与 BLE 库均为 ESP32 Arduino 核心自带）。
 *
 * ── 蓝牙（与 I6328A-485 模块相同 UUID，App 无需区分）──
 *   设备名: ZEEHO-CAN
 *   服务 FFE0 / 写入 FFE1(WriteNoRsp) / 通知 FFE2(Notify)
 *
 * ── 透传帧格式（BLE 双向，固定 11 字节）──
 *   [ID_H] [ID_L] [DLC] [D0..D7]
 *   ID 为 11 位标准 CAN 帧 ID（诊断请求 0x7E1/0x714，响应 0x7E9/0x794）
 *   DLC 之后的 8 字节数据场不足补 0；接收上报时同样补 0。
 *
 * ── 上行过滤 ──
 *   仅上报 ID 0x700~0x7FF 区间（诊断响应段），避免整车 CAN 流量灌爆蓝牙。
 *   如需抓全量报文，把 FILTER_MIN/FILTER_MAX 改为 0x000~0x7FF。
 */
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "driver/twai.h"

// ---------- 配置 ----------
#define CAN_TX_GPIO 5
#define CAN_RX_GPIO 4
static const uint16_t FILTER_MIN = 0x700;   // 上报 ID 下限
static const uint16_t FILTER_MAX = 0x7FF;   // 上报 ID 上限
static const char* BLE_NAME = "ZEEHO-CAN";

// ---------- 全局 ----------
BLEServer* pServer = nullptr;
BLECharacteristic* pNotify = nullptr;
volatile bool deviceConnected = false;

// ---------- BLE 回调 ----------
class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer* s) override {
    deviceConnected = true;
    Serial.println("[BLE] 手机已连接");
  }
  void onDisconnect(BLEServer* s) override {
    deviceConnected = false;
    Serial.println("[BLE] 断开，重新广播");
    BLEDevice::startAdvertising();
  }
};

// 收到 App 写入的 11 字节帧 -> 发到 CAN 总线
class WriteCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    // 兼容 ESP32 Arduino 核心 2.x(String 返回值) 与 3.x(std::string 返回值)
    String val = c->getValue().c_str();
    size_t n = val.length();
    if (n < 3) return;
    uint16_t id = ((uint8_t)val[0] << 8) | (uint8_t)val[1];
    uint8_t dlc = (uint8_t)val[2];
    if (dlc > 8) dlc = 8;
    twai_message_t msg = {};
    msg.identifier = id;
    msg.extd = 0;
    msg.rtr = 0;
    msg.data_length_code = dlc;
    for (int i = 0; i < dlc; i++) {
      msg.data[i] = (i + 3 < (int)n) ? (uint8_t)val[i + 3] : 0;
    }
    if (twai_transmit(&msg, pdMS_TO_TICKS(50)) == ESP_OK) {
      Serial.printf("[CAN TX] %03X DLC=%d\n", id, dlc);
    } else {
      Serial.printf("[CAN TX] %03X 发送失败（总线无应答/未接线？）\n", id);
    }
  }
};

// ---------- setup ----------
void setup() {
  Serial.begin(115200);
  Serial.println("ZEEHO-CAN 桥启动…");

  // TWAI (CAN) 500K
  twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT((gpio_num_t)CAN_TX_GPIO, (gpio_num_t)CAN_RX_GPIO, TWAI_MODE_NORMAL);
  twai_timing_config_t t_config = TWAI_TIMING_CONFIG_500KBITS();
  twai_filter_config_t f_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();
  if (twai_driver_install(&g_config, &t_config, &f_config) == ESP_OK) {
    Serial.println("[CAN] 500K 驱动就绪");
  } else {
    Serial.println("[CAN] 驱动安装失败");
  }
  twai_start();

  // BLE
  BLEDevice::init(BLE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCB());
  BLEService* svc = pServer->createService("FFE0");
  BLECharacteristic* chWrite = svc->createCharacteristic(
      "FFE1",
      BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  chWrite->setCallbacks(new WriteCB());
  pNotify = svc->createCharacteristic("FFE2", BLECharacteristic::PROPERTY_NOTIFY);
  pNotify->addDescriptor(new BLE2902());
  svc->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID("FFE0");
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("[BLE] 广播中：ZEEHO-CAN");
}

// ---------- loop ----------
void loop() {
  twai_message_t rx;
  if (twai_receive(&rx, pdMS_TO_TICKS(10)) == ESP_OK) {
    if (!rx.rtr && rx.identifier >= FILTER_MIN && rx.identifier <= FILTER_MAX) {
      uint8_t buf[11];
      buf[0] = (uint8_t)(rx.identifier >> 8);
      buf[1] = (uint8_t)(rx.identifier & 0xFF);
      uint8_t dlc = rx.data_length_code > 8 ? 8 : rx.data_length_code;
      buf[2] = dlc;
      for (int i = 0; i < 8; i++) buf[3 + i] = (i < dlc) ? rx.data[i] : 0;
      if (deviceConnected && pNotify != nullptr && pNotify->getSubscribedCount() > 0) {
        pNotify->setValue(buf, 11);
        pNotify->notify();
      }
    }
  }
}