import type { RewardReceipt } from '../core/types';
import { resolveText } from '../data';
import { rewardCopy } from './rewardMeta';

export const REWARD_CELEBRATION_MS = 2200;

function format(key: string, values: Record<string, string | number>): string {
  let text = resolveText(`rewardReceipt.${key}`) ?? key;
  for (const [name, value] of Object.entries(values)) text = text.split(`{${name}}`).join(String(value));
  return text;
}

function resultLines(receipt: RewardReceipt): string[] {
  const r = receipt.result;
  const lines: string[] = [];
  if (r.damageDealt !== undefined) lines.push(format('damage', { damage: Math.round(r.damageDealt), kills: r.enemiesKilled ?? 0 }));
  if (r.frozenCount !== undefined) lines.push(format('control', { count: r.frozenCount }));
  if (r.healingGranted !== undefined) lines.push(format('healing', { healing: Math.round(r.healingGranted), hits: r.shieldHitsGranted ?? 0 }));
  if (r.wildcardGrants) lines.push(r.wildcardGrants.map(item => format('wildcard', item)).join('、'));
  if (r.surgeTag) lines.push(format('surge', { tag: r.surgeTag, duration: r.surgeDuration ?? 0 }));
  return lines.length ? lines : [resolveText('rewardReceipt.fallback') ?? '奖励已结算'];
}

export function createRewardCelebration(onComplete: () => void, durationMs = REWARD_CELEBRATION_MS) {
  const root = document.createElement('aside');
  root.className = 'reward-celebration';
  root.id = 'rewardCelebration';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  const title = document.createElement('h2');
  const desc = document.createElement('p');
  const result = document.createElement('div');
  result.className = 'reward-celebration-result';
  root.append(title, desc, result);
  document.body.append(root);

  let shown: RewardReceipt | null = null;
  let timer: number | null = null;

  function hide(): void {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    shown = null;
    root.classList.remove('show');
  }

  return {
    show(receipt: RewardReceipt): void {
      if (shown === receipt) return;
      hide();
      shown = receipt;
      const copy = rewardCopy(receipt.rewardId);
      title.textContent = copy.name;
      desc.textContent = copy.desc;
      result.replaceChildren(...resultLines(receipt).map(line => {
        const p = document.createElement('p');
        p.textContent = line;
        return p;
      }));
      root.classList.add('show');
      timer = window.setTimeout(() => {
        if (shown !== receipt) return;
        shown = null;
        timer = null;
        root.classList.remove('show');
        onComplete();
      }, durationMs);
    },
    hide,
  };
}
