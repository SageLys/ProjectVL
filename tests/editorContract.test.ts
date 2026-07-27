import { ATOM_CONTRACT, ATOM_NAMES } from '../src/core/effects/atomContract';
import type { AtomName } from '../src/core/effects/defs';
import { WRITABLE_DOMAINS } from '../src/config/pipeline';
import type { ValidationIssue } from '../src/config/validateAll';
import { ConfigApi, type EditorFetch } from '../src/editor/api';
import { EDITOR_DOMAINS, reportHasErrors, type ValidationReportDto } from '../src/editor/contracts';
import { ConfigSaveFlow } from '../src/editor/saveFlow';

const okReport = (): ValidationReportDto => ({ ok: true, issues: [], checks: ['mock'] });
const errorReport = (): ValidationReportDto => ({
  ok: false,
  checks: ['mock'],
  issues: [{
    level: 'error',
    layer: 'reference',
    domain: 'gods',
    path: '$.gods.gods[0].anchorCardIds',
    message: '引用了不存在的卡',
  }],
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('editor contract smoke', () => {
  it('keeps the editor domain list aligned with the pipeline registry', () => {
    expect(EDITOR_DOMAINS).toEqual(Object.keys(WRITABLE_DOMAINS));
  });

  it('has a runtime contract entry for every AtomName', () => {
    const exhaustive: Record<AtomName, unknown> = ATOM_CONTRACT;
    expect(ATOM_NAMES).toEqual(Object.keys(exhaustive));
    expect(ATOM_NAMES.every(name => Boolean(ATOM_CONTRACT[name]))).toBe(true);
  });

  it('preserves the issue fields required for editor navigation', () => {
    const issue: ValidationIssue = {
      level: 'warning',
      layer: 'semantic',
      domain: 'skills',
      path: '$.skills.cards[0]',
      message: 'mock warning',
    };
    expect(Object.keys(issue)).toEqual(expect.arrayContaining(['level', 'domain', 'path', 'message']));
  });

  it('validates before saving and disables the write path on errors', async () => {
    const calls: string[] = [];
    const fetcher: EditorFetch = async input => {
      const url = String(input);
      calls.push(url);
      if (url === '/__config/validate') return json(200, { ok: false, report: errorReport() });
      return json(500, { ok: false, error: 'write must not be called' });
    };
    const flow = new ConfigSaveFlow(new ConfigApi(fetcher));
    const result = await flow.save([{ domain: 'gods', data: { invalid: true }, original: {} }]);

    expect(result.ok).toBe(false);
    expect(result.stage).toBe('validate');
    expect(reportHasErrors(result.reports.gods)).toBe(true);
    expect(ConfigSaveFlow.canSave(Object.values(result.reports).filter(Boolean))).toBe(false);
    expect(calls).toEqual(['/__config/validate']);
  });

  it('keeps a 422 candidate uncommitted and retains its report', async () => {
    let landed = false;
    const fetcher: EditorFetch = async input => {
      const url = String(input);
      if (url === '/__config/validate') return json(200, { ok: true, report: okReport() });
      if (url === '/__config/write') return json(422, {
        ok: false,
        error: '配置校验未通过，已拒绝写盘',
        path: 'src/config/base/gods.json',
        report: errorReport(),
      });
      landed = true;
      return json(500, {});
    };
    const flow = new ConfigSaveFlow(new ConfigApi(fetcher));
    const result = await flow.save([{ domain: 'gods', data: { candidate: true }, original: {} }]);

    expect(result.ok).toBe(false);
    expect(result.stage).toBe('write');
    expect(result.writes.gods?.ok).toBe(false);
    expect(reportHasErrors(result.reports.gods)).toBe(true);
    expect(landed).toBe(false);
  });

  it('covers the validate to successful write path', async () => {
    const calls: string[] = [];
    const fetcher: EditorFetch = async input => {
      const url = String(input);
      calls.push(url);
      if (url === '/__config/validate') return json(200, { ok: true, report: okReport() });
      return json(200, { ok: true, path: 'src/config/base/combat.json', report: okReport() });
    };
    const flow = new ConfigSaveFlow(new ConfigApi(fetcher));
    const result = await flow.save([{ domain: 'combat', data: { value: 2 }, original: { value: 1 } }]);

    expect(result.ok).toBe(true);
    expect(result.stage).toBe('done');
    expect(calls).toEqual(['/__config/validate', '/__config/write']);
  });
});
