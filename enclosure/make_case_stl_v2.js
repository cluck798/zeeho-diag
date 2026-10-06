// make_case_stl_v2.js — 一体式直插诊断器外壳（模块仓 + OBD 插头盒）
// 使用：标准 OBD-II 16 针公头（淘宝搜「OBD2 公头 焊接式」，≈28.5×12.5mm 标准件）
// 结构：上半 = 模块仓（开口朝上，配盖）；下半 = 插头盒（开口朝下，塞入 OBD 公头，热熔胶固定）
// 走线：模块排针端墙开槽（12×4）→ 沿壁垂下 → 插头盒后墙槽（12 宽）进入内部 → 焊到插头的 7/15 脚
// 用法：node make_case_stl_v2.js → zeeho_vci_case_v2_bottom.stl / zeeho_vci_case_v2_lid.stl
const fs = require('fs');
const path = require('path');

const P = {
  // 模块（同 v1）
  boardL: 30.46, boardW: 14.02, clear: 0.7,
  wall: 1.6, floor: 1.6, cavityH: 9.0,
  pinSlotW: 12.0, pinSlotH: 4.0,
  // 插头盒（OBD-II 16 针公头：本体约 30 宽 × 20 厚，插头长 ≈25；尺寸宽松留胶固余量）
  obdW: 35.06,     // 插头盒宽（X）——与模块仓外宽齐平
  obdD: 23.0,      // 插头盒深（Y，容纳插头 20 厚 + 间隙）
  obdH: 26.0,      // 插头盒高（Z，容纳插头长 25 + 接线空间）
  obdSlotW: 12.0   // 后墙走线槽宽（与模块仓槽同宽对齐）
};
P.innerL = P.boardL + P.clear * 2;      // 31.86
P.innerW = P.boardW + P.clear * 2;      // 15.42
P.outerL = P.innerL + P.wall * 2;       // 35.06
P.outerW = P.innerW + P.wall * 2;       // 18.62
P.totalH = P.floor + P.cavityH;         // 10.6（模块仓总高）
// 插头盒在 X/Y 居中于模块仓
P.obdX = (P.outerL - P.obdW) / 2;       // 0（与模块仓齐平）
P.obdY = (P.outerW - P.obdD) / 2;       // -2.19（两侧各外凸 2.2，插头本体较宽所致）

