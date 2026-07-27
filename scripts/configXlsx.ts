import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import type { Cell, CellValue, Worksheet } from 'exceljs';
import { ATOM_CONTRACT, type AtomParamSpec } from '../src/core/effects/atomContract';
import type { BindingDef, CardDef, EffectDef } from '../src/core/effects/defs';
import { stableJson } from '../src/config/format';
import {
  WRITABLE_DOMAINS, validateCandidate, type CandidateReport, type WritableDomain,
} from '../src/config/pipeline';
import { describeLabel, labelWithKey } from '../src/editor/labels';

export const CONFIG_XLSX_PATH = '交付/配置总表.xlsx';
export const CONFIG_XLSX_FORMAT_VERSION = '1';

export type ConfigSnapshot = Record<WritableDomain, unknown>;

type JsonRecord = Record<string, unknown>;
type Scalar = string | number | boolean | null;
type NodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

interface FlatNode {
  pointer: string;
  type: NodeType;
  value?: Scalar;
}

interface ColumnSpec {
  key: string;
  label: string;
  help?: string;
  hidden?: boolean;
  width?: number;
}

interface RecordRow {
  section?: string;
  item: JsonRecord;
}

interface RecordDomainSpec {
  arrays: readonly string[];
  textRoot?: 'gods' | 'relics';
}

interface ReadRecordDomain {
  data: unknown;
  texts: Record<string, unknown>;
}

interface ReadSkills {
  skills: unknown;
  texts: Record<string, unknown>;
}

export interface LocatedConfigIssue {
  domain: WritableDomain;
  variant?: string;
  path: string;
  message: string;
}

export interface ConfigXlsxImportResult {
  ok: boolean;
  written: boolean;
  reports: Partial<Record<WritableDomain, CandidateReport>>;
  issues: LocatedConfigIssue[];
  snapshot: ConfigSnapshot;
}

const RECORD_DOMAIN_SPECS: Partial<Record<WritableDomain, RecordDomainSpec>> = {
  gods: { arrays: ['gods'], textRoot: 'gods' },
  relics: { arrays: ['relics'], textRoot: 'relics' },
  evolutionRecipes: { arrays: ['recipes'] },
  waveRewards: { arrays: ['floor', 'choice'] },
  tuner: { arrays: ['params'] },
};

const LONG_DOMAINS = [
  'combat', 'waves', 'enemies', 'difficulty', 'progression', 'economy', 'bounty', 'input',
] as const satisfies readonly WritableDomain[];

const ENTITY_TEXT_ROOTS = ['cards', 'gods', 'relics'] as const;
const INTERNAL_PREFIX = '__';
const TECHNICAL_HEADER_ROW = 3;
const VISIBLE_HEADER_ROW = 4;
const DATA_START_ROW = 5;

const COLORS = {
  title: '17365D',
  header: '2F75B5',
  headerText: 'FFFFFF',
  subtitle: 'D9EAF7',
  container: 'EEF3F8',
  line: 'D7E1EA',
  alternate: 'F7FAFC',
};

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function valueType(value: unknown): NodeType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (isRecord(value)) return 'object';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return typeof value as NodeType;
  throw new Error(`工作簿不支持 ${typeof value} 值`);
}

function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function unescapePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function childPointer(parent: string, segment: string): string {
  return `${parent === '#' ? '#' : parent}/${escapePointerSegment(segment)}`;
}

function pointerSegments(pointer: string): string[] {
  if (pointer === '#') return [];
  if (!pointer.startsWith('#/')) throw new Error(`非法 JSON Pointer：${pointer}`);
  return pointer.slice(2).split('/').map(unescapePointerSegment);
}

function flattenNodes(value: unknown, pointer = '#', out: FlatNode[] = []): FlatNode[] {
  const type = valueType(value);
  if (type === 'array') {
    out.push({ pointer, type });
    (value as unknown[]).forEach((item, index) => flattenNodes(item, childPointer(pointer, String(index)), out));
  } else if (type === 'object') {
    out.push({ pointer, type });
    for (const [key, item] of Object.entries(value as JsonRecord)) flattenNodes(item, childPointer(pointer, key), out);
  } else {
    out.push({ pointer, type, value: value as Scalar });
  }
  return out;
}

function assignFlatNode(root: unknown, node: FlatNode, location: string): unknown {
  const segments = pointerSegments(node.pointer);
  const nextValue = node.type === 'array' ? [] : node.type === 'object' ? {} : node.value;
  if (!segments.length) return nextValue;
  if (root === undefined) throw new Error(`${location}: 根容器必须先出现`);
  let parent: unknown = root;
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index];
    if (Array.isArray(parent)) parent = parent[Number(segment)];
    else if (isRecord(parent)) parent = parent[segment];
    else throw new Error(`${location}: 父路径不存在`);
  }
  const key = segments[segments.length - 1];
  if (Array.isArray(parent)) {
    if (!/^\d+$/.test(key)) throw new Error(`${location}: 数组下标必须是非负整数`);
    parent[Number(key)] = nextValue;
  } else if (isRecord(parent)) {
    parent[key] = nextValue;
  } else {
    throw new Error(`${location}: 父路径不是容器`);
  }
  return root;
}

function fieldLabel(domain: string, field: string, english = field): string {
  return labelWithKey('domainField', `${domain}.${field}`, english);
}

function fieldHelp(domain: string, field: string): string | undefined {
  return describeLabel('domainField', `${domain}.${field}`).help;
}

function pointerLabel(domain: string, pointer: string): string {
  const segments = pointerSegments(pointer);
  if (!segments.length) return domain;
  const field = segments.filter(segment => !/^\d+$/.test(segment)).join('.');
  const english = segments[segments.length - 1];
  return fieldLabel(domain, field || english, english);
}

function textColumnLabel(pointer: string): string {
  const segments = pointerSegments(pointer);
  const tail = segments[segments.length - 1] ?? 'value';
  return fieldLabel('texts', tail, `text.${segments.join('.')}`);
}

function cellValue(cell: Cell): unknown {
  const value = cell.value as CellValue;
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'object' || value instanceof Date) return value;
  if ('result' in value) return value.result;
  if ('richText' in value) return value.richText.map(part => part.text).join('');
  if ('text' in value) return value.text;
  return value;
}

function blank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function parseJson(value: unknown, location: string): unknown {
  if (blank(value)) return undefined;
  if (typeof value !== 'string') throw new Error(`${location}: 必须填写 JSON 文本`);
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${location}: JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseScalar(value: unknown, type: NodeType, location: string): Scalar | undefined {
  if (blank(value)) return undefined;
  if (type === 'string') return String(value);
  if (type === 'number') {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`${location}: 必须是有限数值`);
    return parsed;
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toUpperCase();
    if (normalized === 'TRUE') return true;
    if (normalized === 'FALSE') return false;
    throw new Error(`${location}: 布尔值只能是 TRUE/FALSE`);
  }
  if (type === 'null') return null;
  throw new Error(`${location}: ${type} 不是标量类型`);
}

