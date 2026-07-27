import type { EditorDomain } from './contracts';

type DataMap = Record<EditorDomain, unknown>;

export interface ReferenceCatalog {
  gods: string[];
  cards: string[];
  textKeys: string[];
  tags: string[];
}

function records(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>> : [];
}

function collectReferencedTextKeys(value: unknown, output: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach(child => collectReferencedTextKeys(child, output));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((key === 'textKey' || key === 'labelKey') && typeof child === 'string') output.add(child);
    collectReferencedTextKeys(child, output);
  }
}

export function buildReferenceCatalog(data: DataMap): ReferenceCatalog {
  const gods = arrayRecords(records(data.gods).gods).map(item => item.id).filter((id): id is string => typeof id === 'string');
  const cards = arrayRecords(records(data.skills).cards).map(item => item.id).filter((id): id is string => typeof id === 'string');
  const tags = new Set<string>();
  for (const card of arrayRecords(records(data.skills).cards)) {
    if (Array.isArray(card.synergyTags)) for (const tag of card.synergyTags) if (typeof tag === 'string') tags.add(tag);
  }
  for (const relic of arrayRecords(records(data.relics).relics)) {
    if (Array.isArray(relic.targetTags)) for (const tag of relic.targetTags) if (typeof tag === 'string') tags.add(tag);
  }
  const textKeys = new Set<string>();
  for (const value of Object.values(data)) collectReferencedTextKeys(value, textKeys);
  return {
    gods: [...new Set(gods)].sort(),
    cards: [...new Set(cards)].sort(),
    textKeys: [...textKeys].sort(),
    tags: [...tags].sort(),
  };
}

/** 字段名指向的引用域；标签层据此决定下拉项显示中文名还是原样 id。 */
export type ReferenceKind = 'god' | 'textKey' | 'tag' | 'card';

export function referenceKind(key: string): ReferenceKind | undefined {
  if (key === 'god' || key === 'godId') return 'god';
  if (key === 'textKey' || key === 'labelKey') return 'textKey';
  if (key === 'targetTags' || key === 'synergyTags') return 'tag';
  if (
    key === 'cardId' || key === 'outputCardId' || key === 'anchorCardIds' ||
    key === 'variableCardIds' || /CardIds?$/.test(key)
  ) return 'card';
  return undefined;
}

export function referenceOptions(key: string, catalog: ReferenceCatalog): readonly string[] | undefined {
  switch (referenceKind(key)) {
    case 'god': return catalog.gods;
    case 'textKey': return catalog.textKeys;
    case 'tag': return catalog.tags;
    case 'card': return catalog.cards;
    default: return undefined;
  }
}
