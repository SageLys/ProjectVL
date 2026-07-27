import { el } from './dom';
import { labelWithKey } from './labels';
import type { ReferenceCatalog } from './references';
import { renderTreeEditor } from './treeEditor';

interface TextsEditorOptions {
  references: ReferenceCatalog;
  onChange: () => void;
}

const ENTITY_SECTIONS = new Set(['cards', 'gods', 'relics']);

/** 文案总页只管理非实体段；实体段在卡牌、神祇、遗物表单中就地编辑。 */
export function renderTextsEditor(
  container: HTMLElement,
  texts: Record<string, unknown>,
  options: TextsEditorOptions,
): void {
  container.replaceChildren();
  container.append(el(
    'p',
    'callout',
    'cards / gods / relics 已并入对应实体模块；此处只保留全局 UI 与非实体文案，避免双入口冲突。',
  ));
  const sections = el('div', 'global-copy-sections');
  for (const [key, value] of Object.entries(texts)) {
    if (ENTITY_SECTIONS.has(key)) continue;
    const section = el('details', 'major-section');
    section.open = true;
    section.dataset.configPath = `$.texts.${key}`;
    section.append(el('summary', '', labelWithKey('domainField', `texts.${key}`, key)));
    const body = el('div', 'major-section__body');
    const holder: Record<string, unknown> = { [key]: value };
    renderTreeEditor(body, holder, {
      path: '$.texts',
      references: options.references,
      onChange: () => {
        if (key in holder) texts[key] = holder[key];
        else delete texts[key];
        options.onChange();
      },
    });
    section.append(body);
    sections.append(section);
  }
  container.append(sections);
}
