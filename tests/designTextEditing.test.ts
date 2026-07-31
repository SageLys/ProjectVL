import { ConfigApi, type EditorFetch } from '../src/editor/api';
import type { ValidationReportDto } from '../src/editor/contracts';
import { DesignTextSaveCoordinator } from '../src/design/textSave';

const okReport = (): ValidationReportDto => ({ ok: true, issues: [], checks: ['mock'] });
const errorReport = (): ValidationReportDto => ({
  ok: false,
  checks: ['mock'],
  issues: [{
    level: 'error',
    layer: 'reference',
    domain: 'texts',
    path: '$.texts.evolution.chainLightning.chainLightningA.summary',
    message: 'mock 文案候选被拒绝',
  }],
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('design texts validate and save flow', () => {
  it('validates the live texts candidate, then preflights and writes it through ConfigSaveFlow', async () => {
    const calls: Array<{ url: string; payload: { domain?: string; data?: unknown } }> = [];
    const fetcher: EditorFetch = async (input, init) => {
      const url = String(input);
      const payload = JSON.parse(String(init?.body)) as { domain?: string; data?: unknown };
      calls.push({ url, payload });
      if (url === '/__config/validate') return json(200, { ok: true, report: okReport() });
      return json(200, { ok: true, path: 'src/data/texts.json', report: okReport() });
    };
    const coordinator = new DesignTextSaveCoordinator(new ConfigApi(fetcher));
    const original = { cards: { chainLightning: { overview: 'before' } } };
    const candidate = { cards: { chainLightning: { overview: 'after' } } };

    expect((await coordinator.validate(candidate)).ok).toBe(true);
    const result = await coordinator.save(candidate, original);

    expect(result.ok).toBe(true);
    expect(calls.map(call => call.url)).toEqual(['/__config/validate', '/__config/validate', '/__config/write']);
    expect(calls.every(call => call.payload.domain === 'texts')).toBe(true);
    expect(calls[2].payload.data).toEqual(candidate);
  });

  it('retains the in-memory candidate when a 422 write is rejected and never reports a landed write', async () => {
    let landed = false;
    const fetcher: EditorFetch = async input => {
      const url = String(input);
      if (url === '/__config/validate') return json(200, { ok: true, report: okReport() });
      if (url === '/__config/write') return json(422, {
        ok: false,
        error: '配置校验未通过，已拒绝写盘',
        path: 'src/data/texts.json',
        report: errorReport(),
      });
      landed = true;
      return json(500, {});
    };
    const coordinator = new DesignTextSaveCoordinator(new ConfigApi(fetcher));
    const original = { evolution: { chainLightning: { chainLightningA: { summary: 'before' } } } };
    const candidate = { evolution: { chainLightning: { chainLightningA: { summary: 'unsaved candidate' } } } };
    const snapshot = structuredClone(candidate);

    const result = await coordinator.save(candidate, original);

    expect(result).toMatchObject({ ok: false, stage: 'write' });
    expect(result.reports.texts?.issues[0]?.path).toContain('chainLightningA.summary');
    expect(candidate).toEqual(snapshot);
    expect(landed).toBe(false);
  });
});
