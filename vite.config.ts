import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { networkInterfaces } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import qrcode from 'qrcode-terminal';
import { mergeBaselineDocument, type BaselinePayload } from './src/telemetry/baseline';

function localAddresses(port: number): string[] {
  const privateRank = (address: string): number => address.startsWith('192.168.') ? 0 : address.startsWith('10.') ? 1 : 2;
  return Object.values(networkInterfaces()).flatMap(entries => entries ?? [])
    .filter(entry => entry.family === 'IPv4' && !entry.internal)
    .filter(entry => entry.address.startsWith('10.') || entry.address.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(entry.address))
    .sort((a, b) => privateRank(a.address) - privateRank(b.address))
    .map(entry => `http://${entry.address}:${port}/calibrate`);
}

function calibrationDevPlugin(): Plugin {
  return {
    name: 'projectvl-calibration-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__calibration/export', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body) as { markdown?: unknown };
            if (typeof payload.markdown !== 'string') throw new Error('markdown 字段缺失');
            await writeFile(resolve(process.cwd(), 'docs/T1_触控校准记录.md'), payload.markdown, 'utf8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: true }));
          } catch (error) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: String(error) }));
          }
        });
      });
      server.middlewares.use('/__tuner/preset', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body) as { name?: unknown; preset?: unknown };
            if (typeof payload.name !== 'string' || !payload.name.trim()) throw new Error('preset 名称缺失');
            if (!payload.preset || typeof payload.preset !== 'object') throw new Error('preset 内容缺失');
            const safeName = payload.name.trim().replace(/[^\w\u4e00-\u9fa5-]+/g, '_').replace(/^_+|_+$/g, '') || 'preset';
            const directory = resolve(process.cwd(), 'presets');
            const filename = `${safeName}.tuner.json`;
            await mkdir(directory, { recursive: true });
            await writeFile(resolve(directory, filename), `${JSON.stringify(payload.preset, null, 2)}\n`, 'utf8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: true, path: `presets/${filename}` }));
          } catch (error) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: String(error) }));
          }
        });
      });
      server.middlewares.use('/__telemetry/session', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body) as { filename?: unknown; session?: unknown };
            if (typeof payload.filename !== 'string' || !/^session_[\w.\-]+\.json$/.test(payload.filename)) throw new Error('非法会话文件名');
            if (!payload.session || typeof payload.session !== 'object') throw new Error('session 内容缺失');
            const directory = resolve(process.cwd(), 'telemetry');
            await mkdir(directory, { recursive: true });
            await writeFile(resolve(directory, payload.filename), `${JSON.stringify(payload.session, null, 2)}\n`, 'utf8');
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: true, path: `telemetry/${payload.filename}` }));
          } catch (error) {
            res.statusCode = 400; res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: String(error) }));
          }
        });
      });
      server.middlewares.use('/__telemetry/baseline', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body) as Partial<BaselinePayload>;
            if (!payload.meta || !payload.config || !payload.session || typeof payload.session.id !== 'string') throw new Error('手感基线字段缺失');
            const target = resolve(process.cwd(), 'docs/P6_手感基线_v1.json');
            let previous: unknown = {};
            try { previous = JSON.parse(await readFile(target, 'utf8')) as unknown; } catch { /* 首次导出 */ }
            const baseline = mergeBaselineDocument(previous, payload as BaselinePayload);
            await writeFile(target, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
            res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: true, path: 'docs/P6_手感基线_v1.json', sessions: baseline.sessions.length }));
          } catch (error) {
            res.statusCode = 400; res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: String(error) }));
          }
        });
      });
    },
    configurePreviewServer() {},
  };
}

function lanQrPlugin(): Plugin {
  return {
    name: 'projectvl-lan-qr',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address();
        const port = typeof address === 'object' && address ? address.port : 5173;
        const urls = localAddresses(port);
        if (!urls.length) return console.log('\n[calibrate] 未发现可用的局域网 IPv4 地址。');
        console.log('\n[calibrate] 手机与电脑连接同一局域网后打开：');
        for (const url of urls) console.log(`  ${url}`);
        console.log('[calibrate] 扫码打开首个地址：');
        qrcode.generate(urls[0], { small: true });
      });
    },
  };
}

// 原型工程：根目录即项目根，index.html 为入口，dist/ 为构建产物。
export default defineConfig({
  root: '.',
  // 相对基路径：便于直接以 file:// 打开 dist/index.html 做离线验收。
  base: './',
  plugins: [calibrationDevPlugin(), lanQrPlugin()],
  define: {
    __GIT_COMMIT__: JSON.stringify((() => { try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })()),
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
