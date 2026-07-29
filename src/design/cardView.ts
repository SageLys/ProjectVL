import type { CardDef } from '../core/effects/defs';
import type { GodDef } from '../config/types';
import { el } from '../editor/dom';
import type { BindingView, CardView, DescribeContext, EffectView, TierView } from './describe';
import { describeCard } from './describe';

function badge(text: string, tone = ''): HTMLElement { return el('span', `badge${tone ? ` badge--${tone}` : ''}`, text); }
function missing(value: string, fallback = '缺失'): HTMLElement { return el('span', value ? '' : 'missing-copy', value || fallback); }

function renderEffectView(effect: EffectView): HTMLElement {
  const item = el('li', 'effect-line');
  const title = el('strong', '', `${effect.label}（${effect.atom}）`);
  if (effect.params.length) title.append(document.createTextNode(`：${effect.params.map(param => `${param.label}=${param.value}`).join('，')}`));
  item.append(title);
  if (effect.nested.length) {
    const nested = el('ul', 'nested-effect-list');
    effect.nested.forEach(child => nested.append(renderEffectView(child)));
    item.append(nested);
  }
  return item;
}

export function renderBindings(bindings: BindingView[]): HTMLElement {
  const list = el('div', 'binding-list');
  if (!bindings.length) return el('p', 'empty-state', '无绑定效果');
  for (const binding of bindings) {
    const row = el('section', 'binding');
    const trigger = el('h4', '', binding.triggerLabel);
    if (binding.triggerParams?.length) trigger.append(document.createTextNode(` · ${binding.triggerParams.map(param => `${param.label}=${param.value}`).join('，')}`));
    const effects = el('ul', 'effect-list');
    binding.effects.forEach(effect => effects.append(renderEffectView(effect)));
    row.append(trigger, effects);
    list.append(row);
  }
  return list;
}

function renderPlayerCopy(tier: TierView): HTMLElement {
  const block = el('div', 'player-copy');
  block.append(el('span', 'eyebrow', '玩家可见'));
  block.append(missing(tier.visibleText));
  if (tier.milestone) block.append(el('small', '', `${tier.milestone.title || '缺失标题'}：${tier.milestone.detail || '缺失详情'}`));
  return block;
}

function tierTitle(tier: TierView): string {
  if (tier.kind === 'checkpoint') return `${tier.star}★ 分支选择`;
  if (tier.kind === 'amplify') return '4★ 强化（公共）';
  if (tier.kind === 'fixed') return '6★ 终态（配方产物，无分支）';
  return '6★ 终态（公共）';
}

function renderTier(tier: TierView): HTMLElement {
  const section = el('section', `tier-block card-block tier-block--${tier.kind}`);
  section.append(el('h2', '', tierTitle(tier)));
  if (tier.kind !== 'amplify') section.append(renderPlayerCopy(tier));
  if (tier.kind === 'checkpoint') {
    if (tier.activeBindings?.length) {
      const active = el('details', 'active-bindings');
      active.append(el('summary', '', 'stars 当前实际生效值'));
      active.append(renderBindings(tier.activeBindings));
      section.append(active);
    }
    const grid = el('div', 'branch-grid');
    for (const branch of tier.options) {
      const item = el('article', 'branch-card');
      item.append(el('h3', '', `${branch.name || '缺失名称'} `));
      item.querySelector('h3')?.append(el('code', '', branch.id));
      const copy = el('div', 'branch-copy');
      copy.append(el('p', branch.summary ? '' : 'missing-copy', branch.summary || '缺失：summary'));
      copy.append(el('p', branch.intent ? '' : 'missing-copy', `设计意图：${branch.intent || '缺失'}`));
      copy.append(el('small', '', `关键词：${branch.keywords.join('、') || '缺失'} · 构筑适配：${branch.buildFit || '缺失'}`));
      const mechanism = el('div', 'mechanism');
      mechanism.append(el('span', 'eyebrow', '设计层机制'), renderBindings(branch.bindings));
      item.append(copy, mechanism);
      grid.append(item);
    }
    section.append(grid);
  } else if (tier.kind === 'amplify') {
    section.append(el('p', 'silent-note', '无独立里程碑文案：数值静默提升，不弹窗。'));
    section.append(missing(tier.amplifyDescription ?? '', '缺失：amplifyAxis.description'));
  } else {
    section.append(el('div', 'mechanism'), renderBindings(tier.bindings));
  }
  return section;
}

function renderConsumable(view: CardView): HTMLElement {
  const section = el('section', 'card-block');
  section.append(el('h2', '', '消耗态（落点释放）'));
  const table = el('table', 'data-table consumable-table');
  const header = el('tr');
  header.append(el('th', '', '档位'), el('th', '', '玩家可见'), el('th', '', '落点参数'), el('th', '', '效果（设计层）'));
  const thead = el('thead'); thead.append(header); table.append(thead);
  const body = el('tbody');
  for (const tier of view.consumable) {
    const tr = el('tr');
    tr.append(el('th', '', `${tier.star}★`));
    const copy = el('td'); copy.append(missing(tier.visibleText));
    if (tier.milestone) copy.append(el('small', '', `${tier.milestone.title}：${tier.milestone.detail}`));
    tr.append(copy, el('td', '', [tier.radius === undefined ? '' : `半径 ${tier.radius}`, tier.duration === undefined ? '' : `持续 ${tier.duration}s`].filter(Boolean).join('，') || '—'));
    const effects = el('td'); const list = el('ul', 'effect-list'); tier.effects.forEach(effect => list.append(renderEffectView(effect))); effects.append(list); tr.append(effects);
    body.append(tr);
  }
  table.append(body); section.append(table); return section;
}

