'use strict';

/**
 * Masaüstü kurulumu (installer) için İZOLE "app" klasörü hazırlar.
 *
 * Neden gerekli?
 *  - Bu depo bir npm WORKSPACE monorepo'sudur; tüm bağımlılıklar kökteki
 *    `node_modules`'e "hoisted" edilir. electron-builder ise bağımlılıkları
 *    uygulama klasöründeki `package.json` + `node_modules` üzerinden toplar.
 *  - Native modüller (better-sqlite3) Electron ABI'si için yeniden derlenir.
 *    Bu derleme KÖK `node_modules`'e dokunursa geliştirme/test ortamı bozulur.
 *
 * Bu betik:
 *  1) `packages/electron/dist-app/` klasörünü baştan oluşturur,
 *  2) Electron kabuğu (main/preload/backup), derlenmiş server/client/shared
 *     çıktılarını MONOREPO düzeniyle (packages/... altına) kopyalar,
 *  3) sunucunun ÜRETİM bağımlılık kapanışını (`npm ls`) kökten dist-app
 *     içine kopyalar (native rebuild bu kopyada olur, kök korunur),
 *  4) electron-builder'ın okuyacağı `package.json` + `electron-builder.yml`
 *     dosyalarını yazar.
 *
 * Ardından `electron-builder --project dist-app` ile kurulum üretilir.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const electronDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(electronDir, '..', '..');
const staging = path.join(electronDir, 'dist-app');
const serverDir = path.join(repoRoot, 'packages', 'server');
const clientDir = path.join(repoRoot, 'packages', 'client');
const sharedDir = path.join(repoRoot, 'packages', 'shared');
const rootNodeModules = path.join(repoRoot, 'node_modules');

const WORKSPACE_SCOPE = '@oto-servis';

function log(msg) {
  console.log(`[PREP] ${msg}`);
}

function fail(msg) {
  console.error(`[PREP] HATA: ${msg}`);
  process.exit(1);
}

function freshDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copy(src, dest) {
  fs.cpSync(src, dest, { recursive: true, dereference: false, force: true });
}

function requireDir(dir, label) {
  if (!fs.existsSync(dir)) {
    fail(`eksik derleme çıktısı: ${label} (${dir}). Önce "npm run build:desktop" çalıştırın.`);
  }
}

// ---------------------------------------------------------------------------
// 0) Ön koşullar
// ---------------------------------------------------------------------------
requireDir(path.join(serverDir, 'dist'), 'packages/server/dist');
requireDir(path.join(clientDir, 'dist'), 'packages/client/dist');
requireDir(path.join(sharedDir, 'dist'), 'packages/shared/dist');

const serverPkg = JSON.parse(fs.readFileSync(path.join(serverDir, 'package.json'), 'utf8'));

// ---------------------------------------------------------------------------
// 1) Temiz staging
// ---------------------------------------------------------------------------
log(`staging oluşturuluyor: ${staging}`);
freshDir(staging);

// ---------------------------------------------------------------------------
// 2) Electron kabuğu + derlenmiş çıktılar (monorepo düzeni korunur)
//    main.cjs, `../server/dist` ve `../client/dist` göreli yollarını kullanır;
//    bu yüzden kopyalama packages/ altına birebir yapılır.
// ---------------------------------------------------------------------------
const electronOut = path.join(staging, 'packages', 'electron');
fs.mkdirSync(electronOut, { recursive: true });
for (const file of ['main.cjs', 'preload.cjs', 'backup.cjs']) {
  copy(path.join(electronDir, file), path.join(electronOut, file));
}

copy(path.join(serverDir, 'dist'), path.join(staging, 'packages', 'server', 'dist'));
copy(path.join(serverDir, 'package.json'), path.join(staging, 'packages', 'server', 'package.json'));

copy(path.join(clientDir, 'dist'), path.join(staging, 'packages', 'client', 'dist'));

copy(path.join(sharedDir, 'dist'), path.join(staging, 'packages', 'shared', 'dist'));
copy(path.join(sharedDir, 'package.json'), path.join(staging, 'packages', 'shared', 'package.json'));

// ---------------------------------------------------------------------------
// 3) Workspace paketi (@oto-servis/shared) → node_modules (gerçek dizin)
// ---------------------------------------------------------------------------
const sharedInModules = path.join(staging, 'node_modules', WORKSPACE_SCOPE, 'shared');
fs.mkdirSync(sharedInModules, { recursive: true });
copy(path.join(sharedDir, 'dist'), path.join(sharedInModules, 'dist'));
copy(path.join(sharedDir, 'package.json'), path.join(sharedInModules, 'package.json'));

// ---------------------------------------------------------------------------
// 4) Sunucunun üretim bağımlılık kapanışı → dist-app/node_modules
// ---------------------------------------------------------------------------
log('üretim bağımlılık ağacı çözümleniyor (npm ls)...');
// Windows'ta yürütülebilir adı farklıdır (npm.cmd).
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let listing = '';
try {
  listing = execFileSync(
    npmBin,
    ['ls', '--parseable', '--omit=dev', '--all', `--workspace=${WORKSPACE_SCOPE}/server`],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32' }
  );
} catch (err) {
  // npm ls, eş bağımlılık uyarılarında sıfır olmayan kodla çıkabilir; çıktı yine de stdout'tadır.
  listing = (err && err.stdout) || '';
}
if (!listing.trim()) fail('bağımlılık listesi alınamadı (npm ls boş).');

const roots = new Set();
for (const raw of listing.split('\n')) {
  const line = raw.trim();
  if (!line.startsWith(rootNodeModules + path.sep)) continue;
  const rel = path.relative(rootNodeModules, line);
  const parts = rel.split(path.sep);
  if (parts[0] === WORKSPACE_SCOPE) continue; // workspace paketleri elle işlendi
  const rootPkg = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  roots.add(rootPkg);
}
if (roots.size === 0) fail('kopyalanacak bağımlılık bulunamadı.');

let copiedCount = 0;
for (const pkg of roots) {
  const src = path.join(rootNodeModules, pkg);
  if (!fs.existsSync(src)) continue;
  const dest = path.join(staging, 'node_modules', pkg);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  copy(src, dest);
  copiedCount += 1;
}
log(`kopyalanan kök bağımlılık paketi: ${copiedCount}`);

// ---------------------------------------------------------------------------
// 5) electron-builder'ın okuyacağı package.json
// ---------------------------------------------------------------------------
const stagingPkg = {
  name: 'oto-servis-desktop',
  version: serverPkg.version || '1.0.0',
  description: 'Oto Servis Yönetimi — çevrimdışı masaüstü sürüm',
  author: 'Çınar Oto',
  main: 'packages/electron/main.cjs',
  dependencies: {
    ...(serverPkg.dependencies || {}),
    [`${WORKSPACE_SCOPE}/shared`]: '1.0.0'
  }
};
fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify(stagingPkg, null, 2) + '\n');

// ---------------------------------------------------------------------------
// 6) electron-builder yapılandırması
// ---------------------------------------------------------------------------
copy(path.join(electronDir, 'electron-builder.yml'), path.join(staging, 'electron-builder.yml'));

log('hazır ✔');
log(`  app kökü : ${staging}`);
log(`  bağımlılık: ${copiedCount} paket`);
