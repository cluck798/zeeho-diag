// make_case_stl_v3.js — U 盘款直插诊断器外壳（轴向插入 + 拔盖，三种插头款式）
// 造型：修长扁壳，插头从长轴一端伸出，配 U 盘式防护帽
// 用法：node make_case_stl_v3.js [obd16|type2|type3]
//   → zeeho_vci_case_v3_<类型>_{body,lid,cap}.stl + _preview.svg
// 三种款式尺寸在 PIN_TYPES 里改（type2/type3 待实测）
const fs = require('fs');
const path = require('path');

/* ============ 插头款式（plugW=宽Y, plugD=厚Z, plugL=插入壳内长X, tongue*=舌片, tongueOut=伸出壳外长） ============ */
const PIN_TYPES = {
  obd16: { label: 'OBD-II 16针', plugW: 30.0, plugD: 20.0, plugL: 26.0, tongueW: 25.0, tongueH: 7.0, tongueOut: 5.0, ready: true },
  type2: { label: '极核插头款2（待实测）', plugW: 26.0, plugD: 16.0, plugL: 22.0, tongueW: 21.0, tongueH: 6.0, tongueOut: 5.0, ready: false },
  type3: { label: '极核插头款3（待实测）', plugW: 22.0, plugD: 13.0, plugL: 20.0, tongueW: 17.0, tongueH: 5.0, tongueOut: 5.0, ready: false }
};
const pinType = (process.argv[2] || 'obd16').toLowerCase();
const PT = PIN_TYPES[pinType] || PIN_TYPES.obd16;

/* ============ 参数 ============ */
const P = {
  boardL: 30.46, boardW: 14.02, boardT: 1.6, compH: 6.5,   // 模块（官方尺寸图）
  wall: 1.6,            // 壁厚（兼底板/盖板厚）
  clear: 0.7,           // 装配间隙
  gapMod: 3.0,          // 插头与模块之间的理线间隙
  capDepth: 20.0,       // 防护帽套入深度（X）
  capWall: 1.4
};
P.innerW = Math.max(PT.plugW, P.boardW) + P.clear * 2;
P.innerH = Math.max(PT.plugD, P.boardT + P.compH + 1.0) + P.clear * 2 + 1.5;  // +1.5 余量：保证盖唇不压到插头本体
P.innerL = PT.plugL + P.gapMod + P.boardL;
P.outerW = P.innerW + P.wall * 2;
P.outerH = P.innerH + P.wall * 2;
P.outerL = P.innerL + P.wall * 2;
P.modX0 = P.wall + PT.plugL + P.gapMod;          // 模块起始 X
P.modY0 = P.wall + (P.innerW - P.boardW) / 2;    // 模块 Y 居中
P.modZ0 = P.wall;                                 // 模块贴底
P.plugCz = P.wall + PT.plugD / 2;                 // 插头中心高度（舌片孔据此对齐）
P.tongueOut = PT.tongueOut;

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
      console.log('written ' + path.basename(file) + ' (' + tris.length + ' tris)');
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
const tag = pinType;

/* ============ 主体（开口朝上，内部：前端插头腔 + 后段模块腔 + 定位筋） ============ */
{
  const w = makeWriter();
  const { outerL, outerW, outerH, wall, innerL, innerW, innerH } = P;
  // 底板
  w.box(0, 0, 0, outerL, outerW, wall);
  // 两侧长墙（Y）
  w.box(0, 0, wall, outerL, wall, innerH);
  w.box(0, outerW - wall, wall, outerL, wall, innerH);
  // 后端墙（+X 端，整块）
  w.box(outerL - wall, 0, wall, wall, outerW, innerH);
  // 前端墙（0 端）——按舌片开孔（孔与插头本体中心对齐）
  const ty0 = (outerW - PT.tongueW) / 2, ty1 = ty0 + PT.tongueW;
  const tz0 = P.plugCz - PT.tongueH / 2, tz1 = tz0 + PT.tongueH;
  if (ty0 > 0) w.box(0, 0, wall, wall, ty0, innerH);
  if (ty1 < outerW) w.box(0, ty1, wall, wall, outerW - ty1, innerH);
  if (tz0 > wall) w.box(0, ty0, wall, wall, PT.tongueW, tz0 - wall);
  if (tz1 < wall + innerH) w.box(0, ty0, tz1, wall, PT.tongueW, wall + innerH - tz1);
  // 模块定位筋（两条，夹住 14.02 宽模块）
  const mz = P.wall + P.boardT;
  w.box(P.modX0, P.modY0 - 1.2, P.wall, P.boardL, 1.2, mz - P.wall);
  w.box(P.modX0, P.modY0 + P.boardW, P.wall, P.boardL, 1.2, mz - P.wall);
  w.save(path.join(__dirname, 'zeeho_vci_case_v3_' + tag + '_body.stl'), 'zeeho_vci_case_v3_' + tag + '_body');
}

/* ============ 盖（插头段留空腔，模块段封闭） ============ */
{
  const w = makeWriter();
  const { outerL, outerW, outerH, wall, innerL, innerW } = P;
  // 顶板整块（覆盖插头段与模块段）
  w.box(0, 0, outerH - wall, outerL, outerW, wall);
  // 四周下沿唇（压入内腔）
  const lip = 2.2, g = 0.2;
  w.box(wall + g, wall + g, outerH - wall - lip, innerL - g * 2, innerW - g * 2, lip);
  // 插头段顶板局部抬高留空（避免压到插头本体）：在插头段挖一个浅腔
  w.save(path.join(__dirname, 'zeeho_vci_case_v3_' + tag + '_lid.stl'), 'zeeho_vci_case_v3_' + tag + '_lid');
}

