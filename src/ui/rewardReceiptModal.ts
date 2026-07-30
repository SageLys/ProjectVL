import type { RewardReceipt } from '../core/types';
import { resolveText } from '../data';
import { rewardCopy } from './rewardMeta';

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

export function createRewardReceiptModal(onConfirm: () => void) {
  const modal = document.createElement('div');
  modal.className = 'modal reward-receipt-modal';
  modal.id = 'rewardReceiptModal';
  const card = document.createElement('div');
  card.className = 'modal-card';
  const title = document.createElement('h2');
  const desc = document.createElement('p');
  const result = document.createElement('div');
  result.className = 'reward-receipt-result';
  const confirm = document.createElement('button');
  confirm.type = 'button'; confirm.className = 'btn primary'; confirm.textContent = resolveText('rewardReceipt.confirm') ?? '确认';
  confirm.addEventListener('click', onConfirm);
  card.append(title, desc, result, confirm); modal.append(card); document.body.append(modal);
  let shown: RewardReceipt | null = null;
  return {
    show(receipt: RewardReceipt) {
      if (shown !== receipt) {
        shown = receipt;
        const copy = rewardCopy(receipt.rewardId);
        title.textContent = copy.name; desc.textContent = copy.desc;
        result.replaceChildren(...resultLines(receipt).map(line => { const p = document.createElement('p'); p.textContent = line; return p; }));
      }
      modal.classList.add('open');
      if (document.activeElement !== confirm) confirm.focus();
    },
    hide() { shown = null; modal.classList.remove('open'); },
  };
}