function makeWriter() {
  const tris = [];
  return {
    box(x, y, z, sx, sy, sz) {
      const v = [
        [x, y, z], [x + sx, y, z], [x + sx, y + sy, z], [x, y + sy, z],
        [x, y, z + sz], [x + sx, y, z + sz], [x + sx, y + sy, z + sz], [x, y + sy, z + sz]
      ];
      const faces = [
        [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
        [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2],
        [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]
      ];
      for (const f of faces) tris.push([v[f[0]], v[f[1]], v[f[2]]]);
    },
    save(file, name) {
      let out = 'solid ' + name + '\n';
      for (const t of tris) {
        out += '  facet normal ' + normal(t[0], t[1], t[2]).join(' ') + '\n    outer loop\n';
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

/* ============ 底壳 ============ */
{
  const w = makeWriter();
  const { outerL, outerW, wall, floor, cavityH, pinSlotW, pinSlotH } = P;
  const wallH = cavityH;

  /* ---- 上半：模块仓（z 0 ~ 10.6，开口朝上） ---- */
  w.box(0, 0, 0, outerL, outerW, floor);                             // 底板
  w.box(0, 0, floor, outerL, wall, wallH);                           // 左长墙
  w.box(0, outerW - wall, floor, outerL, wall, wallH);               // 右长墙
  w.box(outerL - wall, 0, floor, wall, outerW, wallH);               // 天线端墙（整块）
  const segM = (outerW - pinSlotW) / 2;                              // 排针端墙两段
  w.box(0, 0, floor, wall, segM, wallH);
  w.box(0, outerW - segM, floor, wall, segM, wallH);
  w.box(0, segM, floor + pinSlotH, wall, pinSlotW, wallH - pinSlotH); // 排针端墙上横梁（下方留 12×4 出线槽）

  /* ---- 下半：插头盒（z -21.6 ~ 0，开口朝下） ---- */
  const { obdW, obdD, obdH, obdSlotW, obdX, obdY } = P;
  const obdZ = -1.6 - obdH;                                          // -21.6
  w.box(obdX, obdY, -1.6, obdW, obdD, floor);                        // 顶板（模块仓底板的下方封层）
  w.box(obdX + obdW - wall, obdY, obdZ, wall, obdD, obdH);           // 前墙（远离模块仓槽的一侧）
  w.box(obdX, obdY, obdZ, obdW, wall, obdH);                         // 左墙
  w.box(obdX, obdY + obdD - wall, obdZ, obdW, wall, obdH);           // 右墙
  const segO = (obdD - obdSlotW) / 2;                                // 后墙两段（中间 12 宽全高走线槽）
  w.box(obdX, obdY, obdZ, wall, segO, obdH);
  w.box(obdX, obdY + obdD - segO, obdZ, wall, segO, obdH);

  w.save(path.join(__dirname, 'zeeho_vci_case_v2_bottom.stl'), 'zeeho_vci_case_v2_bottom');
}

/* ============ 盖（模块仓顶盖 + 套合唇） ============ */
{
  const w = makeWriter();
  const { outerL, outerW, wall, innerL, innerW } = P;
  const lipH = 2.2, lipGap = 0.2;
  w.box(0, 0, 0, outerL, outerW, wall);                              // 盖板
  w.box(wall + lipGap, wall + lipGap, wall, innerL - lipGap * 2, innerW - lipGap * 2, lipH); // 唇
  w.save(path.join(__dirname, 'zeeho_vci_case_v2_lid.stl'), 'zeeho_vci_case_v2_lid');
}

console.log('\n一体式直插诊断器外壳：');
console.log('  底壳 = 模块仓(' + P.outerL.toFixed(1) + '×' + P.outerW.toFixed(1) + '×' + P.totalH.toFixed(1) + ') + 插头盒(' + P.obdW.toFixed(0) + '×' + P.obdD.toFixed(0) + '×' + P.obdH.toFixed(0) + ')');
console.log('装配：① OBD 公头从底部开口塞入插头盒（热熔胶固定）');
console.log('      ② 模块排针焊 4 线（A/B → 插头 7/15 脚，VCC/GND → 4/5 脚或外接 5V）');
console.log('      ③ 线从模块仓出线槽垂下 → 经插头盒后墙槽进入焊接 ④ 盖上盖');

/* ============ 侧视预览图（SVG） ============ */
{
  const S = 7;                          // px/mm
  const zTop = P.totalH, zBot = -1.6 - P.obdH;
  const padL = 26, padT = 20, padR = 26, padB = 34;
  const wpx = P.outerL * S + padL + padR;
  const hpx = (zTop - zBot) * S + padT + padB;
  const X = mm => (padL + mm * S).toFixed(1);
  const Y = mm => (padT + (zTop - mm) * S).toFixed(1);
  const R = (x, z, sx, sz, fill, stroke) =>
    '<rect x="' + X(x) + '" y="' + Y(z + sz) + '" width="' + (sx * S).toFixed(1) + '" height="' + (sz * S).toFixed(1) +
    '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.2"/>';
  let g = '';
  // 模块仓
  g += R(0, 0, P.outerL, P.totalH, '#1f3b5c', '#6fb3ff');
  // 插头盒
  g += R(0, zBot, P.obdW, P.obdH + P.floor, '#1f3b5c', '#6fb3ff');
  // OBD 插头（示意：本体 + 舌片）
  g += R(2.5, zBot + 1, P.obdW - 5, P.obdH - 3, '#2c5282', '#9ecbff');
  // 模块（示意）
  g += R(P.wall + 2, P.floor, P.boardL, 4.5, '#3b6ea5', '#9ecbff');
  // 走线槽（模块排针端）
  g += R(0, P.floor, P.wall, P.pinSlotH, '#0d1b2a', '#7fd1a6');
  // 走线槽（插头盒后墙）
  g += R(0, zBot, P.wall, P.obdH, '#0d1b2a', '#7fd1a6');
  // 标注
  g += '<text x="' + X(P.outerL / 2) + '" y="' + (Y(P.totalH) - 6) + '" fill="#cfe3ff" font-size="11" text-anchor="middle">模块仓（配盖）</text>';
  g += '<text x="' + X(P.obdW / 2) + '" y="' + (Y(zBot + P.obdH / 2)) + '" fill="#cfe3ff" font-size="11" text-anchor="middle">OBD-II 16针公头（塞入+胶固）</text>';
  g += '<text x="' + X(P.outerL / 2) + '" y="' + (Y(zBot) + 22) + '" fill="#8fb7e0" font-size="10" text-anchor="middle">↓ 插入车身诊断座</text>';
  g += '<text x="' + X(0) + '" y="' + (Y(P.floor + P.pinSlotH) + 22) + '" fill="#7fd1a6" font-size="10" text-anchor="start">走线槽</text>';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + wpx.toFixed(0) + '" height="' + hpx.toFixed(0) + '" viewBox="0 0 ' + wpx.toFixed(0) + ' ' + hpx.toFixed(0) + '">' +
    '<rect width="100%" height="100%" fill="#0d1b2a"/>' + g + '</svg>';
  fs.writeFileSync(path.join(__dirname, 'zeeho_vci_case_v2_preview.svg'), svg, 'utf8');
  console.log('written zeeho_vci_case_v2_preview.svg（侧视结构预览，浏览器可直接打开）');
}