function encodeCell(value: unknown): Scalar | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return JSON.stringify(value);
}

function recordValueType(value: unknown): NodeType | 'json' {
  const type = valueType(value);
  return type === 'object' || type === 'array' ? 'json' : type;
}

function parseRecordValue(value: unknown, type: NodeType | 'json', location: string): unknown {
  return type === 'json' ? parseJson(value, location) : parseScalar(value, type, location);
}

function addHeaderNote(cell: Cell, note: string | undefined): void {
  if (note) cell.note = note;
}

function writeTableSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  description: string,
  columns: ColumnSpec[],
  rows: Array<Record<string, Scalar | undefined>>,
  version?: string,
): Worksheet {
  const sheet = workbook.addWorksheet(sheetName, { properties: { defaultRowHeight: 18 } });
  const lastColumn = Math.max(1, columns.length);
  const lastVisibleColumn = Math.max(1, columns.reduce((last, column, index) => column.hidden ? last : index + 1, 1));
  const titleBandEnd = Math.min(lastVisibleColumn, 12);
  sheet.mergeCells(1, 1, 1, titleBandEnd);
  const title = sheet.getCell(1, 1);
  title.value = `配置总表 · ${sheetName}`;
  title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 15 };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.title}` } };
  title.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 30;
  for (let column = 1; column <= lastColumn; column++) {
    sheet.getCell(1, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.title}` } };
  }

  if (version !== undefined) {
    sheet.getCell(2, 1).value = fieldLabel(sheetName.split('.')[0], 'version');
    sheet.getCell(2, 2).value = version;
    if (titleBandEnd > 2) sheet.mergeCells(2, 3, 2, titleBandEnd);
    if (titleBandEnd > 2) sheet.getCell(2, 3).value = description;
  } else {
    sheet.mergeCells(2, 1, 2, titleBandEnd);
    sheet.getCell(2, 1).value = description;
  }
  sheet.getRow(2).height = 28;
  for (let column = 1; column <= lastColumn; column++) {
    const cell = sheet.getCell(2, column);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.subtitle}` } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  }

  columns.forEach((column, index) => {
    const excelColumn = index + 1;
    sheet.getCell(TECHNICAL_HEADER_ROW, excelColumn).value = column.key;
    const header = sheet.getCell(VISIBLE_HEADER_ROW, excelColumn);
    header.value = column.label;
    header.font = { bold: true, color: { argb: `FF${COLORS.headerText}` } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.header}` } };
    header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    header.border = { bottom: { style: 'medium', color: { argb: `FF${COLORS.title}` } } };
    addHeaderNote(header, column.help);
    sheet.getColumn(excelColumn).hidden = !!column.hidden;
    sheet.getColumn(excelColumn).width = column.width ?? 18;
  });
  sheet.getRow(TECHNICAL_HEADER_ROW).hidden = true;
  sheet.getRow(VISIBLE_HEADER_ROW).height = 32;

  rows.forEach((row, rowIndex) => {
    const excelRow = DATA_START_ROW + rowIndex;
    let maxTextLength = 0;
    columns.forEach((column, columnIndex) => {
      const cell = sheet.getCell(excelRow, columnIndex + 1);
      const value = row[column.key];
      cell.value = value ?? null;
      cell.alignment = { vertical: 'top', wrapText: typeof value === 'string' && value.length > 60 };
      if (typeof value === 'string') maxTextLength = Math.max(maxTextLength, value.length);
      if (typeof value === 'number') cell.numFmt = '0.##########';
      if (rowIndex % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.alternate}` } };
      cell.border = { bottom: { style: 'hair', color: { argb: `FF${COLORS.line}` } } };
    });
    sheet.getRow(excelRow).height = maxTextLength > 300 ? 72 : maxTextLength > 120 ? 48 : maxTextLength > 60 ? 32 : 20;
  });

  if (rows.length) {
    sheet.autoFilter = {
      from: { row: VISIBLE_HEADER_ROW, column: 1 },
      to: { row: VISIBLE_HEADER_ROW + rows.length, column: lastVisibleColumn },
    };
  }
  sheet.views = [{ state: 'frozen', ySplit: VISIBLE_HEADER_ROW, showGridLines: false }];
  return sheet;
}

function technicalColumns(sheet: Worksheet): Map<string, number> {
  const columns = new Map<string, number>();
  sheet.getRow(TECHNICAL_HEADER_ROW).eachCell({ includeEmpty: false }, (cell, column) => {
    const key = cellValue(cell);
    if (typeof key === 'string' && key) columns.set(key, column);
  });
  return columns;
}

function readRows(sheet: Worksheet): Array<{ row: number; values: Map<string, unknown> }> {
  const columns = technicalColumns(sheet);
  const out: Array<{ row: number; values: Map<string, unknown> }> = [];
  for (let row = DATA_START_ROW; row <= sheet.rowCount; row++) {
    const values = new Map<string, unknown>();
    let any = false;
    for (const [key, column] of columns) {
      const value = cellValue(sheet.getCell(row, column));
      values.set(key, value);
      if (!blank(value) && !key.startsWith(INTERNAL_PREFIX)) any = true;
    }
    if (any) out.push({ row, values });
  }
  return out;
}

function requireSheet(workbook: ExcelJS.Workbook, name: string): Worksheet {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) throw new Error(`工作簿缺少 sheet：${name}`);
  return sheet;
}

function sheetVersion(sheet: Worksheet): string {
  const version = cellValue(sheet.getCell(2, 2));
  if (blank(version)) throw new Error(`${sheet.name}!B2: 缺少 version`);
  return String(version);
}

function longColumns(domain: string): ColumnSpec[] {
  return [
    { key: 'path', label: fieldLabel(domain, 'path'), help: fieldHelp(domain, 'path'), width: 42 },
    { key: 'label', label: fieldLabel(domain, 'label'), help: fieldHelp(domain, 'label'), width: 24 },
    { key: 'value', label: fieldLabel(domain, 'value'), help: fieldHelp(domain, 'value'), width: 28 },
    { key: 'type', label: fieldLabel(domain, 'type'), help: fieldHelp(domain, 'type'), width: 13 },
  ];
}

function writeLongDomain(workbook: ExcelJS.Workbook, domain: string, value: unknown, sheetName = domain): void {
  const nodes = flattenNodes(value);
  const rows = nodes.map(node => ({
    path: node.pointer,
    label: pointerLabel(domain, node.pointer),
    value: node.value,
    type: node.type,
  }));
  const sheet = writeTableSheet(
    workbook, sheetName, '容器行定义结构；标量行直接编辑 value。数组顺序由 path 中的下标决定。',
    longColumns(domain), rows,
  );
  rows.forEach((row, index) => {
    if (row.type === 'array' || row.type === 'object') {
      sheet.getRow(DATA_START_ROW + index).eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.container}` } };
        cell.font = { italic: true, color: { argb: 'FF536878' } };
      });
    }
  });
}

