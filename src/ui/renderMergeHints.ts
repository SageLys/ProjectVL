import { cfg } from '../config';
import { getActiveMergeCopies } from '../core/systems/cardSystem';
import type { Card, GameState } from '../core/types';
import { availableRecipes } from '../core/systems/recipeEvolutionSystem';
import { cardDisplayName } from './cardMeta';

type HintCard = Card & { source: 'cards' | 'equipment' };

export interface MergeHintPair {
  fromCardId: number;
  toCardId: number;
}

export interface RecipeHintPair {
  recipeId: string;
  aCardId: number;
  bCardId: number;
  outputCardId: string;
  outputStar: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Returns the smallest useful set of links for every currently actionable merge group. */
export function findMergeHintPairs(state: Pick<GameState, 'cards' | 'equipment'>): MergeHintPair[] {
  const groups = new Map<string, HintCard[]>();
  const add = (card: Card | null, source: HintCard['source']) => {
    if (!card || card.provisional || card.star >= cfg.economy.maxStar) return;
    const key = `${card.type}:${card.star}`;
    const group = groups.get(key) ?? [];
    group.push({ ...card, source });
    groups.set(key, group);
  };

  state.equipment.forEach(card => add(card, 'equipment'));
  state.cards.forEach(card => add(card, 'cards'));

  const pairs: MergeHintPair[] = [];
  for (const group of groups.values()) {
    const equipped = group.find(card => card.source === 'equipment');
    const canFeedEquipment = cfg.economy.placeholderAssumptions.feedEquipped && cfg.economy.feedEquipped;
    if (equipped && canFeedEquipment && group.length > 1) {
      for (const card of group) {
        if (card.id !== equipped.id) pairs.push({ fromCardId: equipped.id, toCardId: card.id });
      }
      continue;
    }

    if (group.every(card => card.source === 'cards') && group.length >= getActiveMergeCopies()) {
      for (let i = 1; i < group.length; i++) {
        pairs.push({ fromCardId: group[i - 1].id, toCardId: group[i].id });
      }
    }
  }
  return pairs;
}

/** Resolves the exact material instances selected by each currently available fixed recipe. */
export function findRecipeHintPairs(state: GameState): RecipeHintPair[] {
  return availableRecipes(state).flatMap(available => {
    const recipe = cfg.evolutionRecipes.recipes.find(item => item.id === available.recipeId);
    return recipe ? [{
      recipeId: recipe.id,
      aCardId: available.a.cardId,
      bCardId: available.b.cardId,
      outputCardId: recipe.outputCardId,
      outputStar: recipe.outputStar,
    }] : [];
  });
}

function cardBoundaryPoint(from: DOMRect, toward: DOMRect, gap: number): { x: number; y: number } {
  const x = from.left + from.width / 2;
  const y = from.top + from.height / 2;
  const targetX = toward.left + toward.width / 2;
  const targetY = toward.top + toward.height / 2;
  const dx = targetX - x;
  const dy = targetY - y;
  const distance = Math.hypot(dx, dy);
  if (!distance) return { x, y };
  const edgeScale = 1 / Math.max(Math.abs(dx) / (from.width / 2), Math.abs(dy) / (from.height / 2));
  return {
    x: x + dx * edgeScale + dx / distance * gap,
    y: y + dy * edgeScale + dy / distance * gap,
  };
}

function appendPath(svg: SVGSVGElement, d: string, className: string, pair: MergeHintPair): void {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('class', className);
  path.dataset.fromCardId = String(pair.fromCardId);
  path.dataset.toCardId = String(pair.toCardId);
  svg.append(path);
}

function appendRecipePath(svg: SVGSVGElement, d: string, className: string, pair: RecipeHintPair): void {
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('class', className);
  path.dataset.recipeId = pair.recipeId;
  path.dataset.aCardId = String(pair.aCardId);
  path.dataset.bCardId = String(pair.bCardId);
  svg.append(path);
}

function recipeHintText(pair: RecipeHintPair): string {
  return `卡间进化就绪：拖动任一材料至另一张，进化为「${cardDisplayName(pair.outputCardId)}」${pair.outputStar}★`;
}

function renderRecipeHints(dock: HTMLElement, pairs: RecipeHintPair[]): void {
  if (!pairs.length) return;

  const copy = document.createElement('div');
  copy.className = 'recipe-evolution-hints';
  copy.setAttribute('aria-live', 'polite');
  for (const pair of pairs) {
    const hint = document.createElement('p');
    hint.className = 'recipe-evolution-hint';
    hint.dataset.recipeId = pair.recipeId;
    hint.textContent = recipeHintText(pair);
    copy.append(hint);
  }
  dock.append(copy);

  const dockRect = dock.getBoundingClientRect();
  if (!dockRect.width || !dockRect.height) return;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'recipe-hints');
  svg.setAttribute('viewBox', `0 0 ${dockRect.width} ${dockRect.height}`);
  svg.setAttribute('aria-hidden', 'true');

