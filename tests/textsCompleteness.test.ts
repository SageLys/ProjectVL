// 文案键完整性（固化2 §五）：配置里引用的每个 key 都能在 texts.json 命中，
// 且 texts 的 relics / tuner 两个命名空间没有孤儿条目（写了文案却没人引用）。
// textCoverage.test.ts 查的是「内容够不够好」，这里查的是「引用对不对得上」。
import { describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { resolveText, resolveTextNode, texts } from '../src/data';

describe('文案键完整性 · 配置 → texts.json', () => {
  it('遗物只留 key：每条 textKey 的 name/desc 都命中且非空', () => {
    expect(cfg.relics.relics.length).toBeGreaterThan(0);
    for (const relic of cfg.relics.relics) {
      expect(relic.textKey, relic.id).toBe(`relics.${relic.id}`);
      expect(resolveText(`${relic.textKey}.name`), relic.id).toBeTruthy();
      expect(resolveText(`${relic.textKey}.desc`), relic.id).toBeTruthy();
      // 配置层不得再内联文案。
      expect(Object.keys(relic)).not.toContain('title');
      expect(Object.keys(relic)).not.toContain('desc');
    }
  });

  it('调参元数据：每个 labelKey 与每个分组标题都命中', () => {
    for (const param of cfg.tuner.params) {
      expect(param.labelKey, param.path).toBe(`tuner.params.${param.path}`);
      expect(resolveText(param.labelKey), param.path).toBeTruthy();
    }
    for (const group of ['waves', 'combat', 'enemies', 'drops', 'progression', 'bounty', 'p2']) {
      expect(resolveText(`tuner.groups.${group}.title`), group).toBeTruthy();
    }
  });

  it('卡牌 / 进化分支 / 神的 textKey 都能解析到文案节点', () => {
    for (const card of cfg.skills.cards) {
      expect(resolveTextNode(card.textKey), card.textKey).toBeDefined();
      for (const checkpoint of card.evolutionTree?.checkpoints ?? []) {
        for (const option of checkpoint.options) {
          expect(resolveTextNode(option.textKey), option.textKey).toBeDefined();
        }
      }
    }
    for (const god of cfg.gods.gods) expect(resolveTextNode(god.textKey), god.textKey).toBeDefined();
  });

  it('无孤儿：texts 的 relics / tuner.params 条目都被配置引用', () => {
    const relicIds = new Set(cfg.relics.relics.map(relic => relic.id));
    const relicTexts = (texts as unknown as { relics: Record<string, unknown> }).relics;
    for (const id of Object.keys(relicTexts)) expect(relicIds, id).toContain(id);
    expect(Object.keys(relicTexts)).toHaveLength(relicIds.size);

    const paths = new Set(cfg.tuner.params.map(param => param.path));
    const paramTexts = (texts as unknown as { tuner: { params: Record<string, string> } }).tuner.params;
    for (const path of Object.keys(paramTexts)) expect(paths, path).toContain(path);
    expect(Object.keys(paramTexts)).toHaveLength(paths.size);
  });

  it('缺 key 时解析器返回 undefined（调用方回退，不显示空白）', () => {
    expect(resolveText('relics.notARelic.name')).toBeUndefined();
    expect(resolveText('tuner.params.not.a.path')).toBeUndefined();
    // 扁平键（键名含 '.'）与嵌套键都能解析。
    expect(resolveText('tuner.params.combat.defaults.damage')).toBe('基础伤害');
    expect(resolveText('relics.proj_damage.name')).toBe('超压弹道');
  });
});
