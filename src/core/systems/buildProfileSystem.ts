import { cfg } from '../../config';
import type { BuildTag } from '../effects/defs';
import type { GameState } from '../types';

const TAGS: BuildTag[] = ['projectile', 'control', 'domain', 'defense', 'utility'];

export function calculateBuildProfile(state: GameState): Record<BuildTag, number> {
  const out = Object.fromEntries(TAGS.map(tag => [tag, 0])) as Record<BuildTag, number>;
  const cards = new Map(cfg.skills.cards.map(def => [def.id, def]));
  const add = (type: string, score: number) => {
    for (const tag of cards.get(type)?.synergyTags ?? []) out[tag] += score;
  };
  for (const card of state.equipment) if (card && !card.provisional) add(card.type, card.star * 3);
  for (const card of state.cards) if (card && !card.provisional) add(card.type, card.star);
  for (const [type, stats] of Object.entries(state.normalDropDirector.typeStats)) add(type, stats.mergeOps * 0.5);
  return out;
}

export function dominantBuildTag(state: GameState): BuildTag {
  const profile = calculateBuildProfile(state);
  return TAGS.reduce((best, tag) => profile[tag] > profile[best] ? tag : best, TAGS[0]);
}
