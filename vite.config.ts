import { defineConfig } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import type { ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import qrcode from 'qrcode-terminal';
import { mergeBaselineDocument, type BaselinePayload } from './src/telemetry/baseline';
import { stableJson } from './src/config/format';

function localAddresses(port: number): string[] {
  const privateRank = (address: string): number => address.startsWith('192.168.') ? 0 : address.startsWith('10.') ? 1 : 2;
  return Object.values(networkInterfaces()).flatMap(entries => entries ?? [])
    .filter(entry => entry.family === 'IPv4' && !entry.internal)
    .filter(entry => entry.address.startsWith('10.') || entry.address.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(entry.address))
    .sort((a, b) => privateRank(a.address) - privateRank(b.address))
    .map(entry => `http://${entry.address}:${port}/calibrate`);
}

/** dev 写盘统一出口：所有中间件都经这里落盘，路径一律相对仓库根。 */
async function writeRepoFile(relativePath: string, content: string): Promise<string> {
  const target = resolve(process.cwd(), relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
  return relativePath;
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/** 收集请求体并交给处理器；异常一律折算成 400，避免 dev server 因坏请求崩掉。 */
function postJson(
  server: ViteDevServer,
  route: string,
  handle: (payload: Record<string, unknown>, res: ServerResponse) => Promise<void>,
): void {
  server.middlewares.use(route, (req, res, next) => {
    if (req.method !== 'POST') return next();
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        await handle(JSON.parse(body) as Record<string, unknown>, res);
      } catch (error) {
        jsonResponse(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    });
  });
}

/**
 * 配置管线 v1 的唯一落盘通道：/__config/write。
 * 先经 `src/config/pipeline.ts` 的三层校验（含全部已注册 variant），通过才写；
 * 校验模块经 ssrLoadModule 走 Vite 管线加载，因此与运行时用的是同一份规则、同一份磁盘数据。
 */
function configPipelineDevPlugin(): Plugin {
  return {
    name: 'projectvl-config-pipeline-dev',
    apply: 'serve',
    configureServer(server) {
      const loadPipeline = async () =>
        await server.ssrLoadModule('/src/config/pipeline.ts') as typeof import('./src/config/pipeline');

      /** 写盘后让 SSR 模块图丢弃缓存，下一次校验才读得到新内容。 */
      const invalidate = (relativePath: string): void => {
        for (const mod of server.moduleGraph.getModulesByFile(resolve(process.cwd(), relativePath)) ?? []) {
          server.moduleGraph.invalidateModule(mod);
        }
      };

      postJson(server, '/__config/domains', async (_payload, res) => {
        const pipeline = await loadPipeline();
        jsonResponse(res, 200, { ok: true, domains: pipeline.WRITABLE_DOMAINS });
      });

      // 只校验不写：编辑器的实时校验入口。
      postJson(server, '/__config/validate', async (payload, res) => {
        const pipeline = await loadPipeline();
        if (payload.domain === undefined) {
          const current = pipeline.validateCurrentConfig();
          jsonResponse(res, 200, { ok: current.ok, report: current });
          return;
        }
        if (!pipeline.isWritableDomain(payload.domain)) throw new Error(`未知配置域: ${String(payload.domain)}`);
        const report = pipeline.validateCandidate(payload.domain, payload.data);
        jsonResponse(res, 200, { ok: report.ok, report });
      });

      postJson(server, '/__config/write', async (payload, res) => {
        const pipeline = await loadPipeline();
        if (!pipeline.isWritableDomain(payload.domain)) throw new Error(`未知配置域: ${String(payload.domain)}`);
        if (payload.data === undefined) throw new Error('data 字段缺失');
        const decision = pipeline.prepareWrite({ domain: payload.domain, data: payload.data });
        if (!decision.ok || decision.content === undefined) {
          jsonResponse(res, 422, { ok: false, error: '配置校验未通过，已拒绝写盘', path: decision.path, report: decision.report });
          return;
        }
        await writeRepoFile(decision.path, decision.content);
        invalidate(decision.path);
        jsonResponse(res, 200, { ok: true, path: decision.path, report: decision.report });
      });
    },
  };
}

function calibrationDevPlugin(): Plugin {
  return {
    name: 'projectvl-calibration-dev',
    apply: 'serve',
    configureServer(server) {
      postJson(server, '/__calibration/export', async (payload, res) => {
        if (typeof payload.markdown !== 'string') throw new Error('markdown 字段缺失');
        const path = await writeRepoFile('docs/T1_触控校准记录.md', payload.markdown);
        jsonResponse(res, 200, { ok: true, path });
      });

      postJson(server, '/__tuner/preset', async (payload, res) => {
        if (typeof payload.name !== 'string' || !payload.name.trim()) throw new Error('preset 名称缺失');
        if (!payload.preset || typeof payload.preset !== 'object') throw new Error('preset 内容缺失');
        const safeName = payload.name.trim().replace(/[^\w\u4e00-\u9fa5-]+/g, '_').replace(/^_+|_+$/g, '') || 'preset';
        const path = await writeRepoFile(`presets/${safeName}.tuner.json`, stableJson(payload.preset));
        jsonResponse(res, 200, { ok: true, path });
      });

      postJson(server, '/__telemetry/session', async (payload, res) => {
        if (typeof payload.filename !== 'string' || !/^session_[\w.\-]+\.json$/.test(payload.filename)) throw new Error('非法会话文件名');
        if (!payload.session || typeof payload.session !== 'object') throw new Error('session 内容缺失');
        const path = await writeRepoFile(`telemetry/${payload.filename}`, stableJson(payload.session));
        jsonResponse(res, 200, { ok: true, path });
      });

      postJson(server, '/__telemetry/baseline', async (rawPayload, res) => {
        const payload = rawPayload as Partial<BaselinePayload>;
        if (!payload.meta || !payload.config || !payload.session || typeof payload.session.id !== 'string') throw new Error('手感基线字段缺失');
        const target = resolve(process.cwd(), 'docs/P6_手感基线_v1.json');
        let previous: unknown = {};
        try { previous = JSON.parse(await readFile(target, 'utf8')) as unknown; } catch { /* 首次导出 */ }
        const baseline = mergeBaselineDocument(previous, payload as BaselinePayload);
        const path = await writeRepoFile('docs/P6_手感基线_v1.json', stableJson(baseline));
        jsonResponse(res, 200, { ok: true, path, sessions: baseline.sessions.length });
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
  plugins: [configPipelineDevPlugin(), calibrationDevPlugin(), lanQrPlugin()],
  define: {
    __GIT_COMMIT__: JSON.stringify((() => { try { return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })()),
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
