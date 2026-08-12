import type { EvolutionRecipesConfig, GodsConfig, SkillsConfig } from '../config/types';
import { ConfigApi } from '../editor/api';
import { collectIssues, EDITOR_DOMAINS, reportHasErrors, type EditorDomain, type ValidationReportDto } from '../editor/contracts';
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
import type { TextEditingOptions } from './textEditing';
import { DesignTextSaveCoordinator } from './textSave';
import { DesignContentSaveCoordinator } from './contentSave';
import type { MechanismEditingOptions, EditableContentDomain } from './mechanismEditor';
import type { SaveCandidate } from '../editor/saveFlow';

type ContentDomain = 'skills' | 'gods' | 'evolutionRecipes' | 'texts';
type PrintScope = 'entity' | 'god' | 'all' | 'cross';

interface DesignData {
  skills: SkillsConfig;
  gods: GodsConfig;
  evolutionRecipes: EvolutionRecipesConfig;
  texts: Record<string, unknown>;
}

const CONTENT_DOMAINS: readonly ContentDomain[] = ['skills', 'gods', 'evolutionRecipes', 'texts'];

export class DesignWorkbenchApp {
  private readonly api = new ConfigApi();
  private readonly textSaver = new DesignTextSaveCoordinator(this.api);
  private readonly contentSaver = new DesignContentSaveCoordinator(this.api);
  private data?: DesignData;
  private originals?: DesignData;
  private report?: ValidationReportDto;
  private textsReport?: ValidationReportDto;
  private readonly entityReports: Partial<Record<ContentDomain, ValidationReportDto>> = {};
  private references?: ReferenceCatalog;
  private selection: DesignSelection = { kind: 'card', id: '' };
  private crossView?: CrossViewId;
  private printScope: PrintScope = 'entity';
  private editingTextPath?: string;
  private editingMechanismPath?: string;
  private textsDirty = false;
  private readonly entityDirtyDomains = new Set<ContentDomain>();
  private validatingTexts = false;
  private readonly validatingEntityDomains = new Set<ContentDomain>();
  private readonly entityValidationSequences = new Map<ContentDomain, number>();
  private saving = false;
  private validationSequence = 0;
  private saveMessage = '';
  private readonly filters: NavFilters = { query: '', tag: '', category: '', atom: '', copyDebt: false, designNotes: false };
  private nav?: HTMLElement;
  private main?: HTMLElement;
  private context?: HTMLElement;
  private printRoot?: HTMLElement;
  private status?: HTMLElement;
  private saveButton?: HTMLButtonElement;

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
    this.saveButton = el('button', 'button button--save', '保存更改'); this.saveButton.type = 'button'; this.saveButton.disabled = true; this.saveButton.addEventListener('click', () => void this.saveChanges());
    const print = el('button', 'button button--primary', '打印当前范围'); print.type = 'button'; print.addEventListener('click', () => { this.preparePrint(); window.print(); });
    this.status = el('span', 'status-badge status-badge--ok', '配置管线已连接');
    label.append(select); tools.append(label, this.saveButton, print, this.status); header.append(brand, tools);
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
      cards: this.data.skills.cards, gods: this.data.gods, ctx: this.ctx(), filters: this.filters,
      selection: this.selection, crossView: this.crossView,
      onSelect: selection => { this.selection = selection; this.crossView = undefined; this.editingTextPath = undefined; this.editingMechanismPath = undefined; this.render(); },
      onCrossView: view => { this.crossView = view; this.editingTextPath = undefined; this.editingMechanismPath = undefined; this.render(); },
    });
    if (this.crossView) this.renderCrossView(this.crossView);
    else this.renderEntity(this.main, this.selection);
    if (this.crossView) {
      this.context.replaceChildren(el('section', 'context-section'), el('p', 'empty-state', '横切视图的行与单元格可点击回到实体；右栏在实体阅读态显示校验、反向引用和文案槽位。'));
    } else {
      renderContextPanel(this.context, {
        selection: this.selection, cards: this.data.skills.cards, gods: this.data.gods.gods,
        recipes: this.data.evolutionRecipes, texts: this.data.texts, report: this.combinedReport(), references: this.references,
        locate: (domain, path) => this.locate(domain, path),
      });
    }
    this.updateSaveState();
  }

  private openCard(id: string, path?: string): void {
    this.selection = { kind: 'card', id }; this.crossView = undefined; this.editingTextPath = path; this.render();
    if (path) requestAnimationFrame(() => this.locate('texts', path));
  }

  private renderCrossView(view: CrossViewId): void {
    if (!this.data || !this.main) return;
    switch (view) {
      case 'homogeneity': renderHomogeneityView(this.main, this.data.skills.cards, this.ctx(), id => this.openCard(id)); break;
      case 'copy': renderCopyCompletenessView(this.main, this.data.skills.cards, this.data.texts, (id, path) => this.openCard(id, path)); break;
      case 'power': renderPowerGridView(this.main, this.data.skills.cards, this.ctx(), this.currentGodId(), id => this.openCard(id)); break;
      case 'atoms': renderAtomUsageView(this.main, this.data.skills.cards, id => this.openCard(id)); break;
      case 'affixes': renderAffixCoverageView(this.main, this.data.skills.cards); break;
    }
  }

  private renderEntity(container: HTMLElement, selection: DesignSelection): void {
    if (!this.data) return;
    if (selection.kind === 'card') {
      const index = this.data.skills.cards.findIndex(card => card.id === selection.id); const card = this.data.skills.cards[index];
      if (card) renderCardView(container, card, this.ctx(), index, this.textEditingOptions(), this.mechanismEditingOptions()); else container.replaceChildren(el('p', 'empty-state', '卡牌不存在'));
    } else {
      const god = this.data.gods.gods.find(item => item.id === selection.id);
      if (god) renderGodView(container, god, this.data.skills.cards, this.ctx(), this.textEditingOptions()); else container.replaceChildren(el('p', 'empty-state', '神祇不存在'));
    }
  }

  private textEditingOptions(): TextEditingOptions | undefined {
    if (!this.data || this.crossView) return undefined;
    return {
      texts: this.data.texts,
      editingPath: this.editingTextPath,
      onToggle: path => { this.editingTextPath = path; this.render(); },
      onChange: () => this.onTextsChanged(),
    };
  }

  private mechanismEditingOptions(): MechanismEditingOptions | undefined {
    if (!this.references || this.crossView) return undefined;
    return {
      editingPath: this.editingMechanismPath,
      references: this.references,
      onToggle: path => { this.editingMechanismPath = path; this.render(); },
      onChange: domain => this.onEntityChanged(domain),
    };
  }

  private onEntityChanged(domain: EditableContentDomain): void {
    if (!this.data) return;
    this.entityDirtyDomains.add(domain);
    this.saveMessage = '';
    const sequence = (this.entityValidationSequences.get(domain) ?? 0) + 1;
    this.entityValidationSequences.set(domain, sequence);
    this.validatingEntityDomains.add(domain);
    this.updateSaveState();
    void this.contentSaver.validate(domain, this.data[domain]).then(report => {
      if (this.entityValidationSequences.get(domain) !== sequence) return;
      this.entityReports[domain] = report;
      this.renderContextOnly();
    }).catch(error => {
      if (this.entityValidationSequences.get(domain) !== sequence) return;
      this.saveMessage = error instanceof Error ? error.message : String(error);
    }).finally(() => {
      if (this.entityValidationSequences.get(domain) !== sequence) return;
      this.validatingEntityDomains.delete(domain);
      this.updateSaveState();
    });
  }

  private onTextsChanged(): void {
    if (!this.data) return;
    this.textsDirty = true;
    this.saveMessage = '';
    const sequence = ++this.validationSequence;
    this.validatingTexts = true;
    this.updateSaveState();
    void this.textSaver.validate(this.data.texts).then(report => {
      if (sequence !== this.validationSequence) return;
      this.textsReport = report;
      this.renderContextOnly();
    }).catch(error => {
      if (sequence !== this.validationSequence) return;
      this.saveMessage = error instanceof Error ? error.message : String(error);
    }).finally(() => {
      if (sequence !== this.validationSequence) return;
      this.validatingTexts = false;
      this.updateSaveState();
    });
  }

  private async saveChanges(): Promise<void> {
    if (!this.data || !this.originals || !this.hasDirtyDomains() || this.isValidating() || this.saving || this.dirtyReportsHaveErrors()) return;
    this.saving = true;
    this.saveMessage = '保存中…';
    this.updateSaveState();
    try {
      const candidates = this.dirtyCandidates();
      const result = await this.contentSaver.save(candidates);
      if (result.reports.texts) this.textsReport = result.reports.texts;
      for (const domain of this.entityDirtyDomains) if (result.reports[domain]) this.entityReports[domain] = result.reports[domain];
      if (result.ok) {
        for (const candidate of candidates) {
          const domain = candidate.domain as ContentDomain;
          this.originals[domain] = deepClone(this.data[domain]) as never;
        }
        this.textsDirty = false;
        this.entityDirtyDomains.clear();
        this.saveMessage = '更改已保存；刷新后游戏运行时才会读取新配置';
        this.render();
      } else {
        this.saveMessage = result.error ?? '保存被配置管线拒绝；未保存输入仍保留';
        this.renderContextOnly();
      }
    } catch (error) {
      this.saveMessage = error instanceof Error ? error.message : String(error);
    }
    this.saving = false;
    this.updateSaveState();
  }

  private renderContextOnly(): void {
    if (!this.data || !this.context || !this.references || this.crossView) return;
    renderContextPanel(this.context, {
      selection: this.selection, cards: this.data.skills.cards, gods: this.data.gods.gods,
      recipes: this.data.evolutionRecipes, texts: this.data.texts, report: this.combinedReport(), references: this.references,
      locate: (domain, path) => this.locate(domain, path),
    });
  }

  private updateSaveState(): void {
    if (!this.status || !this.saveButton) return;
    const errors = this.dirtyReportsHaveErrors();
    this.saveButton.disabled = import.meta.env.PROD || !this.hasDirtyDomains() || this.isValidating() || this.saving || errors;
    this.status.className = 'status-badge';
    if (import.meta.env.PROD) {
      this.status.classList.add('status-badge--warning');
      this.status.textContent = '只读演示 · 本地校验可用';
      this.saveButton.title = '静态部署不执行写回；请在本地开发服务器中保存';
    } else if (this.saving) {
      this.status.classList.add('status-badge--busy');
      this.status.textContent = '更改保存中';
    } else if (this.isValidating()) {
      this.status.classList.add('status-badge--busy');
      this.status.textContent = '候选配置校验中';
    } else if (this.saveMessage) {
      this.status.classList.add(this.hasDirtyDomains() ? 'status-badge--warning' : 'status-badge--ok');
      this.status.textContent = this.saveMessage;
    } else if (this.hasDirtyDomains() && errors) {
      this.status.classList.add('status-badge--error');
      this.status.textContent = '更改未保存 · 有 error';
    } else if (this.hasDirtyDomains()) {
      this.status.classList.add('status-badge--warning');
      this.status.textContent = `未保存：${this.dirtyDomainList().join(' + ')}`;
    } else {
      this.status.classList.add('status-badge--ok');
      this.status.textContent = '配置管线已连接';
    }
  }

  private dirtyDomainList(): ContentDomain[] {
    return [...(this.textsDirty ? ['texts' as const] : []), ...this.entityDirtyDomains];
  }

  private hasDirtyDomains(): boolean { return this.textsDirty || this.entityDirtyDomains.size > 0; }

  private isValidating(): boolean { return this.validatingTexts || this.validatingEntityDomains.size > 0; }

  private dirtyReportsHaveErrors(): boolean {
    return this.dirtyDomainList().some(domain => reportHasErrors(domain === 'texts' ? this.textsReport : this.entityReports[domain]));
  }

  private dirtyCandidates(): SaveCandidate[] {
    if (!this.data || !this.originals) return [];
    return this.dirtyDomainList().map(domain => ({ domain, data: this.data?.[domain], original: this.originals?.[domain] }));
  }

  private combinedReport(): ValidationReportDto | undefined {
    const sources = [this.report, this.textsReport, ...Object.values(this.entityReports)].filter((item): item is ValidationReportDto => Boolean(item));
    if (!sources.length) return undefined;
    const issues = new Map<string, ValidationReportDto['issues'][number]>();
    for (const source of sources) for (const { issue } of collectIssues(source)) issues.set(`${issue.level}:${issue.domain}:${issue.path}:${issue.message}`, issue);
    return {
      ok: [...issues.values()].every(issue => issue.level !== 'error'),
      checks: [...new Set(sources.flatMap(source => source.checks))],
      issues: [...issues.values()],
    };
  }

  private currentGodId(): string {
    if (!this.data) return '';
    if (this.selection.kind === 'god') return this.selection.id;
    if (this.selection.kind === 'card') return this.data.skills.cards.find(card => card.id === this.selection.id)?.god ?? this.data.gods.gods[0]?.id ?? '';
    return this.data.gods.gods[0]?.id ?? '';
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
  }

  /** 后续阶段复用同一内存候选与原始快照，不允许视图自行序列化落盘。 */
  protected contentState(): { data?: DesignData; originals?: DesignData } { return { data: this.data, originals: this.originals }; }
}