  const defs = document.createElementNS(SVG_NS, 'defs');
  const gradient = document.createElementNS(SVG_NS, 'linearGradient');
  gradient.id = 'recipe-hint-gradient';
  const cyan = document.createElementNS(SVG_NS, 'stop');
  cyan.setAttribute('offset', '0');
  cyan.setAttribute('stop-color', '#4deaff');
  const purple = document.createElementNS(SVG_NS, 'stop');
  purple.setAttribute('offset', '1');
  purple.setAttribute('stop-color', '#a56dff');
  gradient.append(cyan, purple);
  defs.append(gradient);
  svg.append(defs);

  for (const pair of pairs) {
    const from = dock.querySelector<HTMLElement>(`.card[data-id="${pair.aCardId}"]`);
    const to = dock.querySelector<HTMLElement>(`.card[data-id="${pair.bCardId}"]`);
    if (!from || !to) continue;
    from.classList.add('recipe-ready');
    to.classList.add('recipe-ready');
    const fromRect = from.getBoundingClientRect();
    const toRect = to.getBoundingClientRect();
    const start = cardBoundaryPoint(fromRect, toRect, 4);
    const end = cardBoundaryPoint(toRect, fromRect, 4);
    start.x -= dockRect.left;
    start.y -= dockRect.top;
    end.x -= dockRect.left;
    end.y -= dockRect.top;
    const d = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    appendRecipePath(svg, d, 'recipe-hint-glow', pair);
    appendRecipePath(svg, d, 'recipe-hint-line', pair);

    const core = document.createElementNS(SVG_NS, 'polygon');
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    core.setAttribute('class', 'recipe-hint-core');
    core.setAttribute('points', `${centerX},${centerY - 8} ${centerX + 8},${centerY} ${centerX},${centerY + 8} ${centerX - 8},${centerY}`);
    core.dataset.recipeId = pair.recipeId;
    svg.append(core);
  }

  if (svg.querySelector('.recipe-hint-line')) dock.append(svg);
}

/** Draws non-interactive links between matching cards without changing card behavior. */
export function renderMergeHints(dock: HTMLElement, state: GameState): void {
  dock.querySelector('.merge-hints')?.remove();
  dock.querySelector('.recipe-hints')?.remove();
  dock.querySelector('.recipe-evolution-hints')?.remove();
  dock.querySelectorAll('.card.recipe-ready').forEach(card => card.classList.remove('recipe-ready'));
  const recipePairs = findRecipeHintPairs(state);
  if (state.mode === 'playing' && (!state.intermission.active || state.intermission.step === 'free')) {
    renderRecipeHints(dock, recipePairs);
  }
  const pairs = findMergeHintPairs(state);
  if (!pairs.length) return;

  const dockRect = dock.getBoundingClientRect();
  if (!dockRect.width || !dockRect.height) return;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'merge-hints');
  svg.setAttribute('viewBox', `0 0 ${dockRect.width} ${dockRect.height}`);
  svg.setAttribute('aria-hidden', 'true');

  for (const pair of pairs) {
    const from = dock.querySelector<HTMLElement>(`.card[data-id="${pair.fromCardId}"]`);
    const to = dock.querySelector<HTMLElement>(`.card[data-id="${pair.toCardId}"]`);
    if (!from || !to) continue;
    const fromRect = from.getBoundingClientRect();
    const toRect = to.getBoundingClientRect();
    const start = cardBoundaryPoint(fromRect, toRect, 3);
    const end = cardBoundaryPoint(toRect, fromRect, 3);
    start.x -= dockRect.left;
    start.y -= dockRect.top;
    end.x -= dockRect.left;
    end.y -= dockRect.top;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy) || 1;
    const curve = Math.min(8, distance * 0.06);
    const controlX = (start.x + end.x) / 2 - dy / distance * curve;
    const controlY = (start.y + end.y) / 2 + dx / distance * curve;
    const d = `M ${start.x} ${start.y} Q ${controlX} ${controlY} ${end.x} ${end.y}`;
    appendPath(svg, d, 'merge-hint-glow', pair);
    appendPath(svg, d, 'merge-hint-line', pair);

    const sourceCard = [...state.cards, ...state.equipment].find(card => card?.id === pair.fromCardId);
    const resultStar = (sourceCard?.star ?? 0) + 1;
    const triggersChoice = sourceCard
      ? cfg.skills.cards.find(card => card.id === sourceCard.type)?.evolutionTree?.checkpoints
        .some(checkpoint => checkpoint.star === resultStar)
      : false;
    if (triggersChoice) {
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('class', 'merge-hint-label');
      label.setAttribute('x', String((start.x + end.x) / 2));
      label.setAttribute('y', String((start.y + end.y) / 2 - 7));
      label.setAttribute('text-anchor', 'middle');
      label.textContent = '下一星选择路线';
      svg.append(label);
    }

    for (const point of [start, end]) {
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('class', 'merge-hint-dot');
      dot.setAttribute('cx', String(point.x));
      dot.setAttribute('cy', String(point.y));
      dot.setAttribute('r', '2');
      svg.append(dot);
    }
  }

  if (svg.childElementCount) dock.append(svg);
}
