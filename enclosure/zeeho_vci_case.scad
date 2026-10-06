// zeeho_vci_case.scad — RS485/BLE 诊断模块保护外壳（参数化，3D 打印）
// 用法（OpenSCAD）：改下面参数 → F5 预览 → F6 渲染 → File → Export → STL
// 没有 3D 打印机：导出 STL 后淘宝搜「3D 打印代打」，上传文件，几块钱出件
// 适配模块：I6328A-485（BLE 主从一体）等同类小板；也可改参数用于 ESP32 CAN 桥

/* [显示] 0=底壳+盖（装配预览） 1=只显示底壳 2=只显示盖 */
view_mode = 0;

/* [模块实测尺寸（来自官方尺寸图，单位 mm）] */
board_l = 30.46;  // 板长（排针端 → 天线端）
board_w = 14.02;  // 板宽
board_t = 1.6;    // 板厚（估）
comp_h  = 6.5;    // 元件区高度（JL 蓝牙芯片 + 排针余量），天线区留净空

/* [外壳参数] */
wall    = 1.6;   // 壁厚
clear   = 0.6;   // 板与壳的间隙（装配松量）
lid_h   = 2.5;   // 盖板厚度

/* [出线孔] 两端各一个，A/B 与 VCC/GND 从两端出 */
wire_hole_d = 4.5;   // 出线孔直径
wire_hole_z = 0;     // 出线孔中心相对板面高度（0=贴板面）

$fn = 48;

inner_l = board_l + 2 * clear;
inner_w = board_w + 2 * clear;
outer_l = inner_l + 2 * wall;
outer_w = inner_w + 2 * wall;
body_h  = wall + board_t + comp_h + 1.5;   // 底壳总高（底 + 板 + 元件 + 余量）

// ---------- 底壳 ----------
module shell_bottom() {
    difference() {
        cube([outer_l, outer_w, body_h]);
        // 内腔
        translate([wall, wall, wall])
            cube([inner_l, inner_w, body_h]);
        // 两端出线孔（沿长边两端，中心在板面附近）
        for (x = [0, outer_l]) {
            translate([x, outer_w / 2, wall + board_t / 2 + wire_hole_z])
                rotate([0, 90, 0])
                    cylinder(d = wire_hole_d, h = wall * 4, center = true);
        }
        // 侧面散热/透传观察窗（可选，两个小方孔）
        for (x = [outer_l * 0.35, outer_l * 0.65]) {
            translate([x, -1, wall + board_t + comp_h * 0.45])
                cube([6, wall + 2, comp_h * 0.5]);
        }
    }
    // 四角支撑柱（把板垫平：板放在 wall 高度的台阶上，简化为两侧托边）
    translate([wall + 0.0, wall + 0.0, wall - 0.8])
        cube([inner_l, 1.0, 0.8]);
    translate([wall + 0.0, wall + inner_w - 1.0, wall - 0.8])
        cube([inner_l, 1.0, 0.8]);
}

// ---------- 盖（套合，免螺丝） ----------
module lid() {
    // 顶板
    translate([0, 0, body_h])
        cube([outer_l, outer_w, lid_h]);
    // 插入唇（进入底壳内腔，摩擦固定）
    translate([wall + 0.2, wall + 0.2, body_h - 2.4])
        cube([inner_l - 0.4, inner_w - 0.4, 2.4]);
}

// ---------- 输出 ----------
if (view_mode == 0) {
    shell_bottom();
    lid();
    // 装配预览：把盖抬起来一点看装配关系（注释掉下面这行即为闭合状态）
    // translate([0, 0, 8]) lid();
}
if (view_mode == 1) shell_bottom();
if (view_mode == 2) lid();