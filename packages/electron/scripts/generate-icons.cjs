'use strict';

/**
 * Uygulama ikonlarını üretir.
 *
 * Kaynak: packages/client/public/logo.png
 * Çıktı : packages/electron/build/
 *   - icon.icns  (macOS)
 *   - icon.ico   (Windows)
 *   - icon.png   (1024×1024, genel)
 *
 * Logonun zemini siyah olduğu için ikon, logonun kendi zeminiyle uyumlu
 * yuvarlatılmış siyah bir kare üzerine ortalanır. Böylece logonun dikdörtgen
 * sınırları görünmez.
 *
 * Kullanım: npm run icons --workspace=@oto-servis/electron
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const electronDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(electronDir, '..', '..');
const sourceLogo = path.join(repoRoot, 'packages', 'client', 'public', 'logo.png');
const outDir = path.join(electronDir, 'build');

const SIZE = 1024;
const CORNER_RADIUS = Math.round(SIZE * 0.2237); // macOS Big Sur tarzı
const LOGO_WIDTH_RATIO = 0.88;

function log(msg) {
  console.log(`[ICON] ${msg}`);
}

function fail(msg) {
  console.error(`[ICON] HATA: ${msg}`);
  process.exit(1);
}

async function buildBaseIcon() {
  if (!fs.existsSync(sourceLogo)) {
    fail(`logo bulunamadı: ${sourceLogo}`);
  }

  const background = { r: 0, g: 0, b: 0, alpha: 1 };
  const logoWidth = Math.round(SIZE * LOGO_WIDTH_RATIO);

  // Kaynak görselin kenarlarında (özellikle sağ kenarda) sıkıştırma
  // artefaktları var; ikonda ince çizgi olarak görünmemesi için kırp.
  const sourceMeta = await sharp(sourceLogo).metadata();
  const inset = 2;
  const cropped = await sharp(sourceLogo)
    .extract({
      left: inset,
      top: inset,
      width: sourceMeta.width - inset * 2,
      height: sourceMeta.height - inset * 2,
    })
    .toBuffer();

  // Logoyu yüksek kalitede ölçekle ve siyah zemine ortala.
  const logo = await sharp(cropped)
    .resize({ width: logoWidth, kernel: 'lanczos3' })
    .sharpen({ sigma: 1 })
    .png()
    .toBuffer();

  const logoMeta = await sharp(logo).metadata();

  const canvas = await sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background,
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer();

  // Yuvarlatılmış köşe maskesi (alfa kanalı ile).
  const mask = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${SIZE}" height="${SIZE}" ` +
      `rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}" fill="#ffffff"/></svg>`
  );

  const rounded = await sharp(canvas)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  log(`kaynak logo: ${logoMeta.width}×${logoMeta.height} (ölçeklenen: ${logoWidth}px genişlik)`);
  return rounded;
}

async function writePng(base, size, file) {
  await sharp(base).resize(size, size, { kernel: 'lanczos3' }).png().toFile(file);
}

async function writeIcns(base) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oto-iconset-'));
  // iconutil, klasör adının ".iconset" ile bitmesini zorunlu tutar.
  const iconset = path.join(tempRoot, 'icon.iconset');
  fs.mkdirSync(iconset);
  const entries = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];

  for (const [name, size] of entries) {
    await writePng(base, size, path.join(iconset, name));
  }

  const icnsPath = path.join(outDir, 'icon.icns');
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icnsPath], { stdio: 'inherit' });
  fs.rmSync(tempRoot, { recursive: true, force: true });
  log(`oluşturuldu: ${icnsPath}`);
}

/**
 * PNG görüntülerini tek bir .ico dosyasında birleştirir.
 * Windows Vista ve sonrası PNG sıkıştırmalı ICO girdilerini destekler.
 */
function writeIco(images, file) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const entries = [];
  const payloads = [];
  let offset = 6 + count * 16;

  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    payloads.push(data);
    offset += data.length;
  }

  fs.writeFileSync(file, Buffer.concat([header, ...entries, ...payloads]));
  log(`oluşturuldu: ${file}`);
}

async function writeIcoFile(base) {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = [];
  for (const size of sizes) {
    const data = await sharp(base).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
    images.push({ size, data });
  }
  writeIco(images, path.join(outDir, 'icon.ico'));
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  log('ikon tabanı hazırlanıyor...');
  const base = await buildBaseIcon();

  const pngPath = path.join(outDir, 'icon.png');
  await sharp(base).png().toFile(pngPath);
  log(`oluşturuldu: ${pngPath}`);

  await writeIcns(base);
  await writeIcoFile(base);

  log('hazır ✔');
}

main().catch((err) => {
  fail(err && err.stack ? err.stack : String(err));
});
