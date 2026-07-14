// 卡面展示元数据解析：图标/配色由 category 决定（schema 设计原意），
// 文案由 textKey 索引 texts.json 按星级档取最近锚点描述。
// 查不到技能定义（如尚未迁移的旧数值卡）时回退到 legacy.types，避免崩溃。
import { cfg } from '../config';
import { texts } from '../data';
import type { CardType } from '../core/types';
import type { Category } from '../core/effects/defs';
import { getSkillDef } from '../core/effects/interpreter';

export interface CardMeta {
  name: string;
  desc: string;
  icon: string;
  color: string;
}

const CATEGORY_META: Record<Category, { icon: string; color: string }> = {
  projectile: { icon: '◆', color: '#ff6577' },
  control: { icon: '❄', color: '#4de2ff' },
  domain: { icon: '☀', color: '#ff9d4d' },
  economy: { icon: '♣', color: '#ffd166' },
  defense: { icon: '⛨', color: '#5cffb1' },
};

/** 星级 → 最近的描述锚点（1/3/5/6；2 归 1、4 归 3）。 */
function nearestTier(star: number): '1' | '3' | '5' | '6' {
  if (star <= 2) return '1';
  if (star <= 4) return '3';
  if (star === 5) return '5';
  return '6';
}

/** 卡名（星级无关，供 toast 等只需名称的场景）。 */
export function cardDisplayName(cardType: CardType): string {
  const cardTexts = (texts as { cards?: Record<string, { name: string }> }).cards;
  return cardTexts?.[cardType]?.name ?? cfg.skills.legacy.types[cardType]?.name ?? cardType;
}

export function resolveCardMeta(cardType: CardType, star: number): CardMeta {
  const def = getSkillDef(cardType);
  const cardTexts = (texts as { cards?: Record<string, { name: string; descByTier: Record<string, string> }> }).cards;
  const entry = cardTexts?.[cardType];
  if (def && entry) {
    const category = CATEGORY_META[def.category];
    return { name: entry.name, desc: entry.descByTier[nearestTier(star)] ?? '', icon: category.icon, color: category.color };
  }
  const legacy = cfg.skills.legacy.types[cardType];
  if (legacy) return { name: legacy.name, desc: legacy.desc, icon: legacy.icon, color: legacy.color };
  return { name: cardType, desc: '', icon: '?', color: '#999999' };
}
