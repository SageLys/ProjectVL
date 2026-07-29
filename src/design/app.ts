import type { EvolutionRecipesConfig, GodsConfig, RelicsConfig, SkillsConfig } from '../config/types';
import { ConfigApi } from '../editor/api';
import { EDITOR_DOMAINS, type EditorDomain, type ValidationReportDto } from '../editor/contracts';
import { deepClone, el } from '../editor/dom';
import { buildReferenceCatalog, type ReferenceCatalog } from '../editor/references';
import { renderAffixCoverageView } from './crossViews/affixCoverage';
import { renderAtomUsageView } from './crossViews/atomUsage';
import { renderCopyCompletenessView } from './crossViews/copyCompleteness';
import { renderHomogeneityView } from './crossViews/homogeneity';
import { renderPowerGridView } from './crossViews/powerGrid';
import { renderCardView, renderGodView } from './cardView';
import { renderContextPanel } from './contextPanel';
import type { DescribeContext } from './describe';
import type { CrossViewId, DesignSelection, NavFilters } from './navTree';
import { renderNavTree } from './navTree';
import { renderRelicView } from './relicView';

type ContentDomain = 'skills' | 'gods' | 'relics' | 'evolutionRecipes' | 'texts';
type PrintScope = 'entity' | 'god' | 'all' | 'cross';

interface DesignData {
  skills: SkillsConfig;
  gods: GodsConfig;
  relics: RelicsConfig;
  evolutionRecipes: EvolutionRecipesConfig;
  texts: Record<string, unknown>;
}

const CONTENT_DOMAINS: readonly ContentDomain[] = ['skills', 'gods', 'relics', 'evolutionRecipes', 'texts'];

export class DesignWorkbenchApp {
  private readonly api = new ConfigApi();
  private data?: DesignData;
  private originals?: DesignData;
  private report?: ValidationReportDto;
  private references?: ReferenceCatalog;
  private selection: DesignSelection = { kind: 'card', id: '' };
  private crossView?: CrossViewId;
  private printScope: PrintScope = 'entity';
  private readonly filters: NavFilters = { query: '', tag: '', category: '', atom: '', copyDebt: false, designNotes: false };
  private nav?: HTMLElement;
  private main?: HTMLElement;
  private context?: HTMLElement;
  private printRoot?: HTMLElement;
  private status?: HTMLElement;

  constructor(private readonly root: HTMLElement) {}

  async start(): Promise<void> {
    this.renderLoading();
    try {
      const domains = await this.api.domains();
      const loaded = await Promise.all(CONTENT_DOMAINS.map(async domain => [domain, await this.api.load(domains[domain])] as const));
      this.data = Object.fromEntries(loaded) as unknown as DesignData;
      this.originals = deepClone(this.data);
      this.report = await this.api.validateCurrent();
      const catalogData = Object.fromEntries(EDITOR_DOMAINS.map(domain => [domain, (this.data as unknown as Partial<Record<EditorDomain, unknown>>)[domain]])) as Record<EditorDomain, unknown>;
      this.references = buildReferenceCatalog(catalogData);
      this.selection = { kind: 'card', id: this.data.skills.cards[0]?.id ?? '' };
      this.renderShell();
      this.render();
      window.addEventListener('beforeprint', () => this.preparePrint());
    } catch (error) {
      this.renderFatal(error);
    }
  }

  private renderLoading(): void { this.root.replaceChildren(el('main', 'boot-state', '正在从配置管线加载内容工作台…')); }
  private renderFatal(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const main = el('main', 'boot-state boot-state--error'); main.append(el('h1', '', '内容工作台启动失败'), el('p', '', message), el('p', '', '请确认通过 npm run dev 打开 design.html；静态文件模式没有 dev-only 配置端点。')); this.root.replaceChildren(main);
  }