function readLongDomain(workbook: ExcelJS.Workbook, sheetName: string): unknown {
  const sheet = requireSheet(workbook, sheetName);
  let root: unknown;
  for (const entry of readRows(sheet)) {
    const pointer = entry.values.get('path');
    const type = entry.values.get('type');
    if (typeof pointer !== 'string' || !pointer) throw new Error(`${sheetName}!A${entry.row}: path 不能为空`);
    if (!['object', 'array', 'string', 'number', 'boolean', 'null'].includes(String(type))) {
      throw new Error(`${sheetName}!D${entry.row}: 未知 type ${String(type)}`);
    }
    const nodeType = String(type) as NodeType;
    const value = nodeType === 'object' || nodeType === 'array'
      ? undefined
      : parseScalar(entry.values.get('value'), nodeType, `${sheetName}!C${entry.row}`);
    if (value === undefined && nodeType !== 'object' && nodeType !== 'array') continue;
    root = assignFlatNode(root, { pointer, type: nodeType, value }, `${sheetName}!A${entry.row}`);
  }
  if (root === undefined) throw new Error(`${sheetName}: 没有可导入的数据`);
  return root;
}

function getTextEntry(texts: JsonRecord, root: string | undefined, item: JsonRecord): unknown {
  if (!root || typeof item.textKey !== 'string') return undefined;
  const prefix = `${root}.`;
  if (!item.textKey.startsWith(prefix)) return undefined;
  const table = texts[root];
  return isRecord(table) ? table[item.textKey.slice(prefix.length)] : undefined;
}

function textKeyId(root: string, item: JsonRecord): string | undefined {
  if (typeof item.textKey !== 'string' || !item.textKey.startsWith(`${root}.`)) return undefined;
  return item.textKey.slice(root.length + 1);
}

function unionInEncounterOrder(groups: readonly string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) for (const key of group) if (!seen.has(key)) {
    seen.add(key);
    out.push(key);
  }
  return out;
}

function recordRows(data: JsonRecord, spec: RecordDomainSpec): RecordRow[] {
  return spec.arrays.flatMap(section => {
    const value = data[section];
    if (!Array.isArray(value)) throw new Error(`${section} 必须是数组`);
    return value.map(item => {
      if (!isRecord(item)) throw new Error(`${section} 的元素必须是对象`);
      return { section: spec.arrays.length > 1 ? section : undefined, item };
    });
  });
}

function writeRecordDomain(
  workbook: ExcelJS.Workbook,
  domain: WritableDomain,
  value: unknown,
  texts: JsonRecord,
  spec: RecordDomainSpec,
): void {
  if (!isRecord(value)) throw new Error(`${domain} 根必须是对象`);
  const version = typeof value.version === 'string' ? value.version : undefined;
  const records = recordRows(value, spec);
  const fieldKeys = unionInEncounterOrder(records.map(record => Object.keys(record.item)));
  const textNodes = records.map(record => flattenNodes(getTextEntry(texts, spec.textRoot, record.item) ?? {}));
  const textLeafPointers = unionInEncounterOrder(textNodes.map(nodes => nodes.filter(node => !['object', 'array'].includes(node.type)).map(node => node.pointer)));
  const columns: ColumnSpec[] = [
    ...(spec.arrays.length > 1
      ? [{ key: 'section', label: fieldLabel(domain, 'section'), width: 14 }]
      : []),
    ...fieldKeys.map(key => ({ key, label: fieldLabel(domain, key), help: fieldHelp(domain, key), width: 20 })),
    ...textLeafPointers.map(pointer => ({ key: `text:${pointer}`, label: textColumnLabel(pointer), width: 32 })),
    { key: '__fieldOrder', label: '__fieldOrder', hidden: true },
    { key: '__fieldTypes', label: '__fieldTypes', hidden: true },
    { key: '__textNodes', label: '__textNodes', hidden: true },
  ];
  const rows = records.map((record, index) => {
    const row: Record<string, Scalar | undefined> = {};
    if (record.section) row.section = record.section;
    for (const key of fieldKeys) row[key] = encodeCell(record.item[key]);
    row.__fieldOrder = JSON.stringify(Object.keys(record.item));
    row.__fieldTypes = JSON.stringify(Object.fromEntries(Object.entries(record.item).map(([key, item]) => [key, recordValueType(item)])));
    row.__textNodes = JSON.stringify(textNodes[index].map(node => ({ pointer: node.pointer, type: node.type })));
    for (const node of textNodes[index]) {
      if (node.type !== 'object' && node.type !== 'array') row[`text:${node.pointer}`] = node.value;
    }
    return row;
  });
  writeTableSheet(
    workbook, domain, '一行一个配置实体；对象/数组字段使用 JSON 文本。文案列会拆回 texts.json。',
    columns, rows, version,
  );
}

function parseStringArray(value: unknown, location: string): string[] {
  const parsed = parseJson(value, location);
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) throw new Error(`${location}: 必须是字符串数组 JSON`);
  return parsed;
}

function parseTypeMap(value: unknown, location: string): Record<string, NodeType | 'json'> {
  const parsed = parseJson(value, location);
  if (!isRecord(parsed)) throw new Error(`${location}: 字段类型元数据损坏`);
  return parsed as Record<string, NodeType | 'json'>;
}

function buildTextEntry(
  row: { row: number; values: Map<string, unknown> },
  sheetName: string,
): unknown {
  const rawNodes = parseJson(row.values.get('__textNodes'), `${sheetName}!${row.row}`);
  const nodes = Array.isArray(rawNodes)
    ? rawNodes.filter(node => isRecord(node) && typeof node.pointer === 'string' && typeof node.type === 'string') as Array<{ pointer: string; type: NodeType }>
    : [];
  if (!nodes.length) return undefined;
  let root: unknown;
  for (const node of nodes) {
    const value = node.type === 'object' || node.type === 'array'
      ? undefined
      : parseScalar(row.values.get(`text:${node.pointer}`), node.type, `${sheetName}!${row.row} ${node.pointer}`);
    if (value === undefined && node.type !== 'object' && node.type !== 'array') continue;
    root = assignFlatNode(root, { pointer: node.pointer, type: node.type, value }, `${sheetName}!${row.row}`);
  }
  return root;
}

