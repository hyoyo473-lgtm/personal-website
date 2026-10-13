const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function generatePNG(width, height, drawPixel) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
  function crc32(buf) {
    let c = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
      c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xFF];
    }
    return (c ^ (-1)) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = crc32(Buffer.concat([typeBuf, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // Filter byte 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixel(x, y, width, height);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }

  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

// Distance helper for rounded rect
function distRoundedRect(x, y, rx, ry, rw, rh, rad) {
  const cx = Math.max(rx + rad, Math.min(x, rx + rw - rad));
  const cy = Math.max(ry + rad, Math.min(y, ry + rh - rad));
  return Math.hypot(x - cx, y - cy) - rad;
}

// Draw icon pixel
function drawIcon(x, y, w, h) {
  const normX = x / w;
  const normY = y / h;

  // Outer rounded rect radius (22% of size)
  const pad = w * 0.04;
  const rad = w * 0.22;
  const dOuter = distRoundedRect(x, y, pad, pad, w - 2 * pad, h - 2 * pad, rad);

  if (dOuter > 1.5) {
    return [0, 0, 0, 0]; // Transparent
  }

  // Background Gradient (Deep Blue #1e3a8a to Vibrant Blue #2563eb to Cyan #0284c7)
  const gradT = (normX * 0.3 + normY * 0.7);
  let bgR = Math.round(30 + gradT * (37 - 30));
  let bgG = Math.round(58 + gradT * (99 - 58));
  let bgB = Math.round(138 + gradT * (235 - 138));

  // Anti-alias edge
  let alpha = 255;
  if (dOuter > 0) {
    alpha = Math.round(255 * (1 - dOuter / 1.5));
  }

  // Inner shield region
  // Shield coordinates normalized to [0, 1]
  const sx = (normX - 0.5) * 2; // -1 to 1
  const sy = normY; // 0 to 1

  // Shield boundary function
  // Shield width at sy
  let insideShield = false;
  let shieldDist = 999;
  if (sy >= 0.20 && sy <= 0.82) {
    const shieldTop = 0.20;
    const shieldMid = 0.50;
    const shieldBottom = 0.82;
    let maxSx = 0.56;
    if (sy > shieldMid) {
      const t = (sy - shieldMid) / (shieldBottom - shieldMid);
      maxSx = 0.56 * Math.cos(t * Math.PI * 0.5);
    }
    const currentDist = Math.abs(sx) - maxSx;
    if (currentDist <= 0) {
      insideShield = true;
      shieldDist = -currentDist;
    }
  }

  if (insideShield) {
    // Shield color: Bright Clean White to Silver Gradient
    const shieldGrad = (normY - 0.2) / 0.6;
    let sR = Math.round(255 - shieldGrad * 12);
    let sG = Math.round(255 - shieldGrad * 12);
    let sB = Math.round(255 - shieldGrad * 6);

    // Shield border (Royal Blue)
    if (shieldDist < 0.05) {
      sR = 37; sG = 99; sB = 235;
    }

    // Checkmark in the center
    // Check points in norm coords: (0.40, 0.52) -> (0.47, 0.60) -> (0.62, 0.42)
    // Distance to line segments
    const p1 = [0.38, 0.52], p2 = [0.47, 0.61], p3 = [0.63, 0.40];
    function distToSeg(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const projX = x1 + t * dx, projY = y1 + t * dy;
      return Math.hypot(px - projX, py - projY);
    }
    const dCheck1 = distToSeg(normX, normY, p1[0], p1[1], p2[0], p2[1]);
    const dCheck2 = distToSeg(normX, normY, p2[0], p2[1], p3[0], p3[1]);
    const minCheckD = Math.min(dCheck1, dCheck2);

    // Checkmark width
    const checkThickness = 0.038;
    if (minCheckD < checkThickness) {
      // Emerald / Blue Checkmark
      sR = 37; sG = 99; sB = 235;
    } else if (minCheckD < checkThickness + 0.008) {
      // Anti-alias
      const ratio = (minCheckD - checkThickness) / 0.008;
      sR = Math.round(37 * (1 - ratio) + sR * ratio);
      sG = Math.round(99 * (1 - ratio) + sG * ratio);
      sB = Math.round(235 * (1 - ratio) + sB * ratio);
    }

    // Gold Star / Award above the checkmark (normX ~ 0.5, normY ~ 0.28)
    const starDist = Math.hypot(normX - 0.5, normY - 0.28);
    if (starDist < 0.05) {
      sR = 245; sG = 158; sB = 11; // Amber Gold
    }

    return [sR, sG, sB, alpha];
  }

  return [bgR, bgG, bgB, alpha];
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

console.log('Generating PNG icons...');
const buf512 = generatePNG(512, 512, drawIcon);
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), buf512);

const buf192 = generatePNG(192, 192, drawIcon);
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), buf192);

const buf180 = generatePNG(180, 180, drawIcon);
fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon.png'), buf180);

const buf32 = generatePNG(32, 32, drawIcon);
fs.writeFileSync(path.join(iconsDir, 'favicon-32x32.png'), buf32);

console.log('Icons generated successfully:');
console.log('- icon-512.png:', buf512.length, 'bytes');
console.log('- icon-192.png:', buf192.length, 'bytes');
console.log('- apple-touch-icon.png:', buf180.length, 'bytes');
console.log('- favicon-32x32.png:', buf32.length, 'bytes');
