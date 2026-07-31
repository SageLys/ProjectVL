import type { CardDef } from '../../core/effects/defs';
import { el } from '../../editor/dom';

export type CopyStatus = 'missing' | 'placeholder' | 'complete';

export interface CopyCell {
  slot: string;
  label: string;
  path?: string;
  value: string;
  status: CopyStatus;
  applicable: boolean;
}

export interface CopyRow { cardId: string; cardName: string; cells: CopyCell[] }

interface Column { slot: string; label: string }

const BASE_COLUMNS: Column[] = [
  { slot: 'name', label: '名称' },
  { slot: 'overview', label: '概述' },
  ...([1, 3, 6] as const).map(star => ({ slot: `hand.shortByTier.${star}`, label: `手牌 ${star}★短文案` })),
  ...([3, 6] as const).map(star => ({ slot: `hand.milestones.${star}`, label: `手牌 ${star}★里程碑` })),
  ...([3, 5, 6] as const).map(star => ({ slot: `equip.shortByTier.${star}`, label: `装备 ${star}★短文案` })),
  ...([3, 5, 6] as const).map(star => ({ slot: `equip.milestones.${star}`, label: `装备 ${star}★里程碑` })),
];
const EVOLUTION_FIELDS = ['name', 'summary', 'intent'] as const;
const EVOLUTION_COLUMNS: Column[] = ([3, 5] as const).flatMap(star => [0, 1, 2].flatMap(option =>
  EVOLUTION_FIELDS.map(field => ({ slot: `evolution.${star}.${option}.${field}`, label: `${star}★${'ABC'[option]} ${field}` })),
));
export const COPY_COLUMNS: readonly Column[] = [...BASE_COLUMNS, ...EVOLUTION_COLUMNS];

type UnknownRecord = Record<string, unknown>;
function record(value: unknown): UnknownRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}; }
function at(root: unknown, path: string[]): unknown { return path.reduce((current, key) => record(current)[key], root); }
function display(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string').join('、');
  if (value && typeof value === 'object') {
    const node = value as UnknownRecord;
    return [node.title, node.detail].filter(item => typeof item === 'string' && item).join(' / ');
  }
  return '';
}

function placeholderFields(options: Array<{ id: string; node: UnknownRecord }>): Set<string> {
  const output = new Set<string>();
  // summary 与 intent 不得相同（语义调换后的主要防复发规则）
  for (const { id, node } of options) {
    const summary = display(node.summary);
    const intent = display(node.intent);
    if (summary && intent && summary === intent) {
      output.add(`${id}.summary`);
      output.add(`${id}.intent`);
    }
  }
  // 同卡同 checkpoint 的多条分支，summary 不得相同（三选一需有辨识度）
  const groups = new Map<string, string[]>();
  for (const { id, node } of options) {
    const value = display(node.summary);
    if (!value) continue;
    const ids = groups.get(value) ?? [];
    ids.push(id);
    groups.set(value, ids);
  }
  for (const ids of groups.values()) if (ids.length > 1) ids.forEach(id => output.add(`${id}.summary`));
  return output;
}

export function analyzeCopyCompleteness(cards: CardDef[], texts: Record<string, unknown>): CopyRow[] {
  return cards.map(card => {
    const node = record(record(texts.cards)[card.id]);
    const checkpointOptions = new Map<number, NonNullable<CardDef['evolutionTree']>['checkpoints'][number]['options']>();
    for (const checkpoint of card.evolutionTree?.checkpoints ?? []) checkpointOptions.set(checkpoint.star, checkpoint.options);
    const placeholders = new Map<number, Set<string>>();
    for (const star of [3, 5]) {
      const options = (checkpointOptions.get(star) ?? []).map(option => ({ id: option.id, node: record(record(record(texts.evolution)[card.id])[option.id]) }));
      placeholders.set(star, placeholderFields(options));
    }
    const cells = COPY_COLUMNS.map(column => {
      if (!column.slot.startsWith('evolution.')) {
        const pathParts = column.slot.split('.');
        const value = display(at(node, pathParts));
        const recipeMilestoneStar = column.slot.match(/\.milestones\.(\d+)$/)?.[1];
        const applicable = !(card.recipeOnly && recipeMilestoneStar != null && recipeMilestoneStar !== '6');
        return {
          ...column,
          path: applicable ? `$.texts.cards.${card.id}.${column.slot}` : undefined,
          value,
          status: applicable && !value ? 'missing' as const : 'complete' as const,
          applicable,
        };
      }
      const [, starText, optionText, field] = column.slot.split('.');
      const star = Number(starText);
      const option = checkpointOptions.get(star)?.[Number(optionText)];
      if (!option) return { ...column, value: '', status: 'complete' as const, applicable: false };
      const evoNode = record(record(record(texts.evolution)[card.id])[option.id]);
      const value = display(evoNode[field]);
      const status: CopyStatus = !value ? 'missing' : placeholders.get(star)?.has(`${option.id}.${field}`) ? 'placeholder' : 'complete';
      return {
        ...column,
        path: `$.texts.evolution.${card.id}.${option.id}.${field}`,
        value,
        status,
        applicable: true,
      };
    });
    return { cardId: card.id, cardName: display(node.name) || card.id, cells };
  });
}

export function cardHasCopyDebt(card: CardDef, texts: Record<string, unknown>): boolean {
  return analyzeCopyCompleteness([card], texts)[0]?.cells.some(cell => cell.applicable && cell.status !== 'complete') ?? false;
}

export function renderCopyCompletenessView(
  container: HTMLElement,
  cards: CardDef[],
  texts: Record<string, unknown>,
  openField: (cardId: string, path: string) => void,
): void {
  container.replaceChildren();
  const rows = analyzeCopyCompleteness(cards, texts);
  const cells = rows.flatMap(row => row.cells).filter(cell => cell.applicable);
  container.append(el('h1', '', '文案完整性看板'));
  container.append(el('p', 'lede', `缺失 ${cells.filter(cell => cell.status === 'missing').length}，占位 ${cells.filter(cell => cell.status === 'placeholder').length}，完成 ${cells.filter(cell => cell.status === 'complete').length}。`));
  const scroll = el('div', 'matrix-scroll');
  const table = el('table', 'matrix-table');
  const head = el('tr');
  head.append(el('th', 'matrix-sticky', '卡牌'));
  COPY_COLUMNS.forEach(column => head.append(el('th', '', column.label)));
  const thead = el('thead'); thead.append(head); table.append(thead);
  const body = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    tr.append(el('th', 'matrix-sticky', `${row.cardName}\n${row.cardId}`));
    for (const cell of row.cells) {
      const td = el('td', `copy-cell copy-cell--${cell.applicable ? cell.status : 'na'}`);
      if (!cell.applicable) td.textContent = '—';
      else {
        const control = el('button', 'copy-cell__button', cell.status === 'complete' ? '✓' : cell.status === 'missing' ? '缺' : '占');
        control.type = 'button';
        control.title = `${cell.label}：${cell.value || '缺失'}`;
        if (cell.path) control.addEventListener('click', () => openField(row.cardId, cell.path as string));
        td.append(control);
      }
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(body);
  scroll.append(table);
  container.append(scroll);
}
