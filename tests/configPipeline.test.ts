// 配置管线 v1（T0.6）：三层校验 + 写回前置校验 + 规范序列化。
// 这里只测纯逻辑；dev 端点 /__config/* 只是这套 API 的 HTTP 外壳。
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { VARIANTS, buildConfig } from '../src/config';
import { isStableJson, stableJson } from '../src/config/format';
import {
  WRITABLE_DOMAINS, isWritableDomain, prepareWrite, validateCandidate, validateCurrentConfig,
} from '../src/config/pipeline';
import { validateGameConfig, type TextsLike } from '../src/config/validateAll';
import { texts } from '../src/data';
import { resetTestEnv } from './helpers';

const BASE_DIR = 'src/config/base';

beforeEach(resetTestEnv);

describe('配置管线 · 当前配置必须通过', () => {
  it('base 与全部已注册 variant 都零错误', () => {
    const report = validateCurrentConfig();
    const errors = report.issues.filter(issue => issue.level === 'error');
    expect(errors).toEqual([]);
    expect(report.ok).toBe(true);
    for (const entry of report.variants) {
      expect(entry.report.issues.filter(issue => issue.level === 'error'), entry.variant).toEqual([]);
    }
    expect(report.variants.map(entry => entry.variant)).toContain('dev-short');
  });

  it('三层检查都真的跑了', () => {
    const { checks } = validateCurrentConfig();
    expect(checks.some(name => name.startsWith('schema:'))).toBe(true);
    expect(checks.some(name => name.startsWith('reference:'))).toBe(true);
    expect(checks.some(name => name.startsWith('semantic:'))).toBe(true);
    expect(checks).toContain('semantic:affixSinkConsumers');
  });
});

describe('配置管线 · 域注册表', () => {
  it('base 下每个配置文件都有对应的可写域，没有遗漏', () => {
    const files = readdirSync(BASE_DIR).filter(name => name.endsWith('.json')).sort();
    const registered = Object.values(WRITABLE_DOMAINS)
      .filter(path => path.startsWith(BASE_DIR))
      .map(path => path.slice(BASE_DIR.length + 1))
      .sort();
    expect(registered).toEqual(files);
    expect(WRITABLE_DOMAINS.texts).toBe('src/data/texts.json');
  });

  it('域名白名单拒绝未知域', () => {
    expect(isWritableDomain('skills')).toBe(true);
    expect(isWritableDomain('nope')).toBe(false);
    expect(isWritableDomain(undefined)).toBe(false);
  });
});

describe('配置管线 · 写回先校验后写', () => {
  it('合法数据：返回规范序列化后的内容', () => {
    const data = JSON.parse(readFileSync(WRITABLE_DOMAINS.economy, 'utf8')) as unknown;
    const decision = prepareWrite({ domain: 'economy', data });
    expect(decision.ok).toBe(true);
    expect(decision.path).toBe('src/config/base/economy.json');
    // 原样写回 = 零 diff（磁盘上的文件已是规范格式）。
    expect(decision.content).toBe(readFileSync(WRITABLE_DOMAINS.economy, 'utf8'));
  });

  it('坏引用：拒写并给出定位', () => {
    const gods = JSON.parse(readFileSync(WRITABLE_DOMAINS.gods, 'utf8')) as { gods: Array<{ anchorCardIds: string[] }> };
    gods.gods[0].anchorCardIds = ['noSuchCard'];
    const decision = prepareWrite({ domain: 'gods', data: gods });
    expect(decision.ok).toBe(false);
    expect(decision.content).toBeUndefined();
    expect(decision.report.issues.some(issue => issue.level === 'error' && issue.message.includes('noSuchCard'))).toBe(true);
  });

  it('语义错误：Boss 波次超出总波数会被拦下（加载时本会被静默丢弃）', () => {
    const waves = JSON.parse(readFileSync(WRITABLE_DOMAINS.waves, 'utf8')) as { bossWaves: number[]; totalWaves: number };
    waves.bossWaves = [1, waves.totalWaves + 5];
    const report = validateCandidate('waves', waves);
    expect(report.ok).toBe(false);
    expect(report.issues.some(issue => issue.path.startsWith('$.waves.bossWaves') && issue.message.includes('不可达'))).toBe(true);
  });

  it('每个已注册 variant 都独立复验，ok 是 base 与全部 variant 的合取', () => {
    const waves = JSON.parse(readFileSync(WRITABLE_DOMAINS.waves, 'utf8')) as { bossWaves: number[]; totalWaves: number };
    waves.bossWaves = [waves.totalWaves + 5];
    const report = validateCandidate('waves', waves);
    expect(report.variants.map(entry => entry.variant)).toEqual(Object.keys(VARIANTS));
    // dev-short 自己覆盖了 bossWaves，所以它那份报告干净——但 base 不干净，合取后整体仍是 false。
    const devShort = report.variants.find(entry => entry.variant === 'dev-short')!;
    expect(devShort.report.ok).toBe(true);
    expect(report.issues.some(issue => issue.level === 'error')).toBe(true);
    expect(report.ok).toBe(false);
  });

  it('文案缺失会被跨引用层抓到', () => {
    const config = buildConfig([]);
    const stripped = { ...(texts as TextsLike), relics: {} };
    const report = validateGameConfig(config, stripped);
    expect(report.ok).toBe(false);
    expect(report.issues.some(issue => issue.domain === 'texts' && issue.message.includes('文案缺失'))).toBe(true);
  });
});

describe('配置管线 · 规范序列化', () => {
  it('全部配置文件都已是规范格式（工具写回与手工编辑同字节）', () => {
    for (const path of Object.values(WRITABLE_DOMAINS)) {
      expect(isStableJson(readFileSync(path, 'utf8')), path).toBe(true);
    }
  });

  it('序列化幂等，且默认保留源键序', () => {
    const source = '{\n  "b": 1,\n  "a": {\n    "z": [\n      1,\n      2\n    ],\n    "y": null\n  }\n}\n';
    expect(stableJson(JSON.parse(source))).toBe(source);
    expect(stableJson(JSON.parse(stableJson(JSON.parse(source))))).toBe(source);
    expect(stableJson(JSON.parse(source), { sortKeys: true })).toContain('"a"');
    expect(stableJson(JSON.parse(source), { sortKeys: true }).indexOf('"a"'))
      .toBeLessThan(stableJson(JSON.parse(source), { sortKeys: true }).indexOf('"b"'));
  });

  it('结尾必有换行、缩进为 2 空格', () => {
    const text = stableJson({ a: { b: 1 } });
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n    "b": 1');
    expect(text.includes('\r')).toBe(false);
  });

  it('非法 JSON 不会被误判为规范格式', () => {
    expect(isStableJson('{ not json')).toBe(false);
    expect(isStableJson(join('{"a":1}'))).toBe(false);
  });
});
