import { cfg } from '../config';
import { getActiveMergeCopies } from '../core/systems/cardSystem';
import type { Card, GameState } from '../core/types';

type HintCard = Card & { source: 'cards' | 'equipment' };

export interface MergeHintPair {
  fromCardId: number;
  toCardId: number;
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

/** Draws non-interactive links between matching cards without changing card behavior. */
export function renderMergeHints(dock: HTMLElement, state: Pick<GameState, 'cards' | 'equipment' | 'runBuild'>): void {
  dock.querySelector('.merge-hints')?.remove();
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
        && !state.runBuild.evolutionChoices[sourceCard.type]?.[resultStar]
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
