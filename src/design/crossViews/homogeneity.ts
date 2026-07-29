import type { CardDef } from '../../core/effects/defs';
import type { DescribeContext, BranchView, CardView } from '../describe';
import { describeCard } from '../describe';
import { el } from '../../editor/dom';

export interface HomogeneityEntry {
  cardId: string;
  cardName: string;
  star: 3 | 5;
  left: BranchView;
  right: BranchView;
  sameSummary: boolean;
  sameMechanism: boolean;
}

function branchStructure(branch: BranchView): string {
  const triggers = new Set<string>();
  const atoms = new Set<string>();
  const visit = (effects: BranchView['bindings'][number]['effects']): void => {
    for (const effect of effects) {
      atoms.add(effect.atom);
      visit(effect.nested);
    }
  };
  for (const binding of branch.bindings) {
    triggers.add(binding.trigger);
    visit(binding.effects);
  }
  return `${[...triggers].sort().join('|')}::${[...atoms].sort().join('|')}`;
}

function pairs<T>(values: readonly T[]): Array<[T, T]> {
  const output: Array<[T, T]> = [];
  values.forEach((left, index) => values.slice(index + 1).forEach(right => output.push([left, right])));
  return output;
}

export function analyzeBranchHomogeneity(cards: CardDef[], ctx: DescribeContext): HomogeneityEntry[] {
  const entries = cards.flatMap(card => {
    const view = describeCard(card, ctx);
    return view.tiers.filter(tier => tier.kind === 'checkpoint').flatMap(tier =>
      pairs(tier.options).flatMap(([left, right]) => {
        const sameSummary = Boolean(left.summary) && left.summary === right.summary;
        const sameMechanism = branchStructure(left) === branchStructure(right);
        if (!sameSummary && !sameMechanism) return [];
        return [{
          cardId: view.id,
          cardName: view.name,
          star: tier.star as 3 | 5,
          left,
          right,
          sameSummary,
          sameMechanism,
        }];
      }),
    );
  });
  const rank = (entry: HomogeneityEntry): number => entry.sameSummary && entry.sameMechanism ? 0 : entry.sameSummary ? 1 : 2;
  return entries.sort((a, b) => rank(a) - rank(b) || a.cardName.localeCompare(b.cardName, 'zh-CN') || a.star - b.star);
}

export function renderHomogeneityView(container: HTMLElement, cards: CardDef[], ctx: DescribeContext, openCard: (id: string) => void): void {
  container.replaceChildren();
  const entries = analyzeBranchHomogeneity(cards, ctx);
  container.append(el('h1', '', '分支同质化检查'));
  container.append(el('p', 'lede', `按“双重命中 → 文案相同 → 机制相同”排序，共 ${entries.length} 对待审分支。`));
  const list = el('div', 'audit-list');
  for (const entry of entries) {
    const article = el('article', 'audit-card card-block');
    const title = el('button', 'link-heading', `${entry.cardName}（${entry.cardId}） · ${entry.star}★`);
    title.type = 'button';
    title.addEventListener('click', () => openCard(entry.cardId));
    const flags = el('div', 'badge-row');
    if (entry.sameSummary) flags.append(el('span', 'badge badge--warn', '文案相同'));
    if (entry.sameMechanism) flags.append(el('span', 'badge badge--danger', '机制结构相同'));
    const comparison = el('div', 'branch-grid branch-grid--compact');
    for (const branch of [entry.left, entry.right]) {
      const item = el('section', 'branch-card');
      item.append(el('h3', '', `${branch.name || '缺失'} · ${branch.id}`));
      item.append(el('p', branch.summary ? '' : 'missing-copy', branch.summary || '缺失：summary'));
      const atoms = new Set(branch.bindings.flatMap(binding => binding.effects.flatMap(effect => [effect.label, ...effect.nested.map(child => child.label)])));
      item.append(el('small', '', `触发器：${branch.bindings.map(binding => binding.triggerLabel).join('、') || '无'}；原子：${[...atoms].join('、') || '无'}`));
      comparison.append(item);
    }
    article.append(title, flags, comparison);
    list.append(article);
  }
  if (!entries.length) list.append(el('p', 'empty-state', '未发现同质化分支。'));
  container.append(list);
}

export function homogeneityForCard(view: CardView): boolean {
  return view.tiers.some(tier => tier.kind === 'checkpoint' && pairs(tier.options).some(([left, right]) =>
    (Boolean(left.summary) && left.summary === right.summary) || branchStructure(left) === branchStructure(right),
  ));
}
