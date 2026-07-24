import { cfg } from '../../config';
import type { CardType } from '../types';

/** Cards produced only by fixed recipes are never eligible for random acquisition. */
export function getDroppableCardTypes(): CardType[] {
  return cfg.skills.cards.filter(card => !card.recipeOnly).map(card => card.id);
}

export function isDroppableCardType(type: CardType): boolean {
  return cfg.skills.cards.some(card => card.id === type && !card.recipeOnly);
}