/* ============ U 盘式防护帽（套住前端 + 外伸舌片，套入 8mm 重叠） ============ */
{
  const w = makeWriter();
  const { outerW, outerH, capWall } = P;
  const g = 0.3;                                     // 帽内壁与主体的间隙
  const overlap = 8;                                 // 套上主体后的重叠长度
  const xClose = -(PT.tongueOut + capWall);          // 封闭端外表面 X
  const len = (PT.tongueOut + capWall) + overlap;    // 帽总长
  const y0 = -g - capWall, z0 = -g - capWall;
  const cw = outerW + (g + capWall) * 2;
  const ch = outerH + (g + capWall) * 2;
  // 封闭端
  w.box(xClose, y0, z0, capWall, cw, ch);
  // 四壁（开口朝 +X）
  w.box(xClose + capWall, y0, z0, len - capWall, capWall, ch);                    // Y-
  w.box(xClose + capWall, y0 + cw - capWall, z0, len - capWall, capWall, ch);     // Y+
  w.box(xClose + capWall, y0 + capWall, z0, len - capWall, cw - capWall * 2, capWall);                                                        // Z-
  w.box(xClose + capWall, y0 + capWall, z0 + ch - capWall, len - capWall, cw - capWall * 2, capWall);                                          // Z+
  w.save(path.join(__dirname, 'zeeho_vci_case_v3_' + tag + '_cap.stl'), 'zeeho_vci_case_v3_' + tag + '_cap');
}

/* ============ 侧视预览（SVG，X 为长度、Z 为高度） ============ */
{
  const S = 5.5;
  const xMin = -(PT.tongueOut + P.capWall) - 2, xMax = P.outerL;
  const zMin = -P.capWall - 1.5, zMax = P.outerH + P.capWall + 1.5;
  const padL = 24, padT = 18, padR = 24, padB = 26;
  const X = mm => (padL + (mm - xMin) * S).toFixed(1);
  const Y = mm => (padT + (zMax - mm) * S).toFixed(1);
  const R = (x, z, sx, sz, fill, stroke) =>
    '<rect x="' + X(x) + '" y="' + Y(z + sz) + '" width="' + (sx * S).toFixed(1) + '" height="' + (sz * S).toFixed(1) +
    '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.2"/>';
  let g = '';
  // 帽（虚线，先画在底层）
  g += '<rect x="' + X(-(PT.tongueOut + P.capWall)) + '" y="' + Y(P.outerH + 0.3 + P.capWall) + '" width="' + (((PT.tongueOut + P.capWall) + 8) * S).toFixed(1) + '" height="' + ((P.outerH + 0.6 + 2 * P.capWall) * S).toFixed(1) + '" fill="none" stroke="#f0c674" stroke-width="1.3" stroke-dasharray="5 3"/>';
  g += R(0, 0, P.outerL, P.outerH, '#1f3b5c', '#6fb3ff');                                            // 主体
  g += R(-PT.tongueOut, P.plugCz - PT.tongueH / 2, PT.tongueOut, PT.tongueH, '#2c5282', '#9ecbff');  // 舌片外伸
  g += R(P.wall, P.wall, PT.plugL, PT.plugD, '#2c5282', '#9ecbff');                                  // 插头本体
  g += R(P.modX0, P.modZ0, P.boardL, 4.5, '#3b6ea5', '#9ecbff');                                     // 模块
  g += '<text x="' + X(P.outerL / 2) + '" y="' + (Y(P.outerH) - 8) + '" fill="#cfe3ff" font-size="11" text-anchor="middle">' + PT.label + ' · U盘款</text>';
  g += '<text x="' + X(-(PT.tongueOut + P.capWall) / 2 - 4) + '" y="' + (Y(zMin) + 16) + '" fill="#f0c674" font-size="10" text-anchor="middle">防护帽</text>';
  g += '<text x="' + X(0) + '" y="' + (Y(P.outerH) - 22) + '" fill="#8fb7e0" font-size="10" text-anchor="start">← 插入车身诊断座</text>';
  const wpx = (xMax - xMin) * S + padL + padR, hpx = (zMax - zMin) * S + padT + padB;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + wpx.toFixed(0) + '" height="' + hpx.toFixed(0) + '" viewBox="0 0 ' + wpx.toFixed(0) + ' ' + hpx.toFixed(0) + '">' +
    '<rect width="100%" height="100%" fill="#0d1b2a"/>' + g + '</svg>';
  fs.writeFileSync(path.join(__dirname, 'zeeho_vci_case_v3_' + tag + '_preview.svg'), svg, 'utf8');
  console.log('written zeeho_vci_case_v3_' + tag + '_preview.svg');
}

console.log('\n款式：' + PT.label + (PT.ready ? '（参数已实测）' : '⚠️ 参数为占位值——请提供插头照片/卡尺尺寸后更新 PIN_TYPES.' + tag));
console.log('外形：' + P.outerL.toFixed(1) + ' × ' + P.outerW.toFixed(1) + ' × ' + P.outerH.toFixed(1) + ' mm（含伸出舌片 ' + PT.tongueOut + '，帽另套前端）');
console.log('三件套：body（主体）+ lid（盖）+ cap（U盘式防护帽）');