import type { CardDef } from '../core/effects/defs';
import type { GodDef } from '../config/types';
import { el } from '../editor/dom';
import type { BindingView, CardView, DescribeContext, EffectView, TierView } from './describe';
import { describeCard } from './describe';
import { editableTextBlock, type TextEditingOptions, type TextFieldSpec } from './textEditing';
import {
  editableMechanismBlock, renderAffixPoolForm, renderAmplifyForm, renderBindingsForm,
  renderCardMetaForm, renderConsumableEffectsForm, renderDesignNotesForm, renderRecipeForm,
  type MechanismEditingOptions,
} from './mechanismEditor';

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

function renderPlayerCopy(tier: TierView, view: CardView, editing?: TextEditingOptions): HTMLElement {
  const block = el('div', 'player-copy');
  block.append(el('span', 'eyebrow', '玩家可见'));
  block.append(missing(tier.visibleText));
  if (tier.milestone) block.append(el('small', '', `${tier.milestone.title || '缺失标题'}：${tier.milestone.detail || '缺失详情'}`));
  const mode = 'equip';
  const fields: TextFieldSpec[] = [{ path: `$.texts.cards.${view.id}.${mode}.shortByTier.${tier.star}`, label: `${tier.star}★短文案`, multiline: true }];
  if (tier.milestone) fields.push(
    { path: `$.texts.cards.${view.id}.${mode}.milestones.${tier.star}.title`, label: `${tier.star}★里程碑标题` },
    { path: `$.texts.cards.${view.id}.${mode}.milestones.${tier.star}.detail`, label: `${tier.star}★里程碑详情`, multiline: true },
  );
  return editableTextBlock(block, fields, editing, 'player-copy-editor');
}

function tierTitle(tier: TierView): string {
  if (tier.kind === 'checkpoint') return `${tier.star}★ 分支选择`;
  if (tier.kind === 'amplify') return '4★ 强化（公共）';
  if (tier.kind === 'fixed') return '6★ 终态（配方产物，无分支）';
  return '6★ 终态（公共）';
}

function renderTier(
  tier: TierView,
  view: CardView,
  card: CardDef,
  cardPath: string,
  editing?: TextEditingOptions,
  mechanism?: MechanismEditingOptions,
): HTMLElement {
  const section = el('section', `tier-block card-block tier-block--${tier.kind}`);
  section.append(el('h2', '', tierTitle(tier)));
  if (tier.kind !== 'amplify') section.append(renderPlayerCopy(tier, view, editing));
  if (tier.kind === 'checkpoint') {
    if (tier.activeBindings?.length) {
      const active = el('details', 'active-bindings');
      active.append(el('summary', '', 'stars 当前实际生效值'));
      const starSource = card.stars[String(tier.star) as '3' | '5'];
      const starPath = `${cardPath}.stars.${tier.star}.equip`;
      active.append(editableMechanismBlock(renderBindings(tier.activeBindings), starPath, mechanism, editor => {
        if (starSource) renderBindingsForm(editor, starSource.equip, starPath, mechanism?.references ?? { cards: [], gods: [], tags: [], textKeys: [] }, () => mechanism?.onChange('skills'));
      }));
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
      const mechanismBlock = el('div', 'mechanism');
      mechanismBlock.append(el('span', 'eyebrow', '设计层机制'));
      const checkpointIndex = card.evolutionTree?.checkpoints.findIndex(checkpoint => checkpoint.star === tier.star) ?? -1;
      const checkpoint = checkpointIndex >= 0 ? card.evolutionTree?.checkpoints[checkpointIndex] : undefined;
      const optionIndex = checkpoint?.options.findIndex(option => option.id === branch.id) ?? -1;
      const source = optionIndex >= 0 ? checkpoint?.options[optionIndex] : undefined;
      const branchPath = `${cardPath}.evolutionTree.checkpoints[${checkpointIndex}].options[${optionIndex}].equip`;
      mechanismBlock.append(editableMechanismBlock(renderBindings(branch.bindings), branchPath, mechanism, editor => {
        if (source) renderBindingsForm(editor, source.equip, branchPath, mechanism?.references ?? { cards: [], gods: [], tags: [], textKeys: [] }, () => mechanism?.onChange('skills'));
      }));
      const branchBase = `$.texts.evolution.${view.id}.${branch.id}`;
      const fields: TextFieldSpec[] = [
        { path: `${branchBase}.name`, label: '分支名称' },
        { path: `${branchBase}.summary`, label: '玩家摘要', multiline: true },
        { path: `${branchBase}.intent`, label: '设计意图', multiline: true },
        { path: `${branchBase}.keywords`, label: '关键词', kind: 'stringArray' },
        { path: `${branchBase}.buildFit`, label: '构筑适配', multiline: true },
      ];
      item.append(editableTextBlock(copy, fields, editing, 'branch-copy-editor'), mechanismBlock);
      grid.append(item);
    }
    section.append(grid);
  } else if (tier.kind === 'amplify') {
    section.append(el('p', 'silent-note', '无独立里程碑文案：数值静默提升，不弹窗。'));
    const amplifyRead = el('div'); amplifyRead.append(missing(tier.amplifyDescription ?? '', '缺失：amplifyAxis.description'));
    section.append(editableMechanismBlock(amplifyRead, `${cardPath}.amplifyAxis`, mechanism, editor => {
      if (mechanism) renderAmplifyForm(editor, card, cardPath, mechanism);
    }, '', '编辑强化'));
  } else {
    if (tier.kind === 'shared' && tier.activeBindings?.length) {
      const current = el('details', 'active-bindings'); current.append(el('summary', '', 'stars.6 当前实际生效值'));
      const starPath = `${cardPath}.stars.6.equip`;
      current.append(editableMechanismBlock(renderBindings(tier.activeBindings), starPath, mechanism, editor => {
        renderBindingsForm(editor, card.stars['6'].equip, starPath, mechanism?.references ?? { cards: [], gods: [], tags: [], textKeys: [] }, () => mechanism?.onChange('skills'));
      })); section.append(current);
    }
    const sourceNodeIndex = card.evolutionTree?.sharedNodes.findIndex(node => node.star === tier.star) ?? -1;
    const sourceBindings = tier.kind === 'fixed' ? card.stars['6'].equip : card.evolutionTree?.sharedNodes[sourceNodeIndex]?.equip;
    const sourcePath = tier.kind === 'fixed' ? `${cardPath}.stars.6.equip` : `${cardPath}.evolutionTree.sharedNodes[${sourceNodeIndex}].equip`;
    const read = el('div', 'mechanism'); read.append(renderBindings(tier.bindings));
    section.append(editableMechanismBlock(read, sourcePath, mechanism, editor => {
      if (sourceBindings) renderBindingsForm(editor, sourceBindings, sourcePath, mechanism?.references ?? { cards: [], gods: [], tags: [], textKeys: [] }, () => mechanism?.onChange('skills'));
    }));
  }
  return section;
}

