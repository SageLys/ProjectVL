import type { CardDef } from '../core/effects/defs';
import type { EvolutionRecipesConfig, GodDef, RelicDef } from '../config/types';
import { collectIssues, type EditorDomain, type ValidationReportDto } from '../editor/contracts';
import { el } from '../editor/dom';
import type { ReferenceCatalog } from '../editor/references';
import { renderValidationPanel } from '../editor/validationPanel';
import type { DesignSelection } from './navTree';
import { analyzeCopyCompleteness } from './crossViews/copyCompleteness';

export interface ContextPanelOptions {
  selection: DesignSelection;
  cards: CardDef[];
  gods: GodDef[];
  relics: RelicDef[];
  recipes: EvolutionRecipesConfig;
  texts: Record<string, unknown>;
  report?: ValidationReportDto;
  references: ReferenceCatalog;
  locate: (domain: EditorDomain, path: string) => void;
}

type UnknownRecord = Record<string, unknown>;
function record(value: unknown): UnknownRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}; }

function issuePrefixes(options: ContextPanelOptions): string[] {
  const { selection } = options;
  if (selection.kind === 'card') {
    const index = options.cards.findIndex(card => card.id === selection.id);
    const recipeIndex = options.recipes.recipes.findIndex(recipe => recipe.outputCardId === selection.id || recipe.ingredientA.cardId === selection.id || recipe.ingredientB.cardId === selection.id);
    return [`$.skills.cards[${index}]`, `$.texts.cards.${selection.id}`, `$.texts.evolution.${selection.id}`, ...(recipeIndex >= 0 ? [`$.evolutionRecipes.recipes[${recipeIndex}]`] : [])];
  }
  if (selection.kind === 'relic') {
    const index = options.relics.findIndex(relic => relic.id === selection.id);
    return [`$.relics.relics[${index}]`, `$.texts.relics.${selection.id}`];
  }
  const index = options.gods.findIndex(god => god.id === selection.id);
  return [`$.gods.gods[${index}]`, `$.texts.gods.${selection.id}`];
}

function renderIssues(container: HTMLElement, options: ContextPanelOptions): void {
  const report = options.report;
  if (!report) {
    container.append(el('p', 'empty-state', '尚未取得配置管线报告。'));
    return;
  }
  const prefixes = issuePrefixes(options);
  const issues = collectIssues(report).map(item => item.issue).filter(issue => prefixes.some(prefix => issue.path.startsWith(prefix)));
  const filtered: ValidationReportDto = { ok: !issues.some(issue => issue.level === 'error'), checks: report.checks, issues };
  const reports: Partial<Record<EditorDomain, ValidationReportDto>> = {};
  const fallback: EditorDomain = options.selection.kind === 'card' ? 'skills' : options.selection.kind === 'relic' ? 'relics' : 'gods';
  reports[fallback] = filtered;
  renderValidationPanel(container, reports, false, options.locate);
}

function renderReverseReferences(container: HTMLElement, options: ContextPanelOptions): void {
  const section = el('section', 'context-section'); section.append(el('h2', '', '反向引用'));
  const lines: string[] = [];
  if (options.selection.kind === 'card') {
    const card = options.cards.find(item => item.id === options.selection.id);
    for (const recipe of options.recipes.recipes) {
      if (recipe.ingredientA.cardId === options.selection.id || recipe.ingredientB.cardId === options.selection.id) lines.push(`被配方 ${recipe.id} 消耗`);
      if (recipe.outputCardId === options.selection.id) lines.push(`由配方 ${recipe.id} 产出`);
    }
    for (const god of options.gods) {
      if (god.anchorCardIds.includes(options.selection.id)) lines.push(`属于 ${god.id} 的锚点名册`);
      if (god.variableCardIds.includes(options.selection.id)) lines.push(`属于 ${god.id} 的可变名册`);
    }
    if (card) for (const relic of options.relics) {
      const hits = relic.targetTags.filter(tag => card.synergyTags.includes(tag));
      if (hits.length) lines.push(`遗物 ${relic.id} 命中标签：${hits.join('、')}`);
    }
  } else if (options.selection.kind === 'relic') {
    const relic = options.relics.find(item => item.id === options.selection.id);
    if (relic) for (const card of options.cards) {
      const hits = card.synergyTags.filter(tag => relic.targetTags.includes(tag));
      if (hits.length) lines.push(`命中卡 ${card.id}：${hits.join('、')}`);
    }
  } else {
    const god = options.gods.find(item => item.id === options.selection.id);
    if (god) lines.push(`锚点卡 ${god.anchorCardIds.length} 张：${god.anchorCardIds.join('、')}`, `可变卡 ${god.variableCardIds.length} 张：${god.variableCardIds.join('、')}`, `专属遗物 ${options.relics.filter(relic => relic.god === god.id).length} 件`);
  }
  if (!lines.length) section.append(el('p', 'empty-state', '未发现反向引用。'));
  else { const list = el('ul'); lines.forEach(line => list.append(el('li', '', line))); section.append(list); }
  section.append(el('small', 'catalog-note', `引用目录：${options.references.cards.length} 卡 / ${options.references.gods.length} 神 / ${options.references.tags.length} 标签`));
  container.append(section);
}

function flattenStrings(value: unknown, path: string, output: Array<{ path: string; value: string }>): void {
  if (typeof value === 'string') { output.push({ path, value }); return; }
  if (Array.isArray(value)) { output.push({ path, value: value.filter(item => typeof item === 'string').join('、') }); return; }
  if (!value || typeof value !== 'object') return;
  Object.entries(value as UnknownRecord).forEach(([key, child]) => flattenStrings(child, `${path}.${key}`, output));
}

function renderTextSlots(container: HTMLElement, options: ContextPanelOptions): void {
  const section = el('section', 'context-section'); section.append(el('h2', '', 'texts 文案槽位'));
  const slots: Array<{ path: string; value: string; missing?: boolean }> = [];
  if (options.selection.kind === 'card') {
    const card = options.cards.find(item => item.id === options.selection.id);
    if (card) analyzeCopyCompleteness([card], options.texts)[0]?.cells.filter(cell => cell.applicable).forEach(cell => slots.push({ path: cell.path ?? cell.slot, value: cell.value, missing: cell.status === 'missing' }));
  } else {
    const root = options.selection.kind === 'god' ? record(options.texts.gods)[options.selection.id] : record(options.texts.relics)[options.selection.id];
    flattenStrings(root, `$.texts.${options.selection.kind === 'god' ? 'gods' : 'relics'}.${options.selection.id}`, slots);
    if (!root) slots.push({ path: '文案节点', value: '', missing: true });
  }
  const list = el('div', 'slot-list');
  for (const slot of slots) {
    const item = el('article', `slot${slot.missing ? ' slot--missing' : ''}`);
    item.append(el('code', '', slot.path.replace(/^\$\.texts\./, '')), el('p', '', slot.value || '缺失'));
    list.append(item);
  }
  section.append(list); container.append(section);
}

export function renderContextPanel(container: HTMLElement, options: ContextPanelOptions): void {
  container.replaceChildren();
  const validation = el('section', 'context-section validation-context'); renderIssues(validation, options); container.append(validation);
  renderReverseReferences(container, options);
  renderTextSlots(container, options);
}