function renderAffixes(view: CardView): HTMLElement {
  const section = el('section', 'card-block'); section.append(el('h2', '', '数值词条候选'));
  if (!view.affixPool) { section.append(el('p', 'empty-state', '无词条池')); return section; }
  section.append(el('p', '', `每次实例随机抽 ${view.affixPool.count} 条`));
  const table = el('table', 'data-table'); const header = el('tr'); header.append(el('th', '', '词条'), el('th', '', '权重'), el('th', '', '范围'), el('th', '', '步进'), el('th', '', '消耗态时限')); const thead = el('thead'); thead.append(header); table.append(thead);
  const body = el('tbody');
  view.affixPool.candidates.forEach(candidate => {
    const tr = el('tr'); tr.append(el('th', '', `${candidate.statLabel}（${candidate.stat}）`), el('td', '', String(candidate.weight)), el('td', '', `${candidate.min}～${candidate.max}`), el('td', '', String(candidate.step)), el('td', '', `${candidate.consumableDuration}s`)); body.append(tr);
  });
  table.append(body); section.append(table); return section;
}

export function renderCardView(container: HTMLElement, card: CardDef, ctx: DescribeContext, cardIndex?: number): void {
  container.replaceChildren();
  const view = describeCard(card, ctx);
  const article = el('article', 'entity-sheet card-sheet card-block');
  article.dataset.entityKind = 'card'; article.dataset.entityId = card.id;
  article.dataset.configPath = cardIndex === undefined ? '$.skills.cards' : `$.skills.cards[${cardIndex}]`;
  const title = el('header', 'entity-header');
  const heading = el('h1', '', view.name || '缺失名称'); heading.append(el('code', '', view.id));
  const badges = el('div', 'badge-row');
  badges.append(badge(view.categoryLabel, 'category'), ...view.tagLabels.map(label => badge(label, 'tag')));
  if (view.teaching) badges.append(badge('教学卡', 'teach'));
  badges.append(badge(view.roster === 'anchor' ? '锚点卡 · 必进本局' : view.roster === 'variable' ? '可变卡 · 抽取候选' : '融合产物 · recipeOnly', view.roster === 'recipeOnly' ? 'fusion' : 'roster'));
  title.append(heading, badges); article.append(title);
  if (view.recipe) article.append(el('p', 'recipe-banner', `配方 ${view.recipe.id}：${view.recipe.a.name || view.recipe.a.cardId}（${view.recipe.a.cardId} ≥${view.recipe.a.minStar}★） + ${view.recipe.b.name || view.recipe.b.cardId}（${view.recipe.b.cardId} ≥${view.recipe.b.minStar}★） → ${view.recipe.outputStar}★，仅限 ${view.recipe.allowedPhase}`));
  article.append(el('p', view.overview ? 'overview' : 'overview missing-copy', view.overview || '缺失：overview'));
  const route = el('section', 'tier-route'); route.append(el('h2', '', '装备态 · 星级路线')); view.tiers.forEach(tier => route.append(renderTier(tier))); article.append(route);
  article.append(renderConsumable(view), renderAffixes(view));
  const notes = el('section', 'design-notes card-block'); notes.append(el('h2', '', '设计备注'), missing(view.designNotes ?? '', '无 designNotes')); article.append(notes);
  if (card.fusionPolicy) article.append(el('section', 'callout callout--warning', `fusionPolicy：${JSON.stringify(card.fusionPolicy)}。未实现，暂不建议填写。`));
  container.append(article);
}

export function renderGodView(container: HTMLElement, god: GodDef, cards: CardDef[], ctx: DescribeContext): void {
  container.replaceChildren();
  const node = (ctx.texts.gods as Record<string, { name?: string; theme?: string }> | undefined)?.[god.id] ?? {};
  const article = el('article', 'entity-sheet god-sheet card-block'); article.dataset.entityKind = 'god'; article.dataset.entityId = god.id;
  const heading = el('h1', '', node.name || '缺失名称'); heading.append(el('code', '', god.id)); article.append(heading, el('p', node.theme ? 'overview' : 'overview missing-copy', node.theme || '缺失：theme'));
  const table = el('table', 'data-table'); const header = el('tr'); header.append(el('th', '', '名册角色'), el('th', '', '卡牌'), el('th', '', '类别 / 标签')); const thead = el('thead'); thead.append(header); table.append(thead);
  const body = el('tbody');
  for (const [role, ids] of [['锚点卡', god.anchorCardIds], ['可变卡', god.variableCardIds]] as const) for (const id of ids) {
    const card = cards.find(item => item.id === id); const view = card ? describeCard(card, ctx) : undefined; const tr = el('tr'); tr.append(el('td', '', role), el('th', '', `${view?.name || '缺失引用'}（${id}）`), el('td', '', view ? `${view.categoryLabel} · ${view.tagLabels.join('、')}` : '—')); body.append(tr);
  }
  table.append(body); article.append(el('h2', '', `本局名册 · 主神 ${god.mainRosterSize} 张 / 副神 ${god.subRosterSize} 张`), table); container.append(article);
}