function renderConsumable(view: CardView, card: CardDef, cardPath: string, editing?: TextEditingOptions, mechanism?: MechanismEditingOptions): HTMLElement {
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
    const copyRead = el('div'); copyRead.append(missing(tier.visibleText));
    if (tier.milestone) copyRead.append(el('small', '', `${tier.milestone.title}：${tier.milestone.detail}`));
    const handBase = `$.texts.cards.${view.id}.hand`;
    const fields: TextFieldSpec[] = [{ path: `${handBase}.shortByTier.${tier.star}`, label: `${tier.star}★短文案`, multiline: true }];
    if (tier.milestone) fields.push(
      { path: `${handBase}.milestones.${tier.star}.title`, label: `${tier.star}★里程碑标题` },
      { path: `${handBase}.milestones.${tier.star}.detail`, label: `${tier.star}★里程碑详情`, multiline: true },
    );
    const copy = el('td'); copy.append(editableTextBlock(copyRead, fields, editing, 'consumable-copy-editor'));
    tr.append(copy, el('td', '', [tier.radius === undefined ? '' : `半径 ${tier.radius}`, tier.duration === undefined ? '' : `持续 ${tier.duration}s`].filter(Boolean).join('，') || '—'));
    const effects = el('td'); const list = el('ul', 'effect-list'); tier.effects.forEach(effect => list.append(renderEffectView(effect)));
    const anchor = card.consumable.anchors[String(tier.star) as '1' | '3' | '6'];
    const anchorPath = `${cardPath}.consumable.anchors.${tier.star}`;
    effects.append(editableMechanismBlock(list, anchorPath, mechanism, editor => {
      renderConsumableEffectsForm(editor, anchor, anchorPath, mechanism?.references ?? { cards: [], gods: [], tags: [], textKeys: [] }, () => mechanism?.onChange('skills'));
    }, '', '编辑落点'));
    tr.append(effects);
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

export function renderCardView(
  container: HTMLElement,
  card: CardDef,
  ctx: DescribeContext,
  cardIndex?: number,
  editing?: TextEditingOptions,
  mechanism?: MechanismEditingOptions,
): void {
  container.replaceChildren();
  const view = describeCard(card, ctx);
  const article = el('article', 'entity-sheet card-sheet card-block');
  article.dataset.entityKind = 'card'; article.dataset.entityId = card.id;
  article.dataset.configPath = cardIndex === undefined ? '$.skills.cards' : `$.skills.cards[${cardIndex}]`;
  const cardPath = article.dataset.configPath;
  const title = el('header', 'entity-header');
  const heading = el('h1', '', view.name || '缺失名称'); heading.append(el('code', '', view.id));
  const badges = el('div', 'badge-row');
  badges.append(badge(view.categoryLabel, 'category'), ...view.tagLabels.map(label => badge(label, 'tag')));
  if (view.teaching) badges.append(badge('教学卡', 'teach'));
  badges.append(badge(view.roster === 'anchor' ? '锚点卡 · 必进本局' : view.roster === 'variable' ? '可变卡 · 抽取候选' : '融合产物 · recipeOnly', view.roster === 'recipeOnly' ? 'fusion' : 'roster'));
  const metaRead = el('div'); metaRead.append(badges);
  title.append(
    editableTextBlock(heading, [{ path: `$.texts.cards.${view.id}.name`, label: '卡牌名称' }], editing, 'title-copy-editor'),
    editableMechanismBlock(metaRead, `${cardPath}.category`, mechanism, editor => { if (mechanism) renderCardMetaForm(editor, card, cardPath, mechanism); }, 'card-meta-editor', '编辑属性'),
  ); article.append(title);
  if (view.recipe) {
    const recipeRead = el('p', 'recipe-banner', `配方 ${view.recipe.id}：${view.recipe.a.name || view.recipe.a.cardId}（${view.recipe.a.cardId} ≥${view.recipe.a.minStar}★） + ${view.recipe.b.name || view.recipe.b.cardId}（${view.recipe.b.cardId} ≥${view.recipe.b.minStar}★） → ${view.recipe.outputStar}★，仅限 ${view.recipe.allowedPhase}`);
    const recipeIndex = ctx.recipes.recipes.findIndex(recipe => recipe.id === view.recipe?.id);
    const recipe = ctx.recipes.recipes[recipeIndex]; const recipePath = `$.evolutionRecipes.recipes[${recipeIndex}]`;
    article.append(editableMechanismBlock(recipeRead, recipePath, mechanism, editor => { if (recipe && mechanism) renderRecipeForm(editor, recipe, recipePath, mechanism); }, '', '编辑配方'));
  }
  article.append(editableTextBlock(el('p', view.overview ? 'overview' : 'overview missing-copy', view.overview || '缺失：overview'), [{ path: `$.texts.cards.${view.id}.overview`, label: '概述', multiline: true }], editing, 'overview-copy-editor'));
  const route = el('section', 'tier-route'); route.append(el('h2', '', '装备态 · 星级路线')); view.tiers.forEach(tier => route.append(renderTier(tier, view, card, cardPath, editing, mechanism))); article.append(route);
  article.append(renderConsumable(view, card, cardPath, editing, mechanism));
  article.append(editableMechanismBlock(renderAffixes(view), `${cardPath}.affixPool`, mechanism, editor => { if (mechanism) renderAffixPoolForm(editor, card, cardPath, mechanism); }, '', '编辑词条池'));
  const notes = el('section', 'design-notes card-block'); notes.append(el('h2', '', '设计备注'), missing(view.designNotes ?? '', '无 designNotes'));
  article.append(editableMechanismBlock(notes, `${cardPath}.designNotes`, mechanism, editor => { if (mechanism) renderDesignNotesForm(editor, card, cardPath, mechanism); }, '', '编辑备注'));
  if (card.fusionPolicy) article.append(el('section', 'callout callout--warning', `fusionPolicy：${JSON.stringify(card.fusionPolicy)}。未实现，暂不建议填写。`));
  container.append(article);
}

export function renderGodView(container: HTMLElement, god: GodDef, cards: CardDef[], ctx: DescribeContext, editing?: TextEditingOptions): void {
  container.replaceChildren();
  const node = (ctx.texts.gods as Record<string, { name?: string; theme?: string }> | undefined)?.[god.id] ?? {};
  const article = el('article', 'entity-sheet god-sheet card-block'); article.dataset.entityKind = 'god'; article.dataset.entityId = god.id;
  const heading = el('h1', '', node.name || '缺失名称'); heading.append(el('code', '', god.id));
  article.append(
    editableTextBlock(heading, [{ path: `$.texts.gods.${god.id}.name`, label: '神祇名称' }], editing, 'title-copy-editor'),
    editableTextBlock(el('p', node.theme ? 'overview' : 'overview missing-copy', node.theme || '缺失：theme'), [{ path: `$.texts.gods.${god.id}.theme`, label: '设计主题', multiline: true }], editing, 'overview-copy-editor'),
  );
  const table = el('table', 'data-table'); const header = el('tr'); header.append(el('th', '', '名册角色'), el('th', '', '卡牌'), el('th', '', '类别 / 标签')); const thead = el('thead'); thead.append(header); table.append(thead);
  const body = el('tbody');
  for (const [role, ids] of [['锚点卡', god.anchorCardIds], ['可变卡', god.variableCardIds]] as const) for (const id of ids) {
    const card = cards.find(item => item.id === id); const view = card ? describeCard(card, ctx) : undefined; const tr = el('tr'); tr.append(el('td', '', role), el('th', '', `${view?.name || '缺失引用'}（${id}）`), el('td', '', view ? `${view.categoryLabel} · ${view.tagLabels.join('、')}` : '—')); body.append(tr);
  }
  table.append(body); article.append(el('h2', '', `本局名册 · 主神 ${god.mainRosterSize} 张 / 副神 ${god.subRosterSize} 张`), table); container.append(article);
}