function readRecordDomain(
  workbook: ExcelJS.Workbook,
  domain: WritableDomain,
  spec: RecordDomainSpec,
): ReadRecordDomain {
  const sheet = requireSheet(workbook, domain);
  const headerKeys = [...technicalColumns(sheet).keys()];
  const fieldKeys = headerKeys.filter(key => key !== 'section' && !key.startsWith('text:') && !key.startsWith(INTERNAL_PREFIX));
  const bySection = new Map<string, JsonRecord[]>();
  spec.arrays.forEach(section => bySection.set(section, []));
  const texts: Record<string, unknown> = {};
  for (const row of readRows(sheet)) {
    const section = spec.arrays.length > 1 ? String(row.values.get('section') ?? '') : spec.arrays[0];
    const bucket = bySection.get(section);
    if (!bucket) throw new Error(`${domain}!A${row.row}: 未知 section ${section}`);
    const types = parseTypeMap(row.values.get('__fieldTypes'), `${domain}!${row.row}`);
    const sourceOrder = parseStringArray(row.values.get('__fieldOrder'), `${domain}!${row.row}`);
    const order = [...sourceOrder];
    for (const key of fieldKeys) if (!order.includes(key) && !blank(row.values.get(key))) order.push(key);
    const item: JsonRecord = {};
    for (const key of order) {
      const type = types[key] ?? (typeof row.values.get(key) as NodeType);
      const parsed = parseRecordValue(row.values.get(key), type, `${domain}!${row.row} ${key}`);
      if (parsed !== undefined) item[key] = parsed;
    }
    bucket.push(item);
    if (spec.textRoot) {
      const id = textKeyId(spec.textRoot, item);
      const entry = buildTextEntry(row, domain);
      if (id && entry !== undefined) texts[id] = entry;
    }
  }
  const data: JsonRecord = { version: sheetVersion(sheet) };
  for (const section of spec.arrays) data[section] = bySection.get(section) ?? [];
  return { data, texts };
}

function copyStarsWithoutBindings(card: CardDef): JsonRecord {
  const out: JsonRecord = {};
  for (const [star, rawTier] of Object.entries(card.stars)) {
    if (!rawTier) continue;
    const tier: JsonRecord = {};
    for (const [key, value] of Object.entries(rawTier)) if (key !== 'equip') tier[key] = value;
    out[star] = tier;
  }
  return out;
}

function copyConsumableWithoutEffects(card: CardDef): JsonRecord {
  const out: JsonRecord = {};
  for (const [key, value] of Object.entries(card.consumable)) {
    if (key !== 'anchors') {
      out[key] = value;
      continue;
    }
    const anchors: JsonRecord = {};
    for (const [star, rawAnchor] of Object.entries(value)) {
      const anchor: JsonRecord = {};
      for (const [anchorKey, anchorValue] of Object.entries(rawAnchor)) if (anchorKey !== 'effects') anchor[anchorKey] = anchorValue;
      anchors[star] = anchor;
    }
    out.anchors = anchors;
  }
  return out;
}

function skillsCardColumns(textLeafPointers: string[]): ColumnSpec[] {
  const jsonWidth = 34;
  return [
    { key: 'id', label: fieldLabel('skills', 'id'), width: 23 },
    { key: 'god', label: fieldLabel('skills', 'god'), width: 15 },
    { key: 'category', label: fieldLabel('skills', 'category'), width: 15 },
    { key: 'synergyTags', label: fieldLabel('skills', 'synergyTags'), width: 24 },
    { key: 'textKey', label: fieldLabel('skills', 'textKey'), width: 28 },
    { key: 'teaching', label: fieldLabel('skills', 'teaching'), width: 13 },
    { key: 'implementationBatch', label: fieldLabel('skills', 'implementationBatch'), width: 13 },
    { key: 'recipeOnly', label: fieldLabel('skills', 'recipeOnly'), width: 13 },
    { key: 'starsMeta', label: fieldLabel('skills', 'stars', 'starsMeta'), width: jsonWidth },
    { key: 'amplifyAxis', label: fieldLabel('skills', 'amplifyAxis'), width: jsonWidth },
    { key: 'consumableMeta', label: fieldLabel('skills', 'consumable', 'consumableMeta'), width: jsonWidth },
    { key: 'designNotes', label: fieldLabel('skills', 'designNotes'), width: 42 },
    { key: 'affixPool', label: fieldLabel('skills', 'affixPool'), width: jsonWidth },
    { key: 'evolutionTree', label: fieldLabel('skills', 'evolutionTree'), width: jsonWidth },
    { key: 'fusionPolicy', label: fieldLabel('skills', 'fusionPolicy'), width: jsonWidth },
    ...textLeafPointers.map(pointer => ({ key: `text:${pointer}`, label: textColumnLabel(pointer), width: 32 })),
    { key: '__fieldOrder', label: '__fieldOrder', hidden: true },
    { key: '__fieldTypes', label: '__fieldTypes', hidden: true },
    { key: '__textNodes', label: '__textNodes', hidden: true },
  ];
}

function relationalColumns(domain: string, keys: string[]): ColumnSpec[] {
  return keys.map(key => ({
    key,
    label: fieldLabel(domain, key),
    help: fieldHelp(domain, key),
    width: key.includes('Params') ? 30 : key.includes('Path') ? 22 : 17,
  }));
}

function fullEffectPath(parentEffectPath: string, effectIndex: number): string {
  return parentEffectPath ? `${parentEffectPath}.${effectIndex}` : String(effectIndex);
}

function paramCellValue(atom: string, paramName: string, value: unknown): Scalar | undefined {
  const contract = ATOM_CONTRACT[atom as keyof typeof ATOM_CONTRACT];
  const spec = (contract?.params as Record<string, AtomParamSpec> | undefined)?.[paramName];
  const types = spec ? (Array.isArray(spec.type) ? spec.type : [spec.type]) : [];
  return types.includes('record') ? JSON.stringify(value) : encodeCell(value);
}

interface SkillRelationRows {
  bindings: Array<Record<string, Scalar | undefined>>;
  effects: Array<Record<string, Scalar | undefined>>;
  params: Array<Record<string, Scalar | undefined>>;
}

function emitEffects(
  rows: SkillRelationRows,
  identity: { cardId: string; star: number; mode: string; bindingIndex: number },
  effects: EffectDef[],
  parentEffectPath = '',
): void {
  effects.forEach((effect, effectIndex) => {
    const params = effect.params as JsonRecord | undefined;
    rows.effects.push({
      ...identity,
      effectIndex,
      parentEffectPath: parentEffectPath || undefined,
      atom: effect.atom,
      __hasParams: params !== undefined,
      __paramOrder: JSON.stringify(params ? Object.keys(params) : []),
    });
    if (params) for (const [paramName, value] of Object.entries(params)) {
      if (paramName === 'effects') continue;
      rows.params.push({
        ...identity,
        effectIndex,
        parentEffectPath: parentEffectPath || undefined,
        paramName,
        paramLabel: labelWithKey('atomParam', `${effect.atom}.${paramName}`, paramName),
        value: paramCellValue(effect.atom, paramName, value),
        __atom: effect.atom,
      });
    }
    const nested = params?.effects;
    if (Array.isArray(nested)) {
      emitEffects(rows, identity, nested as EffectDef[], fullEffectPath(parentEffectPath, effectIndex));
    }
  });
}