  private renderShell(): void {
    this.root.replaceChildren();
    const header = el('header', 'workbench-header');
    const brand = el('div'); brand.append(el('span', 'eyebrow', 'PROJECTVL / DEV-ONLY'), el('h1', '', '内容设计工作台'));
    const tools = el('div', 'header-tools');
    const label = el('label', 'print-control'); label.append(el('span', '', '打印范围'));
    const select = el('select');
    for (const [value, text] of [['entity', '当前实体'], ['god', '当前神整章'], ['all', '全部内容'], ['cross', '当前横切视图']] as const) { const option = el('option', '', text); option.value = value; select.append(option); }
    select.addEventListener('change', () => { this.printScope = select.value as PrintScope; this.preparePrint(); });
    const print = el('button', 'button button--primary', '打印当前范围'); print.type = 'button'; print.addEventListener('click', () => { this.preparePrint(); window.print(); });
    this.status = el('span', 'status-badge status-badge--ok', '只读 · 配置管线已连接');
    label.append(select); tools.append(label, print, this.status); header.append(brand, tools);
    const layout = el('div', 'workbench-layout'); this.nav = el('aside', 'workbench-nav'); this.main = el('main', 'workbench-main'); this.context = el('aside', 'workbench-context'); layout.append(this.nav, this.main, this.context);
    this.printRoot = el('div', 'print-batch');
    this.root.append(header, layout, this.printRoot);
  }

  private ctx(): DescribeContext {
    if (!this.data) throw new Error('数据尚未加载');
    return { texts: this.data.texts, gods: this.data.gods, recipes: this.data.evolutionRecipes };
  }

  private render(): void {
    if (!this.data || !this.nav || !this.main || !this.context || !this.references) return;
    renderNavTree(this.nav, {
      cards: this.data.skills.cards, gods: this.data.gods, relics: this.data.relics.relics, ctx: this.ctx(), filters: this.filters,
      selection: this.selection, crossView: this.crossView,
      onSelect: selection => { this.selection = selection; this.crossView = undefined; this.render(); },
      onCrossView: view => { this.crossView = view; this.render(); },
    });
    if (this.crossView) this.renderCrossView(this.crossView);
    else this.renderEntity(this.main, this.selection);
    if (this.crossView) {
      this.context.replaceChildren(el('section', 'context-section'), el('p', 'empty-state', '横切视图的行与单元格可点击回到实体；右栏在实体阅读态显示校验、反向引用和文案槽位。'));
    } else {
      renderContextPanel(this.context, {
        selection: this.selection, cards: this.data.skills.cards, gods: this.data.gods.gods, relics: this.data.relics.relics,
        recipes: this.data.evolutionRecipes, texts: this.data.texts, report: this.report, references: this.references,
        locate: (domain, path) => this.locate(domain, path),
      });
    }
  }

  private openCard(id: string, path?: string): void {
    this.selection = { kind: 'card', id }; this.crossView = undefined; this.render();
    if (path) requestAnimationFrame(() => this.locate('texts', path));
  }

  private renderCrossView(view: CrossViewId): void {
    if (!this.data || !this.main) return;
    switch (view) {
      case 'homogeneity': renderHomogeneityView(this.main, this.data.skills.cards, this.ctx(), id => this.openCard(id)); break;
      case 'copy': renderCopyCompletenessView(this.main, this.data.skills.cards, this.data.texts, (id, path) => this.openCard(id, path)); break;
      case 'power': renderPowerGridView(this.main, this.data.skills.cards, this.ctx(), this.currentGodId(), id => this.openCard(id)); break;
      case 'atoms': renderAtomUsageView(this.main, this.data.skills.cards, id => this.openCard(id)); break;
      case 'affixes': renderAffixCoverageView(this.main, this.data.skills.cards, this.data.relics.relics); break;
    }
  }

  private renderEntity(container: HTMLElement, selection: DesignSelection): void {
    if (!this.data) return;
    if (selection.kind === 'card') {
      const index = this.data.skills.cards.findIndex(card => card.id === selection.id); const card = this.data.skills.cards[index];
      if (card) renderCardView(container, card, this.ctx(), index); else container.replaceChildren(el('p', 'empty-state', '卡牌不存在'));
    } else if (selection.kind === 'relic') {
      const index = this.data.relics.relics.findIndex(relic => relic.id === selection.id); const relic = this.data.relics.relics[index];
      if (relic) renderRelicView(container, relic, this.ctx(), index); else container.replaceChildren(el('p', 'empty-state', '遗物不存在'));
    } else {
      const god = this.data.gods.gods.find(item => item.id === selection.id);
      if (god) renderGodView(container, god, this.data.skills.cards, this.ctx()); else container.replaceChildren(el('p', 'empty-state', '神祇不存在'));
    }
  }

