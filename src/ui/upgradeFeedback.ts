import { texts } from '../data';
import type { CardType, GameEvent } from '../core/types';
import { resolveCardVisual } from '../presentation/cardVisual';
import { glyphToSvg } from '../presentation/skillGeometry';
import type { DomRefs } from './domRefs';

export type UpgradeFx = 'core' | 'major' | 'transform';

export interface UpgradeMilestone {
  title: string;
  detail: string;
  fx: UpgradeFx;
}

export interface UpgradeCandidate extends UpgradeMilestone {
  cardType: CardType;
  source: 'hand' | 'equipment';
  targetCardId?: number;
  slotIndex?: number;
}

type CopySection = { milestones: Record<string, UpgradeMilestone> };
type CardCopy = { hand: CopySection; equip: CopySection };

const cardCopy = (texts as { cards: Record<string, CardCopy> }).cards;
const priority: Record<UpgradeFx, number> = { core: 1, major: 2, transform: 3 };

function exactMilestone(section: CopySection, star: number): UpgradeMilestone | undefined {
  return section.milestones[String(star)];
}

function milestoneAtOrBelow(section: CopySection, star: number): UpgradeMilestone | undefined {
  const tier = Object.keys(section.milestones).map(Number).filter(value => value <= star).sort((a, b) => b - a)[0];
  return tier === undefined ? undefined : section.milestones[String(tier)];
}

/** Pure event-to-feedback projection, exported so priority and exact-tier behavior stay testable. */
export function resolveUpgradeCandidates(events: GameEvent[]): UpgradeCandidate[] {
  const candidates: UpgradeCandidate[] = [];
  for (const event of events) {
    const copy = cardCopy[event.type === 'merged' || event.type === 'fed' || event.type === 'equipped' || event.type === 'wildcardMerged' ? event.cardType : ''];
    if (!copy) continue;
    if (event.type === 'merged') {
      const milestone = exactMilestone(copy.hand, event.resultStar);
      if (milestone) candidates.push({ ...milestone, cardType: event.cardType, source: 'hand', targetCardId: event.resultCardId });
    } else if (event.type === 'fed') {
      const milestone = exactMilestone(copy.equip, event.resultStar);
      if (milestone) candidates.push({ ...milestone, cardType: event.cardType, source: 'equipment', targetCardId: event.targetCardId, slotIndex: event.slotIndex });
    } else if (event.type === 'equipped') {
      const milestone = milestoneAtOrBelow(copy.equip, event.star);
      if (milestone) candidates.push({ ...milestone, cardType: event.cardType, source: 'equipment', slotIndex: event.slotIndex });
    } else if (event.type === 'wildcardMerged') {
      const section = event.targetKind === 'equipment' ? copy.equip : copy.hand;
      const milestone = exactMilestone(section, event.resultStar);
      if (milestone) candidates.push({
        ...milestone,
        cardType: event.cardType,
        source: event.targetKind === 'equipment' ? 'equipment' : 'hand',
        targetCardId: event.targetCardId,
        slotIndex: event.targetKind === 'equipment' ? event.targetIndex : undefined,
      });
    }
  }
  return candidates.sort((a, b) => priority[b.fx] - priority[a.fx] || Number(b.source === 'equipment') - Number(a.source === 'equipment'));
}

export function createUpgradeFeedback(refs: DomRefs) {
  const queue: Array<UpgradeCandidate & { suppressCelebration: boolean }> = [];
  let active = false;
  let bannerTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let pulseTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let celebrationTimer: ReturnType<typeof setTimeout> | 0 = 0;

  function targetCard(candidate: UpgradeCandidate): HTMLElement | null {
    if (candidate.targetCardId !== undefined) {
      const root = candidate.source === 'equipment' ? refs.equipmentSlots : refs.cards;
      const byId = root.querySelector<HTMLElement>(`[data-id="${candidate.targetCardId}"]`);
      if (byId) return byId;
    }
    if (candidate.source === 'equipment' && candidate.slotIndex !== undefined) {
      return refs.equipmentSlots.querySelector<HTMLElement>(`[data-index="${candidate.slotIndex}"] .card`);
    }
    return null;
  }

  function pulse(candidate: UpgradeCandidate): void {
    const card = targetCard(candidate);
    if (!card) return;
    clearTimeout(pulseTimer);
    card.classList.remove('upgrade-pulse');
    void card.offsetWidth;
    card.classList.add('upgrade-pulse');
    pulseTimer = setTimeout(() => card.classList.remove('upgrade-pulse'), 650);
  }

  function celebrate(candidate: UpgradeCandidate): void {
    const visual = resolveCardVisual(candidate.cardType);
    refs.celebrationFx.style.setProperty('--upgrade-accent', visual.accent);
    refs.celebrationFx.innerHTML =
      `<span class="celebration-fragment heart">♥</span>` +
      `<span class="celebration-fragment star">✦</span>` +
      `<span class="celebration-fragment spark">✧</span>` +
      `<span class="celebration-fragment heart second">♥</span>` +
      `<svg class="celebration-fragment skill" viewBox="0 0 16 16" aria-hidden="true">${glyphToSvg(visual.shape, visual.glyph)}</svg>`;
    clearTimeout(celebrationTimer);
    refs.celebrationFx.classList.remove('show');
    void refs.celebrationFx.offsetWidth;
    refs.celebrationFx.classList.add('show');
    celebrationTimer = setTimeout(() => {
      refs.celebrationFx.classList.remove('show');
      refs.celebrationFx.replaceChildren();
    }, 800);
  }

  function play(candidate: UpgradeCandidate & { suppressCelebration: boolean }): void {
    active = true;
    const visual = resolveCardVisual(candidate.cardType);
    const title = refs.upgradeBanner.querySelector<HTMLElement>('strong');
    const detail = refs.upgradeBanner.querySelector<HTMLElement>('span');
    if (title) title.textContent = candidate.title;
    if (detail) detail.textContent = candidate.detail;
    refs.upgradeBanner.style.setProperty('--upgrade-accent', visual.accent);
    refs.upgradeBanner.classList.add('show', `fx-${candidate.fx}`);
    pulse(candidate);
    if (candidate.fx === 'transform' && !candidate.suppressCelebration) celebrate(candidate);

    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      refs.upgradeBanner.classList.remove('show', 'fx-core', 'fx-major', 'fx-transform');
      bannerTimer = setTimeout(() => {
        const next = queue.shift();
        if (next) play(next);
        else active = false;
      }, 180);
    }, 2400);
  }

  return {
    handle(events: GameEvent[]): void {
      const suppressCelebration = events.some(event => event.type === 'levelUp');
      const candidates = resolveUpgradeCandidates(events).map(candidate => ({ ...candidate, suppressCelebration }));
      if (!candidates.length) return;
      if (!active) {
        const [next, ...rest] = candidates;
        queue.push(...rest.slice(0, 2));
        play(next);
        return;
      }
      for (const candidate of candidates) {
        if (queue.length >= 2) break;
        queue.push(candidate);
      }
    },
  };
}
