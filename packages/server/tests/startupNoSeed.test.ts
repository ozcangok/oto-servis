import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * Açılışta örnek/demo veri OTOMATİK yüklenmemelidir.
 *
 * Taze bir veritabanında hiç kullanıcı olmadığı için uygulama doğrudan
 * "İlk Kurulum & Yönetici Şifresi" ekranına düşmelidir; demo hesaplar
 * (admin/admin123 ...) otomatik oluşmamalıdır. Örnek veri yalnızca
 * OTO_SEED_SAMPLE=1 ile açıkça istendiğinde yüklenir.
 *
 * Bu test GERÇEK sunucuyu ayrı bir süreçte (tsx src/index.ts) başlatır ve
 * gerçek HTTP uçlarına bakar; böylece davranış uçtan uca doğrulanır.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(HERE, '..');            // packages/server
const ROOT = path.resolve(SERVER_DIR, '..', '..');      // depo kökü
const TSX_BIN = path.join(ROOT, 'node_modules', '.bin', 'tsx');

const running: ChildProcess[] = [];
const tempDirs: string[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

function startServer(dataDir: string, port: number, env: Record<string, string>): ChildProcess {
  const fullEnv: Record<string, string | undefined> = {
    ...process.env,
    DATA_DIR: dataDir,
    PORT: String(port),
    HOST: '127.0.0.1'
  };
  // Örnek veri anahtarı yalnızca açıkça verilirse geçerli olsun.
  delete fullEnv.OTO_SEED_SAMPLE;
  Object.assign(fullEnv, env);

  const child = spawn(TSX_BIN, ['src/index.ts'], {
    cwd: SERVER_DIR,
    env: fullEnv as NodeJS.ProcessEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  // Boru tamponu tıkanmasın diye çıktıyı tüket (son satırları sakla).
  let tail = '';
  const consume = (buf: Buffer) => { tail = (tail + buf.toString()).slice(-4000); };
  child.stdout?.on('data', consume);
  child.stderr?.on('data', consume);
  (child as any).__tail = () => tail;

  running.push(child);
  return child;
}

async function waitForHealth(baseUrl: string, timeoutMs = 60_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      /* sunucu henüz ayakta değil */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Sunucu sağlık kontrolü zaman aşımına uğradı.');
}

async function stopServer(child: ChildProcess): Promise<void> {
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  const interrupted = await Promise.race([
    exited.then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), 4000))
  ]);
  if (!interrupted) {
    child.kill('SIGKILL');
    await exited;
  }
}

afterEach(async () => {
  for (const child of running.splice(0)) {
    if (child.exitCode === null && !child.killed) {
      child.kill('SIGKILL');
    }
  }
  for (const dir of tempDirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

describe('Açılışta otomatik seed yok (İlk Kurulum akışı)', () => {
  it('OTO_SEED_SAMPLE verilmeden: demo hesap oluşmaz, kurulum GEREKLİ olur', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oto-noseed-'));
    tempDirs.push(dataDir);
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;

    // NODE_ENV=test olsa bile seed ETKİN OLMAMALI (yalnızca açık bayrak tetikler).
    startServer(dataDir, port, { NODE_ENV: 'test' });
    await waitForHealth(baseUrl);

    const statusRes = await fetch(`${baseUrl}/api/auth/setup-status`);
    expect(statusRes.status).toBe(200);
    const status = await statusRes.json() as { needed: boolean };
    expect(status.needed).toBe(true);

    // Demo hesapla giriş yapılamaz.
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    expect(loginRes.status).not.toBe(200);
  }, 90_000);

  it('OTO_SEED_SAMPLE=1 verilince: demo hesaplar ve örnek veri yüklenir', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oto-seed-'));
    tempDirs.push(dataDir);
    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;

    startServer(dataDir, port, { NODE_ENV: 'test', OTO_SEED_SAMPLE: '1' });
    await waitForHealth(baseUrl);

    // Seed asenkron çalışır; hazır olana kadar kısa süre bekle.
    let needed = true;
    for (let i = 0; i < 40 && needed; i++) {
      const res = await fetch(`${baseUrl}/api/auth/setup-status`);
      needed = (await res.json() as { needed: boolean }).needed;
      if (needed) await new Promise((r) => setTimeout(r, 250));
    }
    expect(needed).toBe(false);

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    expect(loginRes.status).toBe(200);
  }, 90_000);
});
