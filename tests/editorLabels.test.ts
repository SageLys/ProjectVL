import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ATOM_CONTRACT, ATOM_NAMES, atomContract } from '../src/core/effects/atomContract';
import { cfg } from '../src/config';
import { WRITABLE_DOMAINS } from '../src/config/pipeline';
import { texts } from '../src/data';
import { describeLabel, labelWithKey, lookupLabel } from '../src/editor/labels';

const LABELS_SOURCE = resolve(__dirname, '../src/editor/labels.ts');

/** 可写域的实际数据：14 个配置域来自运行配置单例，texts 域来自皮肤层。 */
function domainData(domain: string): Record<string, unknown> {
  const source = domain === 'texts' ? texts : (cfg as unknown as Record<string, unknown>)[domain];
  return source as Record<string, unknown>;
}

describe('editor human labels', () => {
  it('covers every atom in the contract', () => {
    for (const atom of ATOM_NAMES) {
      const info = lookupLabel('atom', atom);
      expect(info?.label, `原子 ${atom} 缺中文名`).toBeTruthy();
      expect(info?.help, `原子 ${atom} 缺解释`).toBeTruthy();
    }
  });

  it('covers every atom param in the contract', () => {
    const missing: string[] = [];
    for (const atom of ATOM_NAMES) {
      for (const param of Object.keys(ATOM_CONTRACT[atom].params)) {
        if (!lookupLabel('atomParam', `${atom}.${param}`)?.label) missing.push(`${atom}.${param}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('prefers the contract note as param help', () => {
    expect(lookupLabel('atomParam', 'chain.bounces')?.help).toBe(ATOM_CONTRACT.chain.params.bounces.note);
    // 契约没写 note 的参数由标签层兜底，不留空。
    expect(atomContract('chain').params.searchRange.note).toBeUndefined();
    expect(lookupLabel('atomParam', 'chain.searchRange')?.help).toBeTruthy();
  });

  it('registers a top-level field label for every writable domain', () => {
    const missing: string[] = [];
    for (const domain of Object.keys(WRITABLE_DOMAINS)) {
      const data = domainData(domain);
      expect(data, `域 ${domain} 没有数据`).toBeTruthy();
      for (const field of Object.keys(data)) {
        if (!lookupLabel('domainField', `${domain}.${field}`)?.label) missing.push(`${domain}.${field}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('labels drop-director fields and explains non-obvious controls', () => {
    expect(lookupLabel('domainField', 'economy.ordinaryDropRate')?.label).toBe('普通掉落节奏（每分钟）');
    expect(lookupLabel('domainField', 'economy.ordinaryDropRate.selectionPerMinute')?.label).toBe('选择期每分钟掉落');
    expect(lookupLabel('domainField', 'economy.normalDropTypePolicy.roleBagSize')?.label).toBe('角色袋容量');
    expect(lookupLabel('domainField', 'economy.ordinaryDropRate.carryCap')?.help).toContain('额度池上限');
    expect(lookupLabel('domainField', 'economy.defaults.dropChance')?.help).toContain('enabled=false');

    const untranslated: string[] = [];
    const visit = (value: unknown, path: string): void => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      for (const [field, child] of Object.entries(value)) {
        const nestedPath = `${path}.${field}`;
        const info = lookupLabel('domainField', `economy.${nestedPath}`);
        if (!info?.label || info.label === field) untranslated.push(nestedPath);
        visit(child, nestedPath);
      }
    };
    visit(cfg.economy.ordinaryDropRate, 'ordinaryDropRate');
    visit(cfg.economy.normalDropTypePolicy, 'normalDropTypePolicy');
    expect(untranslated).toEqual([]);
  });

  it('labels weapon fusion controls with their active conditions', () => {
    expect(lookupLabel('domainField', 'combat.weaponFusion.damping')).toMatchObject({
      label: '同类叠加伤害衰减',
      help: expect.stringContaining('当前配置仅 1 张范围形态卡'),
    });
    expect(lookupLabel('domainField', 'combat.weaponFusion.areaMul')).toMatchObject({
      label: '同类叠加范围面积比',
      help: expect.stringContaining('半径按本值开平方缩放'),
    });
    expect(lookupLabel('domainField', 'combat.weaponFusion.impactShare')).toMatchObject({
      label: '融合爆炸预算占比',
      help: expect.stringContaining('主炮单周期伤害预算'),
    });
  });

  it('falls back to the english key instead of throwing', () => {
    expect(describeLabel('domainField', 'combat.没有登记的字段')).toEqual({ label: '没有登记的字段' });
    expect(describeLabel('enumValue', 'rarity.unknownValue')).toEqual({ label: 'unknownValue' });
    expect(describeLabel('atomParam', 'notAnAtom.notAParam')).toEqual({ label: 'notAParam' });
    expect(labelWithKey('atom', 'notAnAtom')).toBe('notAnAtom');
    expect(labelWithKey('atom', 'chain')).toBe('连锁（chain）');
  });

  it('covers content-workbench tags, phases, and trigger conditions from the shared label source', () => {
    expect(lookupLabel('enumValue', 'tag.utility')?.label).toBe('功能');
    expect(lookupLabel('enumValue', 'phase.intermission')?.label).toBe('波间');
    expect(lookupLabel('domainField', 'requiresStatus')?.label).toBe('状态限定');
    expect(lookupLabel('domainField', 'cooldownSeconds')?.label).toBe('冷却秒数');
  });

  it('stays browser safe: no config pipeline or validator imports', () => {
    const source = readFileSync(LABELS_SOURCE, 'utf8');
    const imports = [...source.matchAll(/^import[^;]*?from\s+'([^']+)'/gm)].map(match => match[1]);
    expect(imports.some(specifier => /pipeline|validateAll/.test(specifier))).toBe(false);
    expect(imports).toEqual(['../core/effects/atomContract', '../data', './contracts']);
  });
});