function skillRelationRows(skills: { cards: CardDef[] }): SkillRelationRows {
  const rows: SkillRelationRows = { bindings: [], effects: [], params: [] };
  for (const card of skills.cards) {
    for (const [star, rawTier] of Object.entries(card.stars)) {
      if (!rawTier) continue;
      rawTier.equip.forEach((binding, bindingIndex) => {
        const identity = { cardId: card.id, star: Number(star), mode: 'equip', bindingIndex };
        rows.bindings.push({
          ...identity,
          trigger: binding.trigger,
          triggerParams: binding.triggerParams ? JSON.stringify(binding.triggerParams) : undefined,
        });
        emitEffects(rows, identity, binding.effects);
      });
    }
    for (const [star, anchor] of Object.entries(card.consumable.anchors)) {
      const identity = { cardId: card.id, star: Number(star), mode: 'consume', bindingIndex: 0 };
      rows.bindings.push({ ...identity, trigger: undefined, triggerParams: undefined });
      emitEffects(rows, identity, anchor.effects);
    }
  }
  return rows;
}

export function writeSkillsSheets(
  workbook: ExcelJS.Workbook,
  skillsValue: unknown,
  cardsTextsValue: unknown,
): void {
  if (!isRecord(skillsValue) || !Array.isArray(skillsValue.cards) || typeof skillsValue.version !== 'string') {
    throw new Error('skills 必须包含 version 与 cards[]');
  }
  const cards = skillsValue.cards as CardDef[];
  const cardTexts = isRecord(cardsTextsValue) ? cardsTextsValue : {};
  const textNodes = cards.map(card => flattenNodes(
    typeof card.textKey === 'string' && card.textKey.startsWith('cards.') ? cardTexts[card.textKey.slice(6)] ?? {} : {},
  ));
  const textLeafPointers = unionInEncounterOrder(textNodes.map(nodes => nodes.filter(node => !['object', 'array'].includes(node.type)).map(node => node.pointer)));
  const cardRows = cards.map((card, index) => {
    const raw = card as unknown as JsonRecord;
    const row: Record<string, Scalar | undefined> = {
      id: card.id,
      god: card.god,
      category: card.category,
      synergyTags: JSON.stringify(card.synergyTags),
      textKey: card.textKey,
      teaching: card.teaching,
      implementationBatch: card.implementationBatch,
      recipeOnly: card.recipeOnly,
      starsMeta: JSON.stringify(copyStarsWithoutBindings(card)),
      amplifyAxis: JSON.stringify(card.amplifyAxis),
      consumableMeta: JSON.stringify(copyConsumableWithoutEffects(card)),
      designNotes: card.designNotes,
      affixPool: card.affixPool ? JSON.stringify(card.affixPool) : undefined,
      evolutionTree: card.evolutionTree ? JSON.stringify(card.evolutionTree) : undefined,
      fusionPolicy: card.fusionPolicy ? JSON.stringify(card.fusionPolicy) : undefined,
      __fieldOrder: JSON.stringify(Object.keys(raw)),
      __fieldTypes: JSON.stringify(Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, recordValueType(value)]))),
      __textNodes: JSON.stringify(textNodes[index].map(node => ({ pointer: node.pointer, type: node.type }))),
    };
    for (const node of textNodes[index]) if (node.type !== 'object' && node.type !== 'array') row[`text:${node.pointer}`] = node.value;
    return row;
  });
  writeTableSheet(
    workbook, 'skills.cards', '一行一卡；stars/consumable 的效果在关联 sheet，卡牌文案列写回 texts.cards。',
    skillsCardColumns(textLeafPointers), cardRows, skillsValue.version,
  );

  const relations = skillRelationRows({ cards });
  writeTableSheet(
    workbook, 'skills.bindings', 'equip 星级为 3/5/6；consume 档位为 1/3/6。用 cardId/star/mode/bindingIndex 关联。',
    relationalColumns('skills', ['cardId', 'star', 'mode', 'bindingIndex', 'trigger', 'triggerParams']),
    relations.bindings,
  );
  writeTableSheet(
    workbook, 'skills.effects', 'parentEffectPath 为空表示顶层；非空路径表示父效果 params.effects 内的递归效果。',
    [
      ...relationalColumns('skills', ['cardId', 'star', 'mode', 'bindingIndex', 'effectIndex', 'parentEffectPath', 'atom']),
      { key: '__hasParams', label: '__hasParams', hidden: true },
      { key: '__paramOrder', label: '__paramOrder', hidden: true },
    ],
    relations.effects,
  );
  const paramSheet = writeTableSheet(
    workbook, 'skills.effectParams', '参数按 ATOM_CONTRACT 类型读写；留空即删除该键并使用契约默认值。',
    [
      ...relationalColumns('skills', ['cardId', 'star', 'mode', 'bindingIndex', 'effectIndex', 'parentEffectPath', 'paramName']),
      { key: 'paramLabel', label: fieldLabel('skills', 'label', 'paramLabel'), width: 23 },
      { key: 'value', label: fieldLabel('skills', 'value'), width: 28 },
      { key: '__atom', label: '__atom', hidden: true },
    ],
    relations.params,
  );
  const paramNameColumn = technicalColumns(paramSheet).get('paramName');
  if (paramNameColumn) relations.params.forEach((row, index) => {
    const atom = String(row.__atom ?? '');
    const paramName = String(row.paramName ?? '');
    const info = describeLabel('atomParam', `${atom}.${paramName}`);
    addHeaderNote(paramSheet.getCell(DATA_START_ROW + index, paramNameColumn), info.help);
  });
}

function requiredString(value: unknown, location: string): string {
  if (blank(value)) throw new Error(`${location}: 不能为空`);
  return String(value);
}