  private currentGodId(): string {
    if (!this.data) return '';
    if (this.selection.kind === 'god') return this.selection.id;
    if (this.selection.kind === 'card') return this.data.skills.cards.find(card => card.id === this.selection.id)?.god ?? this.data.gods.gods[0]?.id ?? '';
    return this.data.relics.relics.find(relic => relic.id === this.selection.id)?.god ?? this.data.gods.gods[0]?.id ?? '';
  }

  private locate(_domain: EditorDomain, path: string): void {
    if (!this.main) return;
    const exact = [...this.main.querySelectorAll<HTMLElement>('[data-config-path]')].find(node => node.dataset.configPath === path);
    const prefix = exact ?? [...this.main.querySelectorAll<HTMLElement>('[data-config-path]')].filter(node => path.startsWith(node.dataset.configPath ?? '')).sort((a, b) => (b.dataset.configPath?.length ?? 0) - (a.dataset.configPath?.length ?? 0))[0];
    const target = prefix ?? this.main.querySelector<HTMLElement>('[data-entity-id]');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' }); target?.classList.add('is-located'); window.setTimeout(() => target?.classList.remove('is-located'), 1800);
  }

  private appendGodChapter(target: HTMLElement, godId: string): void {
    if (!this.data) return;
    const god = this.data.gods.gods.find(item => item.id === godId); if (!god) return;
    const godContainer = el('section', 'print-chapter'); renderGodView(godContainer, god, this.data.skills.cards, this.ctx()); target.append(godContainer);
    for (const id of [...god.anchorCardIds, ...god.variableCardIds]) { const card = this.data.skills.cards.find(item => item.id === id); if (card) { const wrap = el('section', 'print-entity'); renderCardView(wrap, card, this.ctx()); target.append(wrap); } }
    for (const relic of this.data.relics.relics.filter(item => item.god === godId)) { const wrap = el('section', 'print-entity'); renderRelicView(wrap, relic, this.ctx()); target.append(wrap); }
  }

  private preparePrint(): void {
    if (!this.printRoot || !this.main || !this.data) return;
    this.printRoot.replaceChildren();
    if (this.printScope === 'cross') {
      if (this.crossView) this.printRoot.append(this.main.cloneNode(true));
      else this.printRoot.append(el('p', 'empty-state', '当前不是横切视图，请先选择左栏顶部的横切视图。'));
      return;
    }
    if (this.printScope === 'entity') { const wrap = el('section', 'print-entity'); this.renderEntity(wrap, this.selection); this.printRoot.append(wrap); return; }
    if (this.printScope === 'god') { this.appendGodChapter(this.printRoot, this.currentGodId()); return; }
    for (const god of this.data.gods.gods) this.appendGodChapter(this.printRoot, god.id);
    const fusionTitle = el('h1', 'print-section-title', '融合卡'); this.printRoot.append(fusionTitle);
    for (const card of this.data.skills.cards.filter(item => item.recipeOnly)) { const wrap = el('section', 'print-entity'); renderCardView(wrap, card, this.ctx()); this.printRoot.append(wrap); }
    const relicTitle = el('h1', 'print-section-title', '通用遗物'); this.printRoot.append(relicTitle);
    for (const relic of this.data.relics.relics.filter(item => !item.god)) { const wrap = el('section', 'print-entity'); renderRelicView(wrap, relic, this.ctx()); this.printRoot.append(wrap); }
  }

  /** 后续阶段复用同一内存候选与原始快照，不允许视图自行序列化落盘。 */
  protected contentState(): { data?: DesignData; originals?: DesignData } { return { data: this.data, originals: this.originals }; }
}
