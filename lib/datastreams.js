// datastreams.js — ZEEHO 实时数据（数据流）定义
// 来源：ZSCAN-Mb DP 数据包（CN_DIAG.lib，sqlite3mc 解密）中 ZEEHO 各 ECU 模块的
// "数值数据流"定义（UDS 0x22 读 DID + 字节位置 + 解析表达式 + 显示格式）。
// 每项：{ name 名称, unit 单位, did DID(hex), idx 响应字节下标(相对 62 DIDH DIDL 起点),
//        args 脚本变量名, expr 解析表达式(JS 算术, 变量为 args), fmt 显示格式 }
// 读取流程：发 UDS 22 <DID>，响应 62 <DID> <data...>，取 udsData[idx[i]] 作为 args[i] 代入 expr。
"use strict";

module.exports = { groups: {
  "bms": [
    {
      "name": "总电压",
      "unit": "V",
      "did": "0D37",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "总电流",
      "unit": "A",
      "did": "0D38",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1-1000",
      "fmt": "%.1f"
    },
    {
      "name": "SOC",
      "unit": "%",
      "did": "0D39",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "SOH",
      "unit": "%",
      "did": "0D40",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1",
      "fmt": "%d"
    },
    {
      "name": "最高单体电压",
      "unit": "mV",
      "did": "0D41",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2+1000",
      "fmt": "%d"
    },
    {
      "name": "最低单体电压",
      "unit": "mV",
      "did": "0D42",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2+1000",
      "fmt": "%d"
    },
    {
      "name": "最高单体电压编号",
      "unit": "",
      "did": "0D43",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1",
      "fmt": "%d"
    },
    {
      "name": "最低单体电压编号",
      "unit": "",
      "did": "0D44",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1",
      "fmt": "%d"
    },
    {
      "name": "最高单体温度",
      "unit": "deg",
      "did": "0D45",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1-40",
      "fmt": "%d"
    },
    {
      "name": "最低单体温度",
      "unit": "deg",
      "did": "0D46",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1-40",
      "fmt": "%d"
    },
    {
      "name": "最高单体温度编号",
      "unit": "",
      "did": "0D47",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1",
      "fmt": "%d"
    },
    {
      "name": "最低单体温度编号",
      "unit": "",
      "did": "0D48",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1",
      "fmt": "%d"
    },
    {
      "name": "充电剩余时间",
      "unit": "min",
      "did": "0D53",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "充电请求电压",
      "unit": "V",
      "did": "0D57",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "充电请求电流",
      "unit": "A",
      "did": "0D58",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "充电功率限制",
      "unit": "W",
      "did": "0D59",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "允许峰值放电电流（SOP）",
      "unit": "A",
      "did": "0D60",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "允许持续放电电流（SOP）",
      "unit": "A",
      "did": "0D61",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "允许峰值充电电流（SOP）",
      "unit": "A",
      "did": "0D62",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "允许持续充电电流（SOP）",
      "unit": "A",
      "did": "0D63",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    }
  ],
  "bms2": [
    {
      "name": "总电压",
      "unit": "V",
      "did": "0D37",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "总电流",
      "unit": "A",
      "did": "0D38",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1-1000",
      "fmt": "%.1f"
    },
    {
      "name": "SOC",
      "unit": "%",
      "did": "0D39",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "SOH",
      "unit": "%",
      "did": "0D40",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1",
      "fmt": "%d"
    },
    {
      "name": "最高单体电压",
      "unit": "mV",
      "did": "0D41",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2+1000",
      "fmt": "%d"
    },
    {
      "name": "最低单体电压",
      "unit": "mV",
      "did": "0D42",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2+1000",
      "fmt": "%d"
    },
    {
      "name": "最高单体电压编号",
      "unit": "",
      "did": "0D43",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1",
      "fmt": "%d"
    },
    {
      "name": "最低单体电压编号",
      "unit": "",
      "did": "0D44",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1",
      "fmt": "%d"
    },
    {
      "name": "最高单体温度",
      "unit": "deg",
      "did": "0D45",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1-40",
      "fmt": "%d"
    },
    {
      "name": "最低单体温度",
      "unit": "deg",
      "did": "0D46",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1-40",
      "fmt": "%d"
    },
    {
      "name": "最高单体温度编号",
      "unit": "",
      "did": "0D47",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1",
      "fmt": "%d"
    },
    {
      "name": "最低单体温度编号",
      "unit": "",
      "did": "0D48",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1",
      "fmt": "%d"
    },
    {
      "name": "充电剩余时间",
      "unit": "min",
      "did": "0D53",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "充电请求电压",
      "unit": "V",
      "did": "0D57",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "充电请求电流",
      "unit": "A",
      "did": "0D58",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "充电功率限制",
      "unit": "W",
      "did": "0D59",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "允许峰值放电电流（SOP）",
      "unit": "A",
      "did": "0D60",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "允许持续放电电流（SOP）",
      "unit": "A",
      "did": "0D61",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "允许峰值充电电流（SOP）",
      "unit": "A",
      "did": "0D62",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "允许持续充电电流（SOP）",
      "unit": "A",
      "did": "0D63",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    }
  ],
  "mcu": [
    {
      "name": "供电电压",
      "unit": "V",
      "did": "CF00",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.01",
      "fmt": "%.2f"
    },
    {
      "name": "车辆速度",
      "unit": "Km/h",
      "did": "CF01",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.05625",
      "fmt": "%.2f"
    },
    {
      "name": "行驶总里程",
      "unit": "km",
      "did": "CF03",
      "idx": [
        3,
        4,
        5
      ],
      "args": [
        "x1",
        "x2",
        "x3"
      ],
      "expr": "(x1*65536.0+x2*256.0+x3)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "电机转速",
      "unit": "rpm",
      "did": "CF05",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*1-16000",
      "fmt": "%d"
    },
    {
      "name": "动力电池总电压1",
      "unit": "V",
      "did": "CF06",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*1",
      "fmt": "%d"
    },
    {
      "name": "动力电池剩余电量1",
      "unit": "%",
      "did": "CF07",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "动力电池总电压2",
      "unit": "V",
      "did": "CF08",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*1",
      "fmt": "%d"
    },
    {
      "name": "动力电池剩余电量2",
      "unit": "%",
      "did": "CF09",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "U相瞬态电流",
      "unit": "A",
      "did": "0C01",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    },
    {
      "name": "V相瞬态电流",
      "unit": "A",
      "did": "0C02",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    },
    {
      "name": "W相瞬态电流",
      "unit": "A",
      "did": "0C03",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    },
    {
      "name": "电机控制器母线电压",
      "unit": "V",
      "did": "0C04",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "y=(x1*256+x2)*1",
      "fmt": "%d"
    },
    {
      "name": "电机偏置角",
      "unit": "°",
      "did": "0C05",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "y=(x1*256.00+x2)*360.00/65536.00",
      "fmt": "%.2f"
    },
    {
      "name": "电机扭矩",
      "unit": "Nm",
      "did": "0C06",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "y=(x1*256.0+x2)*0.2-200.0",
      "fmt": "%.1f"
    },
    {
      "name": "驾驶员请求扭矩（目标扭矩）",
      "unit": "Nm",
      "did": "0C07",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "y=(x1*256.0+x2)*0.2-200.0",
      "fmt": "%.1f"
    },
    {
      "name": "电机本体温度",
      "unit": "°C",
      "did": "0C11",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1*1-40",
      "fmt": "%d"
    },
    {
      "name": "最大扭矩",
      "unit": "Nm",
      "did": "0C13",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.0+x2)*0.2-200.0",
      "fmt": "%.1f"
    },
    {
      "name": "最小扭矩",
      "unit": "Nm",
      "did": "0C14",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.2-200.0",
      "fmt": "%.1f"
    },
    {
      "name": "直流母线电流",
      "unit": "A",
      "did": "0C16",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1-800.0",
      "fmt": "%.1f"
    },
    {
      "name": "D轴电压输出值",
      "unit": "V",
      "did": "0C18",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    },
    {
      "name": "Q轴电压输出值",
      "unit": "V",
      "did": "0C19",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    },
    {
      "name": "D轴电流指令",
      "unit": "A",
      "did": "0C20",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    },
    {
      "name": "Q轴电流指令",
      "unit": "A",
      "did": "0C21",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    },
    {
      "name": "D轴电流反馈",
      "unit": "A",
      "did": "0C22",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    },
    {
      "name": "Q轴电流反馈",
      "unit": "A",
      "did": "0C23",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    },
    {
      "name": "电流传感器供电电压",
      "unit": "V",
      "did": "0C31",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1*0.02",
      "fmt": "%.2f"
    },
    {
      "name": "U相零漂",
      "unit": "A",
      "did": "0C38",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    },
    {
      "name": "V相零漂",
      "unit": "A",
      "did": "0C39",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    },
    {
      "name": "W相零漂",
      "unit": "A",
      "did": "0C40",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    },
    {
      "name": "三相电流和",
      "unit": "A",
      "did": "0C41",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    },
    {
      "name": "电机电角度",
      "unit": "°",
      "did": "0B10",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*1",
      "fmt": "%d"
    },
    {
      "name": "电机控制器温度值",
      "unit": "°C",
      "did": "0B12",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1*1-40",
      "fmt": "%d"
    },
    {
      "name": "加速握把位置",
      "unit": "%",
      "did": "0B02",
      "idx": [
        3
      ],
      "args": [
        "x"
      ],
      "expr": "x*0.5",
      "fmt": "%.1f"
    },
    {
      "name": "电池包母线电压",
      "unit": "V",
      "did": "0B05",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*1",
      "fmt": "%d"
    },
    {
      "name": "电池包母线电流",
      "unit": "A",
      "did": "0B06",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1-1000.0",
      "fmt": "%.1f"
    },
    {
      "name": "加速踏板1电源反馈电压",
      "unit": "V",
      "did": "0B16",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "((x1*256+x2)*14.8)/4095.0",
      "fmt": "%.2f"
    },
    {
      "name": "加速踏板2电源反馈电压",
      "unit": "V",
      "did": "0B16",
      "idx": [
        5,
        6
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "((x1*256+x2)*14.8)/4095.0",
      "fmt": "%.2f"
    },
    {
      "name": "加速踏板1信号电压",
      "unit": "V",
      "did": "0B16",
      "idx": [
        7,
        8
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "((x1*256+x2)*5)/4095.0",
      "fmt": "%.2f"
    },
    {
      "name": "加速踏板2信号电压",
      "unit": "V",
      "did": "0B16",
      "idx": [
        9,
        10
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "((x1*256+x2)*5)/4095.0",
      "fmt": "%.2f"
    },
    {
      "name": "最高车速限制值",
      "unit": "Km/h",
      "did": "0B20",
      "idx": [
        3
      ],
      "args": [
        "x"
      ],
      "expr": "x*1",
      "fmt": "%d"
    },
    {
      "name": "MOS2温度",
      "unit": "°C",
      "did": "0C42",
      "idx": [
        3
      ],
      "args": [
        "x"
      ],
      "expr": "x*1-40",
      "fmt": "%d"
    },
    {
      "name": "U相有效电流",
      "unit": "A",
      "did": "0C43",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    },
    {
      "name": "V相有效电流",
      "unit": "A",
      "did": "0C44",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    },
    {
      "name": "W相有效电流",
      "unit": "A",
      "did": "0C45",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256.00+x2)*0.0625-2047.9375",
      "fmt": "%.2f"
    }
  ],
  "vcu": [
    {
      "name": "总电压",
      "unit": "V",
      "did": "0D37",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "总电流",
      "unit": "A",
      "did": "0D38",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1-1000",
      "fmt": "%.1f"
    },
    {
      "name": "SOC",
      "unit": "%",
      "did": "0D39",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "SOH",
      "unit": "%",
      "did": "0D40",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1",
      "fmt": "%d"
    },
    {
      "name": "最高单体电压",
      "unit": "mV",
      "did": "0D41",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2+1000",
      "fmt": "%d"
    },
    {
      "name": "最低单体电压",
      "unit": "mV",
      "did": "0D42",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2+1000",
      "fmt": "%d"
    },
    {
      "name": "最高单体电压编号",
      "unit": "",
      "did": "0D43",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1",
      "fmt": "%d"
    },
    {
      "name": "最低单体电压编号",
      "unit": "",
      "did": "0D44",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1",
      "fmt": "%d"
    },
    {
      "name": "最高单体温度",
      "unit": "deg",
      "did": "0D45",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1-40",
      "fmt": "%d"
    },
    {
      "name": "最低单体温度",
      "unit": "deg",
      "did": "0D46",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1-40",
      "fmt": "%d"
    },
    {
      "name": "最高单体温度编号",
      "unit": "",
      "did": "0D47",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1",
      "fmt": "%d"
    },
    {
      "name": "最低单体温度编号",
      "unit": "",
      "did": "0D48",
      "idx": [
        3
      ],
      "args": [
        "x1"
      ],
      "expr": "x1",
      "fmt": "%d"
    },
    {
      "name": "充电剩余时间",
      "unit": "min",
      "did": "0D53",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "充电请求电压",
      "unit": "V",
      "did": "0D57",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "充电请求电流",
      "unit": "A",
      "did": "0D58",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "充电功率限制",
      "unit": "W",
      "did": "0D59",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "允许峰值放电电流（SOP）",
      "unit": "A",
      "did": "0D60",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "允许持续放电电流（SOP）",
      "unit": "A",
      "did": "0D61",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "允许峰值充电电流（SOP）",
      "unit": "A",
      "did": "0D62",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    },
    {
      "name": "允许持续充电电流（SOP）",
      "unit": "A",
      "did": "0D63",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "x1*256+x2",
      "fmt": "%d"
    }
  ],
  "mcuLite": [
    {
      "name": "动力电池总电压1",
      "unit": "V",
      "did": "CF06",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*1",
      "fmt": "%d"
    },
    {
      "name": "动力电池剩余电量1",
      "unit": "%",
      "did": "CF07",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "动力电池总电压2",
      "unit": "V",
      "did": "CF08",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*1",
      "fmt": "%d"
    },
    {
      "name": "动力电池剩余电量2",
      "unit": "%",
      "did": "CF09",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "交流电压",
      "unit": "V",
      "did": "0F04",
      "idx": [
        3,
        4
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "交流电流",
      "unit": "A",
      "did": "0F04",
      "idx": [
        5,
        6
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.01",
      "fmt": "%.2f"
    },
    {
      "name": "直流电压",
      "unit": "V",
      "did": "0F04",
      "idx": [
        7,
        8
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.1",
      "fmt": "%.1f"
    },
    {
      "name": "直流电流",
      "unit": "A",
      "did": "0F04",
      "idx": [
        9,
        10
      ],
      "args": [
        "x1",
        "x2"
      ],
      "expr": "(x1*256+x2)*0.01",
      "fmt": "%.2f"
    }
  ]
} };