function requiredIndex(value: unknown, location: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${location}: 必须是非负整数`);
  return parsed;
}

function relationKey(cardId: string, star: number, mode: string, bindingIndex: number): string {
  return JSON.stringify([cardId, star, mode, bindingIndex]);
}

function effectStateKey(bindingKey: string, path: string): string {
  return `${bindingKey}\n${path}`;
}

interface EffectState {
  effect: JsonRecord;
  atom: string;
  children: EffectDef[];
  hasParams: boolean;
  paramOrder: string[];
  paramValues: Map<string, unknown>;
}

interface ImportedRelations {
  equip: Map<string, BindingDef[]>;
  consume: Map<string, EffectDef[]>;
}

function parseAtomParamValue(spec: AtomParamSpec | undefined, value: unknown, location: string): unknown {
  if (blank(value)) return undefined;
  if (!spec) return value;
  const types = Array.isArray(spec.type) ? [...spec.type] : [spec.type];
  if (types.includes('record')) {
    const parsed = parseJson(value, location);
    if (!isRecord(parsed)) throw new Error(`${location}: record 参数必须是 JSON 对象`);
    return parsed;
  }
  if (types.includes('boolean')) return parseScalar(value, 'boolean', location);
  if (types.includes('number') || types.includes('integer')) {
    if (typeof value === 'number') return value;
    const normalized = String(value).trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
    if (types.includes('string') || types.includes('enum')) return normalized;
    throw new Error(`${location}: 必须是数值`);
  }
  if (types.includes('string') || types.includes('enum')) return String(value);
  if (types.includes('effects')) throw new Error(`${location}: effects 参数必须通过 skills.effects 表重建`);
  return value;
}

function readSkillRelations(workbook: ExcelJS.Workbook): ImportedRelations {
  const equip = new Map<string, BindingDef[]>();
  const consume = new Map<string, EffectDef[]>();
  const bindingTargets = new Map<string, EffectDef[]>();
  const bindingSheet = requireSheet(workbook, 'skills.bindings');
  for (const row of readRows(bindingSheet)) {
    const cardId = requiredString(row.values.get('cardId'), `skills.bindings!A${row.row}`);
    const star = requiredIndex(row.values.get('star'), `skills.bindings!B${row.row}`);
    const mode = requiredString(row.values.get('mode'), `skills.bindings!C${row.row}`);
    const bindingIndex = requiredIndex(row.values.get('bindingIndex'), `skills.bindings!D${row.row}`);
    const key = relationKey(cardId, star, mode, bindingIndex);
    if (bindingTargets.has(key)) throw new Error(`skills.bindings!${row.row}: 重复关联键`);
    if (mode === 'equip') {
      const groupKey = JSON.stringify([cardId, star]);
      const bindings = equip.get(groupKey) ?? [];
      if (bindingIndex !== bindings.length) throw new Error(`skills.bindings!D${row.row}: bindingIndex 必须从 0 连续递增`);
      const trigger = requiredString(row.values.get('trigger'), `skills.bindings!E${row.row}`) as BindingDef['trigger'];
      const triggerParams = parseJson(row.values.get('triggerParams'), `skills.bindings!F${row.row}`);
      const binding: BindingDef = triggerParams === undefined
        ? { trigger, effects: [] }
        : { trigger, triggerParams: triggerParams as BindingDef['triggerParams'], effects: [] };
      bindings.push(binding);
      equip.set(groupKey, bindings);
      bindingTargets.set(key, binding.effects);
    } else if (mode === 'consume') {
      if (bindingIndex !== 0) throw new Error(`skills.bindings!D${row.row}: consume 的 bindingIndex 必须为 0`);
      const effects: EffectDef[] = [];
      consume.set(JSON.stringify([cardId, star]), effects);
      bindingTargets.set(key, effects);
    } else {
      throw new Error(`skills.bindings!C${row.row}: mode 只能是 equip/consume`);
    }
  }

  const states = new Map<string, EffectState>();
  const stateOrder: EffectState[] = [];
  const effectSheet = requireSheet(workbook, 'skills.effects');
  for (const row of readRows(effectSheet)) {
    const cardId = requiredString(row.values.get('cardId'), `skills.effects!A${row.row}`);
    const star = requiredIndex(row.values.get('star'), `skills.effects!B${row.row}`);
    const mode = requiredString(row.values.get('mode'), `skills.effects!C${row.row}`);
    const bindingIndex = requiredIndex(row.values.get('bindingIndex'), `skills.effects!D${row.row}`);
    const effectIndex = requiredIndex(row.values.get('effectIndex'), `skills.effects!E${row.row}`);
    const parentPath = blank(row.values.get('parentEffectPath')) ? '' : String(row.values.get('parentEffectPath'));
    const atom = requiredString(row.values.get('atom'), `skills.effects!G${row.row}`);
    const bindingKey = relationKey(cardId, star, mode, bindingIndex);
    const rootEffects = bindingTargets.get(bindingKey);
    if (!rootEffects) throw new Error(`skills.effects!${row.row}: 找不到对应 binding`);
    let target = rootEffects;
    if (parentPath) {
      const parent = states.get(effectStateKey(bindingKey, parentPath));
      if (!parent) throw new Error(`skills.effects!F${row.row}: 父效果 ${parentPath} 尚未出现`);
      target = parent.children;
    }
    if (effectIndex !== target.length) throw new Error(`skills.effects!E${row.row}: effectIndex 必须在同一父路径下连续递增`);
    const effect: JsonRecord = { atom };
    target.push(effect as EffectDef);
    const hasParams = parseScalar(row.values.get('__hasParams'), 'boolean', `skills.effects!${row.row}`) === true;
    const rawOrder = parseJson(row.values.get('__paramOrder'), `skills.effects!${row.row}`);
    const paramOrder = Array.isArray(rawOrder) && rawOrder.every(item => typeof item === 'string') ? rawOrder : [];
    const path = fullEffectPath(parentPath, effectIndex);
    const state: EffectState = { effect, atom, children: [], hasParams, paramOrder, paramValues: new Map() };
    states.set(effectStateKey(bindingKey, path), state);
    stateOrder.push(state);
  }

  const paramsSheet = requireSheet(workbook, 'skills.effectParams');
  for (const row of readRows(paramsSheet)) {
    const cardId = requiredString(row.values.get('cardId'), `skills.effectParams!A${row.row}`);
    const star = requiredIndex(row.values.get('star'), `skills.effectParams!B${row.row}`);
    const mode = requiredString(row.values.get('mode'), `skills.effectParams!C${row.row}`);
    const bindingIndex = requiredIndex(row.values.get('bindingIndex'), `skills.effectParams!D${row.row}`);
    const effectIndex = requiredIndex(row.values.get('effectIndex'), `skills.effectParams!E${row.row}`);
    const parentPath = blank(row.values.get('parentEffectPath')) ? '' : String(row.values.get('parentEffectPath'));
    const paramName = requiredString(row.values.get('paramName'), `skills.effectParams!G${row.row}`);
    const bindingKey = relationKey(cardId, star, mode, bindingIndex);
    const state = states.get(effectStateKey(bindingKey, fullEffectPath(parentPath, effectIndex)));
    if (!state) throw new Error(`skills.effectParams!${row.row}: 找不到对应 effect`);
    if (state.paramValues.has(paramName)) throw new Error(`skills.effectParams!${row.row}: 参数 ${paramName} 重复`);
    const contract = ATOM_CONTRACT[state.atom as keyof typeof ATOM_CONTRACT];
    const spec = (contract?.params as Record<string, AtomParamSpec> | undefined)?.[paramName];
    const value = parseAtomParamValue(spec, row.values.get('value'), `skills.effectParams!I${row.row}`);
    if (value !== undefined) state.paramValues.set(paramName, value);
  }

  for (const state of stateOrder) {
    const order = [...state.paramOrder];
    for (const name of state.paramValues.keys()) if (!order.includes(name)) order.push(name);
    if (state.children.length && !order.includes('effects')) order.push('effects');
    const params: JsonRecord = {};
    for (const name of order) {
      if (name === 'effects') params.effects = state.children;
      else if (state.paramValues.has(name)) params[name] = state.paramValues.get(name);
    }
    if (state.hasParams || Object.keys(params).length) state.effect.params = params;
  }
  return { equip, consume };
}

function parseCardField(key: string, value: unknown, type: NodeType | 'json' | undefined, location: string): unknown {
  if (key === 'synergyTags' || key === 'amplifyAxis' || key === 'affixPool' || key === 'evolutionTree' || key === 'fusionPolicy') {
    return parseJson(value, location);
  }
  if (type) return parseRecordValue(value, type, location);
  if (key === 'teaching' || key === 'recipeOnly') return parseScalar(value, 'boolean', location);
  if (key === 'implementationBatch') return parseScalar(value, 'number', location);
  return blank(value) ? undefined : String(value);
}

export function readSkillsSheets(workbook: ExcelJS.Workbook): ReadSkills {
  const relations = readSkillRelations(workbook);
  const sheet = requireSheet(workbook, 'skills.cards');
  const texts: Record<string, unknown> = {};
  const cards: CardDef[] = [];
  for (const row of readRows(sheet)) {
    const fieldOrder = parseStringArray(row.values.get('__fieldOrder'), `skills.cards!${row.row}`);
    const fieldTypes = parseTypeMap(row.values.get('__fieldTypes'), `skills.cards!${row.row}`);
    const id = requiredString(row.values.get('id'), `skills.cards!A${row.row}`);
    const optionalColumns = ['god', 'implementationBatch', 'recipeOnly', 'designNotes', 'affixPool', 'evolutionTree', 'fusionPolicy'];
    for (const key of optionalColumns) if (!fieldOrder.includes(key) && !blank(row.values.get(key))) fieldOrder.push(key);
    const starsMeta = parseJson(row.values.get('starsMeta'), `skills.cards!I${row.row}`);
    const consumableMeta = parseJson(row.values.get('consumableMeta'), `skills.cards!K${row.row}`);
    if (!isRecord(starsMeta) || !isRecord(consumableMeta) || !isRecord(consumableMeta.anchors)) {
      throw new Error(`skills.cards!${row.row}: starsMeta/consumableMeta 结构损坏`);
    }
    for (const [star, tier] of Object.entries(starsMeta)) {
      if (!isRecord(tier)) throw new Error(`skills.cards!${row.row}: starsMeta.${star} 必须是对象`);
      tier.equip = relations.equip.get(JSON.stringify([id, Number(star)])) ?? [];
    }
    for (const [star, anchor] of Object.entries(consumableMeta.anchors)) {
      if (!isRecord(anchor)) throw new Error(`skills.cards!${row.row}: consumableMeta.anchors.${star} 必须是对象`);
      anchor.effects = relations.consume.get(JSON.stringify([id, Number(star)])) ?? [];
    }
    const card: JsonRecord = {};
    for (const key of fieldOrder) {
      if (key === 'stars') card.stars = starsMeta;
      else if (key === 'consumable') card.consumable = consumableMeta;
      else {
        const value = parseCardField(key, row.values.get(key), fieldTypes[key], `skills.cards!${row.row} ${key}`);
        if (value !== undefined) card[key] = value;
      }
    }
    cards.push(card as unknown as CardDef);
    const textId = textKeyId('cards', card);
    const entry = buildTextEntry(row, 'skills.cards');
    if (textId && entry !== undefined) texts[textId] = entry;
  }
  return { skills: { version: sheetVersion(sheet), cards }, texts };
}

function entityTextIds(snapshot: ConfigSnapshot, root: typeof ENTITY_TEXT_ROOTS[number]): Set<string> {
  const domain = root === 'cards' ? 'skills' : root;
  const data = snapshot[domain];
  if (!isRecord(data)) return new Set();
  const entries = data[root === 'cards' ? 'cards' : root];
  if (!Array.isArray(entries)) return new Set();
  return new Set(entries.flatMap(item => {
    if (!isRecord(item)) return [];
    const id = textKeyId(root, item);
    return id ? [id] : [];
  }));
}

function globalTextsOnly(snapshot: ConfigSnapshot): JsonRecord {
  const texts = snapshot.texts;
  if (!isRecord(texts)) throw new Error('texts 根必须是对象');
  const out: JsonRecord = {};
  for (const [key, value] of Object.entries(texts)) {
    if (!(ENTITY_TEXT_ROOTS as readonly string[]).includes(key)) {
      out[key] = value;
      continue;
    }
    const root = key as typeof ENTITY_TEXT_ROOTS[number];
    const ids = entityTextIds(snapshot, root);
    const source = isRecord(value) ? value : {};
    out[key] = Object.fromEntries(Object.entries(source).filter(([id]) => !ids.has(id)));
  }
  return out;
}

function writeMetaSheet(workbook: ExcelJS.Workbook, snapshot: ConfigSnapshot): void {
  const texts = snapshot.texts;
  if (!isRecord(texts)) throw new Error('texts 根必须是对象');
  const sheet = workbook.addWorksheet('_meta');
  sheet.state = 'veryHidden';
  sheet.getCell('A1').value = 'formatVersion';
  sheet.getCell('B1').value = CONFIG_XLSX_FORMAT_VERSION;
  sheet.getCell('A2').value = 'textsEntityOrder';
  sheet.getCell('B2').value = JSON.stringify(Object.fromEntries(
    ENTITY_TEXT_ROOTS.map(root => [root, Object.keys(isRecord(texts[root]) ? texts[root] as JsonRecord : {})]),
  ));
}

function readMetaSheet(workbook: ExcelJS.Workbook): Record<string, unknown> {
  const sheet = requireSheet(workbook, '_meta');
  const meta: Record<string, unknown> = {};
  for (let row = 1; row <= sheet.rowCount; row++) {
    const key = cellValue(sheet.getCell(row, 1));
    if (typeof key === 'string' && key) meta[key] = cellValue(sheet.getCell(row, 2));
  }
  if (String(meta.formatVersion ?? '') !== CONFIG_XLSX_FORMAT_VERSION) {
    throw new Error(`不支持的工作簿格式版本：${String(meta.formatVersion ?? '缺失')}`);
  }
  return meta;
}

function createWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ProjectVL config-xlsx';
  workbook.lastModifiedBy = 'ProjectVL config-xlsx';
  workbook.created = new Date('2000-01-01T00:00:00.000Z');
  workbook.modified = new Date('2000-01-01T00:00:00.000Z');
  workbook.calcProperties.fullCalcOnLoad = false;
  return workbook;
}

const VISIBLE_DOMAIN_ORDER = [
  'combat', 'waves', 'enemies', 'difficulty', 'skills', 'gods', 'relics',
  'evolutionRecipes', 'waveRewards', 'progression', 'economy', 'bounty', 'input', 'tuner',
] as const satisfies readonly WritableDomain[];

export async function writeConfigWorkbook(snapshot: ConfigSnapshot, outputPath: string): Promise<void> {
  const workbook = createWorkbook();
  const texts = snapshot.texts;
  if (!isRecord(texts)) throw new Error('texts 根必须是对象');
  for (const domain of VISIBLE_DOMAIN_ORDER) {
    if (domain === 'skills') {
      writeSkillsSheets(workbook, snapshot.skills, texts.cards);
      continue;
    }
    const recordSpec = RECORD_DOMAIN_SPECS[domain];
    if (recordSpec) writeRecordDomain(workbook, domain, snapshot[domain], texts, recordSpec);
    else if ((LONG_DOMAINS as readonly string[]).includes(domain)) writeLongDomain(workbook, domain, snapshot[domain]);
    else throw new Error(`没有 ${domain} 的工作簿表示器`);
  }
  writeLongDomain(workbook, 'texts', globalTextsOnly(snapshot), 'texts.global');
  writeMetaSheet(workbook, snapshot);
  await mkdir(dirname(outputPath), { recursive: true });
  await workbook.xlsx.writeFile(outputPath);
}

function mergeEntityTextMap(
  globalValue: unknown,
  imported: Record<string, unknown>,
  order: string[],
): JsonRecord {
  const globalMap = isRecord(globalValue) ? globalValue : {};
  const out: JsonRecord = {};
  for (const id of order) {
    if (id in imported) out[id] = imported[id];
    else if (id in globalMap) out[id] = globalMap[id];
  }
  for (const [id, value] of Object.entries(imported)) if (!(id in out)) out[id] = value;
  for (const [id, value] of Object.entries(globalMap)) if (!(id in out)) out[id] = value;
  return out;
}

function readEntityOrders(meta: Record<string, unknown>): Record<typeof ENTITY_TEXT_ROOTS[number], string[]> {
  const parsed = parseJson(meta.textsEntityOrder, '_meta!B2');
  if (!isRecord(parsed)) throw new Error('_meta!B2: textsEntityOrder 损坏');
  return {
    cards: Array.isArray(parsed.cards) ? parsed.cards.map(String) : [],
    gods: Array.isArray(parsed.gods) ? parsed.gods.map(String) : [],
    relics: Array.isArray(parsed.relics) ? parsed.relics.map(String) : [],
  };
}

export async function readConfigWorkbook(inputPath: string): Promise<ConfigSnapshot> {
  const workbook = createWorkbook();
  await workbook.xlsx.readFile(inputPath);
  const meta = readMetaSheet(workbook);
  const snapshot = {} as ConfigSnapshot;
  for (const domain of LONG_DOMAINS) snapshot[domain] = readLongDomain(workbook, domain);
  const importedTexts: Record<typeof ENTITY_TEXT_ROOTS[number], Record<string, unknown>> = {
    cards: {}, gods: {}, relics: {},
  };
  const skills = readSkillsSheets(workbook);
  snapshot.skills = skills.skills;
  importedTexts.cards = skills.texts;
  for (const [domain, spec] of Object.entries(RECORD_DOMAIN_SPECS) as Array<[WritableDomain, RecordDomainSpec]>) {
    const result = readRecordDomain(workbook, domain, spec);
    snapshot[domain] = result.data;
    if (spec.textRoot) importedTexts[spec.textRoot] = result.texts;
  }
  const texts = readLongDomain(workbook, 'texts.global');
  if (!isRecord(texts)) throw new Error('texts.global 必须重建为对象');
  const orders = readEntityOrders(meta);
  for (const root of ENTITY_TEXT_ROOTS) texts[root] = mergeEntityTextMap(texts[root], importedTexts[root], orders[root]);
  snapshot.texts = texts;
  return snapshot;
}

export async function loadConfigSnapshot(root = process.cwd()): Promise<ConfigSnapshot> {
  const snapshot = {} as ConfigSnapshot;
  for (const [domain, relativePath] of Object.entries(WRITABLE_DOMAINS) as Array<[WritableDomain, string]>) {
    const source = await readFile(resolve(root, relativePath), 'utf8');
    snapshot[domain] = JSON.parse(source);
  }
  return snapshot;
}

function effectiveIssuePath(path: string, message: string): string {
  const embedded = /(\$\.[A-Za-z0-9_$.[\]-]+)/.exec(message)?.[1];
  return path === '$' || !embedded ? path : embedded;
}

function collectReportIssues(
  domain: WritableDomain,
  report: CandidateReport,
  variant?: string,
): LocatedConfigIssue[] {
  const own = report.issues.filter(issue => issue.level === 'error').map(issue => ({
    domain,
    variant,
    path: effectiveIssuePath(issue.path, issue.message),
    message: issue.message,
  }));
  const nested = report.variants.flatMap(entry => collectReportIssues(domain, {
    ...entry.report,
    variants: [],
  }, entry.variant));
  return [...own, ...nested];
}

export function validateConfigSnapshot(snapshot: ConfigSnapshot): {
  reports: Record<WritableDomain, CandidateReport>;
  issues: LocatedConfigIssue[];
} {
  const reports = {} as Record<WritableDomain, CandidateReport>;
  const issues: LocatedConfigIssue[] = [];
  for (const domain of Object.keys(WRITABLE_DOMAINS) as WritableDomain[]) {
    const report = validateCandidate(domain, snapshot[domain]);
    reports[domain] = report;
    issues.push(...collectReportIssues(domain, report));
  }
  return { reports, issues };
}

async function writeSnapshot(snapshot: ConfigSnapshot, root: string): Promise<void> {
  const entries = (Object.entries(WRITABLE_DOMAINS) as Array<[WritableDomain, string]>).map(([domain, relativePath], index) => {
    const target = resolve(root, relativePath);
    return {
      domain,
      target,
      temp: `${target}.config-xlsx-${process.pid}-${index}.tmp`,
      content: stableJson(snapshot[domain]),
    };
  });
  const originals = await Promise.all(entries.map(async entry => ({
    target: entry.target,
    content: await readFile(entry.target, 'utf8'),
  })));
  try {
    await Promise.all(entries.map(async entry => {
      await mkdir(dirname(entry.target), { recursive: true });
      await writeFile(entry.temp, entry.content, 'utf8');
    }));
    try {
      for (const entry of entries) await writeFile(entry.target, entry.content, 'utf8');
    } catch (error) {
      await Promise.all(originals.map(original => writeFile(original.target, original.content, 'utf8')));
      throw error;
    }
  } finally {
    await Promise.all(entries.map(entry => unlink(entry.temp).catch(() => undefined)));
  }
}

export async function importConfigWorkbook(
  inputPath: string,
  options: { root?: string; write?: boolean } = {},
): Promise<ConfigXlsxImportResult> {
  const snapshot = await readConfigWorkbook(inputPath);
  const { reports, issues } = validateConfigSnapshot(snapshot);
  if (issues.length) return { ok: false, written: false, reports, issues, snapshot };
  const shouldWrite = options.write ?? true;
  if (shouldWrite) await writeSnapshot(snapshot, options.root ?? process.cwd());
  return { ok: true, written: shouldWrite, reports, issues: [], snapshot };
}

export async function exportCurrentConfigWorkbook(
  outputPath = resolve(process.cwd(), CONFIG_XLSX_PATH),
): Promise<string> {
  const snapshot = await loadConfigSnapshot();
  await writeConfigWorkbook(snapshot, outputPath);
  return outputPath;
}

export function formatImportIssue(issue: LocatedConfigIssue): string {
  const variant = issue.variant ? ` [variant=${issue.variant}]` : '';
  return `${issue.domain}${variant} ${issue.path}\n  ${issue.message}`;
}
