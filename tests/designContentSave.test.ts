import { ConfigApi, type EditorFetch } from '../src/editor/api';
import type { ValidationReportDto } from '../src/editor/contracts';
import { DesignContentSaveCoordinator } from '../src/design/contentSave';

const okReport = (): ValidationReportDto => ({ ok: true, issues: [], checks: ['mock'] });
const danglingGodReport = (): ValidationReportDto => ({
  ok: false,
  checks: ['mock'],
  issues: [{
    level: 'error',
    layer: 'reference',
    domain: 'gods',
    path: '$.gods.gods[0].anchorCardIds[0]',
    message: '引用了不存在的卡 missingCard',
  }],
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('design content multi-domain save coordinator', () => {
  it('routes a texts plus entity batch through entity-first atomic preflight and commit', async () => {
    const calls: Array<{ url: string; domain: string }> = [];
    const fetcher: EditorFetch = async (input, init) => {
      const url = String(input);
      const payload = JSON.parse(String(init?.body)) as { domain: string };
      calls.push({ url, domain: payload.domain });
      if (url === '/__config/validate') return json(200, { ok: true, report: okReport() });
      return json(200, { ok: true, path: `mock/${payload.domain}.json`, report: okReport() });
    };
    const coordinator = new DesignContentSaveCoordinator(new ConfigApi(fetcher));
    const result = await coordinator.save([
      { domain: 'texts', data: { copy: 'after' }, original: { copy: 'before' } },
      { domain: 'skills', data: { bounces: 7 }, original: { bounces: 6 } },
    ]);

    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      { url: '/__config/validate', domain: 'skills' },
      { url: '/__config/validate', domain: 'texts' },
      { url: '/__config/write', domain: 'skills' },
      { url: '/__config/write', domain: 'texts' },
    ]);
  });

  it('preflights every dirty entity domain before writing a general batch', async () => {
    const validations: string[] = [];
    const writes: string[] = [];
    const fetcher: EditorFetch = async (input, init) => {
      const url = String(input);
      const payload = JSON.parse(String(init?.body)) as { domain: string };
      if (url === '/__config/validate') {
        validations.push(payload.domain);
        return json(200, { ok: true, report: okReport() });
      }
      writes.push(payload.domain);
      return json(200, { ok: true, path: `mock/${payload.domain}.json`, report: okReport() });
    };
    const coordinator = new DesignContentSaveCoordinator(new ConfigApi(fetcher));
    const result = await coordinator.save([
      { domain: 'skills', data: { changed: true }, original: { changed: false } },
      { domain: 'evolutionRecipes', data: { changed: true }, original: { changed: false } },
    ]);

    expect(result.ok).toBe(true);
    expect(validations).toEqual(['skills', 'evolutionRecipes']);
    expect(writes).toEqual(['skills', 'evolutionRecipes']);
  });

  it('keeps a dangling-reference candidate in memory when the endpoint returns 422', async () => {
    const candidate = { gods: [{ anchorCardIds: ['missingCard'] }] };
    const snapshot = structuredClone(candidate);
    const writes: string[] = [];
    const fetcher: EditorFetch = async (input, init) => {
      const url = String(input);
      const payload = JSON.parse(String(init?.body)) as { domain: string };
      if (url === '/__config/validate') return json(200, { ok: true, report: okReport() });
      writes.push(payload.domain);
      return json(422, {
        ok: false,
        error: '配置校验未通过，已拒绝写盘',
        path: 'src/config/base/gods.json',
        report: danglingGodReport(),
      });
    };
    const coordinator = new DesignContentSaveCoordinator(new ConfigApi(fetcher));
    const result = await coordinator.save([{ domain: 'gods', data: candidate, original: { gods: [] } }]);

    expect(result).toMatchObject({ ok: false, stage: 'write' });
    expect(result.reports.gods?.issues[0]?.path).toBe('$.gods.gods[0].anchorCardIds[0]');
    expect(writes).toEqual(['gods']);
    expect(candidate).toEqual(snapshot);
  });
});
