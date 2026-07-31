import { describe, expect, it } from 'vitest';
import { cfg } from '../src/config';
import { AFFIX_SINKS } from '../src/config/affixSinks';
import { texts } from '../src/data';
import { ATOM_LABELS } from '../src/ui/effectText';

/** 英文配置串泄漏检测正则：3 字母以上英文单词、@ 符号、箭头、已知配置键名 */
const LEAKED_CONFIG = /[A-Za-z]{3,}|@|→|requiresStatus|spreadStatus|groundZone|burstDamage/;

describe('player-facing text coverage', () => {
  it('covers all cards, branches, atoms, triggers and affix stats without placeholders', () => {
    const copy = texts as unknown as {
      cards: Record<string, { overview: string; hand: { shortByTier: Record<string, string> }; equip: { shortByTier: Record<string, string> } }>;
      evolution: Record<string, Record<string, { name: string; summary: string; intent: string }>>;
      glossary: Record<string, string>;
      affixHelp: Record<string, string>;
      effectText: { atoms: Record<string, string>; triggers: Record<string, string> };
    };
    for (const card of cfg.skills.cards) {
      expect(copy.cards[card.id]?.overview, `cards.${card.id}.overview`).toBeTruthy();
      expect(JSON.stringify(copy.cards[card.id]), `cards.${card.id}`).not.toMatch(/效果说明|即时释放|强化释放|终极释放/);
      for (const checkpoint of card.evolutionTree?.checkpoints ?? []) {
        // 同卡同 checkpoint 的分支 summary 两两不同
        const summaries = checkpoint.options.map(option => copy.evolution[card.id]?.[option.id]?.summary ?? '');
        for (let i = 0; i < summaries.length; i++) {
          for (let j = i + 1; j < summaries.length; j++) {
            if (summaries[i] && summaries[j]) {
              expect(summaries[i], `cards.${card.id} ${card.id}[${i}] vs [${j}] summary duplicate`).not.toBe(summaries[j]);
            }
          }
        }
        for (const option of checkpoint.options) {
          const branch = copy.evolution[card.id]?.[option.id];
          const path = `evolution.${card.id}.${option.id}`;
          expect(branch?.name, `${path}.name`).toBeTruthy();
          expect(branch?.summary, `${path}.summary`).toBeTruthy();
          expect(branch?.intent, `${path}.intent`).toBeTruthy();
          // summary 与 intent 不得相同（语义分离）
          if (branch?.summary && branch?.intent) {
            expect(branch.summary, `${path} summary===intent`).not.toBe(branch.intent);
          }
          // 玩家可见文案不得含英文配置标识符
          expect(branch?.summary ?? '', `${path}.summary leaked config`).not.toMatch(LEAKED_CONFIG);
          expect(branch?.intent ?? '', `${path}.intent leaked config`).not.toMatch(LEAKED_CONFIG);
        }
      }
    }
    expect(Object.keys(copy.glossary)).toEqual(expect.arrayContaining(Object.keys(ATOM_LABELS)));
    expect(Object.keys(copy.effectText.atoms)).toHaveLength(36);
    expect(Object.keys(copy.effectText.triggers)).toHaveLength(9);
    expect(Object.keys(copy.affixHelp)).toEqual(expect.arrayContaining(Object.keys(AFFIX_SINKS)));
  });
});
