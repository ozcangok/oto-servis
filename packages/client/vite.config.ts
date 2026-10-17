import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// E2E testleri izole bir yığın üzerinde çalışabilmesi için port ve API hedefi
// ortam değişkenleriyle geçersiz kılınabilir. Varsayılanlar geliştirme ortamıdır.
const API_TARGET = process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001';
const CLIENT_PORT = parseInt(process.env.CLIENT_PORT || '5173', 10);

export default defineConfig({
  // Masaüstü (Electron) paketi `file://` üzerinden yüklendiği için varlık
  // yolları GÖRELİ olmalıdır. Web/geliştirme kurulumu etkilenmez.
  base: process.env.ELECTRON_BUILD ? './' : '/',
  plugins: [react()],
  server: {
    port: CLIENT_PORT,
    host: '0.0.0.0',
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true
      },
      '/uploads': {
        target: API_TARGET,
        changeOrigin: true
      }
    }
  }
});
