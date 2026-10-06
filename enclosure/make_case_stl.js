// make_case_stl.js — 生成模块外壳 STL（无需 OpenSCAD，直接输出可打印文件）
// 尺寸来源：模块官方尺寸图（板 30.46 × 14.02mm，排针端 2.54×3 间距，天线在另一端）
// 用法：node make_case_stl.js  → 生成 zeeho_vci_case_bottom.stl / zeeho_vci_case_lid.stl
// 切片打印：切片软件（Cura/PrusaSlicer/拓竹/创想等）直接打开两个 STL，PLA/PETG 0.2mm 层高即可
const fs = require('fs');
const path = require('path');

/* ============ 参数（mm） ============ */
const P = {
  boardL: 30.46,   // 板长（X 方向：x=0 为排针端，x=boardL 为天线端）
  boardW: 14.02,   // 板宽（Y）
  clear: 0.7,      // 板与壳间隙（单边）
  wall: 1.6,       // 壁厚
  floor: 1.6,      // 底板厚
  cavityH: 9.0,    // 内腔高（板 1.6 + 元件 6.5 + 余量）
  pinSlotW: 12.0,  // 排针端出线槽宽（2.54×4 排针 + 余量）
  pinSlotH: 4.0    // 出线槽高（从底板上表面起）
};
P.innerL = P.boardL + P.clear * 2;
P.innerW = P.boardW + P.clear * 2;
P.outerL = P.innerL + P.wall * 2;
P.outerW = P.innerW + P.wall * 2;
P.totalH = P.floor + P.cavityH;

/* ============ STL 写入 ============ */
function makeWriter() {
  const tris = [];
  return {
    box(x, y, z, sx, sy, sz) {
      const v = [
        [x, y, z], [x + sx, y, z], [x + sx, y + sy, z], [x, y + sy, z],
        [x, y, z + sz], [x + sx, y, z + sz], [x + sx, y + sy, z + sz], [x, y + sy, z + sz]
      ];
      const faces = [
        [0, 2, 1], [0, 3, 2],   // 底（-Z）
        [4, 5, 6], [4, 6, 7],   // 顶（+Z）
        [0, 1, 5], [0, 5, 4],   // 前（-Y）
        [3, 7, 6], [3, 6, 2],   // 后（+Y）
        [0, 4, 7], [0, 7, 3],   // 左（-X）
        [1, 2, 6], [1, 6, 5]    // 右（+X）
      ];
      for (const f of faces) tris.push([v[f[0]], v[f[1]], v[f[2]]]);
    },
    save(file, name) {
      let out = 'solid ' + name + '\n';
      for (const t of tris) {
        const n = normal(t[0], t[1], t[2]);
        out += '  facet normal ' + n.join(' ') + '\n    outer loop\n';
        for (const p of t) out += '      vertex ' + p.join(' ') + '\n';
        out += '    endloop\n  endfacet\n';
      }
      out += 'endsolid ' + name + '\n';
      fs.writeFileSync(file, out, 'utf8');
      console.log('written ' + file + ' (' + tris.length + ' tris)');
    }
  };
}
function normal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return n.map(x => parseFloat((x / l).toFixed(4)));
}

/* ============ 底壳（底面在 z=0，开口朝上） ============ */
{
  const w = makeWriter();
  const { outerL, outerW, wall, floor, cavityH, pinSlotW, pinSlotH } = P;
  const wallH = cavityH;
  // 底板
  w.box(0, 0, 0, outerL, outerW, floor);
  // 前后长边墙（Y 两侧）
  w.box(0, 0, floor, outerL, wall, wallH);
  w.box(0, outerW - wall, floor, outerL, wall, wallH);
  // 天线端墙（x = outerL - wall，整块）
  w.box(outerL - wall, 0, floor, wall, outerW, wallH);
  // 排针端墙（x = 0）：两段 + 上横梁 → 中间留出线槽
  const segW = (outerW - pinSlotW) / 2;
  w.box(0, 0, floor, wall, segW, wallH);
  w.box(0, outerW - segW, floor, wall, segW, wallH);
  w.box(0, segW, floor + pinSlotH, wall, pinSlotW, wallH - pinSlotH);
  w.save(path.join(__dirname, 'zeeho_vci_case_bottom.stl'), 'zeeho_vci_case_bottom');
}

/* ============ 盖（顶板 + 插入唇；打印后翻转盖到底壳上） ============ */
{
  const w = makeWriter();
  const { outerL, outerW, wall, innerL, innerW } = P;
  const lidT = wall;       // 盖板厚
  const lipH = 2.2;        // 插入唇高
  const lipGap = 0.2;      // 唇与内腔单边间隙
  // 盖板
  w.box(0, 0, 0, outerL, outerW, lidT);
  // 插入唇（朝上打印；装到模块壳上时朝向底壳内腔）
  w.box(wall + lipGap, wall + lipGap, lidT, innerL - lipGap * 2, innerW - lipGap * 2, lipH);
  w.save(path.join(__dirname, 'zeeho_vci_case_lid.stl'), 'zeeho_vci_case_lid');
}

console.log('\n完成。尺寸：外盒 ' + P.outerL.toFixed(1) + ' × ' + P.outerW.toFixed(1) + ' × ' + P.totalH.toFixed(1) + ' mm');
console.log('提示：两个 STL 在切片软件中可直接打印（重叠实体自动合并）；建议 PLA/PETG，0.2mm 层高，无需支撑。');