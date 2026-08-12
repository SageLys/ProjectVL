import type { GodsConfig, SkillsConfig, TunerConfig } from '../config/types';
import { ConfigApi } from './api';
import {
  EDITOR_DOMAINS, reportHasErrors,
  type EditorDomain, type ValidationReportDto,
} from './contracts';
import { button, deepClone, el } from './dom';
import { entityTextChangeHandlers, type EntityTextDomain } from './entityTextEditor';
import { renderGodsEditor } from './godsEditor';
import { buildReferenceCatalog } from './references';
import { ConfigSaveFlow } from './saveFlow';
import { renderSkillsEditor } from './skillsEditor';
import { renderTreeEditor } from './treeEditor';
import { renderTextsEditor } from './textsEditor';
import { renderTunerEditor } from './tunerEditor';
import { renderValidationPanel } from './validationPanel';

type DataMap = Record<EditorDomain, unknown>;
type ReportMap = Partial<Record<EditorDomain, ValidationReportDto>>;

const DOMAIN_LABELS: Record<EditorDomain, string> = {
  combat: '战斗', waves: '波次', enemies: '敌人', difficulty: '难度', skills: '技能',
  gods: '神池', rewardMeter: '奖励蓄力条', evolutionRecipes: '进化配方', waveRewards: '波末奖励',
  settlement: '结算', economy: '经济', bounty: 'Bounty', input: '输入', tuner: '调参', texts: '文案',
};

const FORM_DOMAINS = new Set<EditorDomain>(['skills', 'gods', 'tuner', 'texts']);
const TREE_TOGGLE_DOMAINS = new Set<EditorDomain>(['skills', 'gods', 'tuner']);

export class ConfigEditorApp {
  private readonly api = new ConfigApi();
  private readonly saveFlow = new ConfigSaveFlow(this.api);
  private data?: DataMap;
  private originals?: DataMap;
  private selected: EditorDomain = 'skills';
  private structuredMode = false;
  private dirty = new Set<EditorDomain>();
  private reports: ReportMap = {};
  private validating = new Set<EditorDomain>();
  private pendingValidation = new Set<EditorDomain>();
  private validationTimer?: number;
  private validationVersions: Partial<Record<EditorDomain, number>> = {};
  private saving = false;
  private message = '';

  private readonly nav = el('nav', 'domain-nav');
  private readonly title = el('h1', 'workspace-title');
  private readonly pathLabel = el('div', 'workspace-path');
  private readonly modeButton = button('查看结构树', 'button button--quiet');
  private readonly saveButton = button('保存', 'button button--primary');
  private readonly previewButton = button('在 H5 中预览', 'button button--quiet');
  private readonly content = el('main', 'editor-content');
  private readonly validation = el('aside', 'validation-panel');
  private readonly status = el('div', 'global-status');

  constructor(private readonly root: HTMLElement) {}

  async start(): Promise<void> {
    this.renderShell();
    this.status.textContent = '正在从配置管线读取 15 个域…';
    try {
      const paths = await this.api.domains();
      const missing = EDITOR_DOMAINS.filter(domain => !paths[domain]);
      if (missing.length) throw new Error(`端点缺少可写域: ${missing.join(', ')}`);
      const loaded = await Promise.all(EDITOR_DOMAINS.map(async domain => [domain, await this.api.load(paths[domain])] as const));
      this.data = Object.fromEntries(loaded) as DataMap;
      this.originals = deepClone(this.data);
      this.status.textContent = '配置已加载；改动会自动校验。';
      this.renderNavigation();
      this.renderSelected();
      this.scheduleValidation(this.selected, true);
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
      this.status.className = 'global-status global-status--error';
      this.content.replaceChildren(el('div', 'fatal-state', '编辑器只在 Vite 开发服务器中可用。请用 npm run dev 后访问 /editor.html。'));
    }
  }

  private renderShell(): void {
    const brand = el('div', 'editor-brand');
    brand.append(el('div', 'editor-brand__mark', 'VL'), el('div', '', '配置编辑器'), el('small', '', 'DEV ONLY · v1 表单式'));
    const left = el('aside', 'editor-sidebar');
    left.append(brand, this.nav);
    const top = el('header', 'editor-toolbar');
    const heading = el('div');
    heading.append(this.title, this.pathLabel);
    const actions = el('div', 'toolbar-actions');
    this.modeButton.addEventListener('click', () => {
      this.structuredMode = !this.structuredMode;
      this.renderSelected();
    });
    this.saveButton.addEventListener('click', () => void this.save());
    this.previewButton.addEventListener('click', () => window.open(new URL('./index.html', location.href), 'projectvl-h5-preview'));
    actions.append(this.modeButton, this.previewButton, this.saveButton);
    if (import.meta.env.PROD) {
      this.saveButton.disabled = true;
      this.saveButton.title = '只读演示模式：请在本地开发服务器中保存';
    }
    top.append(heading, actions);
    const center = el('section', 'editor-workspace');
    center.append(top, this.status, this.content);
    this.root.replaceChildren(left, center, this.validation);
    this.root.className = 'editor-shell';
    this.updateChrome();
  }

  private renderNavigation(): void {
    this.nav.replaceChildren();
    for (const domain of EDITOR_DOMAINS) {
      const item = button('', `domain-nav__item${domain === this.selected ? ' is-selected' : ''}`);
      item.dataset.domain = domain;
      item.append(el('span', 'domain-nav__label', DOMAIN_LABELS[domain]), el('code', '', domain));
      if (this.dirty.has(domain)) item.append(el('span', 'dirty-dot', '●'));
      item.addEventListener('click', () => {
        this.selected = domain;
        this.structuredMode = false;
        this.renderNavigation();
        this.renderSelected();
        this.scheduleValidation(domain, true);
      });
      this.nav.append(item);
    }
  }

  private renderSelected(): void {
    if (!this.data) return;
    const domain = this.selected;
    this.content.replaceChildren();
    this.content.dataset.configPath = `$.${domain}`;
    const references = buildReferenceCatalog(this.data);
    const onChange = (changedDomain = domain): void => this.changed(changedDomain);
    if (this.structuredMode || !FORM_DOMAINS.has(domain)) {
      const tree = el('div', 'tree-editor');
      renderTreeEditor(tree, this.data[domain], {
        path: `$.${domain}`,
        references,
        onChange: () => onChange(domain),
      });
      this.content.append(tree);
    } else if (domain === 'skills') {
      const changes = entityTextChangeHandlers('skills', onChange);
      renderSkillsEditor(this.content, this.data.skills as SkillsConfig, {
        texts: this.data.texts as Record<string, unknown>,
        references,
        onChange: changes.onEntityChange,
        onTextsChange: changes.onTextsChange,
      });
    } else if (domain === 'gods') {
      const changes = entityTextChangeHandlers('gods', onChange);
      renderGodsEditor(this.content, this.data.gods as GodsConfig, {
        texts: this.data.texts as Record<string, unknown>,
        references,
        ...changes,
      });
    } else if (domain === 'tuner') {
      renderTunerEditor(this.content, this.data.tuner as TunerConfig, {
        configRoot: this.data,
        texts: this.data.texts,
        onChange: target => {
          onChange(target);
          onChange('tuner');
        },
      });
    } else {
      renderTextsEditor(this.content, this.data.texts as Record<string, unknown>, {
        references,
        onChange: () => onChange('texts'),
      });
    }
    this.updateChrome();
  }

  private changed(domain: EditorDomain): void {
    this.dirty.add(domain);
    this.validationVersions[domain] = (this.validationVersions[domain] ?? 0) + 1;
    delete this.reports[domain];
    this.message = '';
    this.scheduleValidation(domain);
    this.renderNavigation();
    this.updateChrome();
  }

  private scheduleValidation(domain: EditorDomain, immediate = false): void {
    if (!this.data) return;
    this.pendingValidation.add(domain);
    if (this.validationTimer !== undefined) window.clearTimeout(this.validationTimer);
    if (immediate) void this.flushValidation();
    else this.validationTimer = window.setTimeout(() => void this.flushValidation(), 320);
    this.updateChrome();
  }

  private async flushValidation(): Promise<void> {
    if (!this.data) return;
    const domains = [...this.pendingValidation];
    this.pendingValidation.clear();
    this.validationTimer = undefined;
    domains.forEach(domain => this.validating.add(domain));
    this.renderReports();
    const versions = new Map(domains.map(domain => [domain, this.validationVersions[domain] ?? 0]));
    await Promise.all(domains.map(async domain => {
      try {
        const report = await this.api.validate(domain, this.data?.[domain]);
        if ((this.validationVersions[domain] ?? 0) === versions.get(domain)) this.reports[domain] = report;
      } catch (error) {
        this.message = error instanceof Error ? error.message : String(error);
      } finally {
        this.validating.delete(domain);
      }
    }));
    this.renderReports();
    this.updateChrome();
  }

  private renderReports(): void {
    renderValidationPanel(this.validation, this.reports, this.validating.size > 0, (domain, path) => this.locate(domain, path));
  }

  private locate(domain: EditorDomain, path: string): void {
    if (this.selected !== domain) {
      this.selected = domain;
      this.structuredMode = false;
      this.renderNavigation();
      this.renderSelected();
    }
    const paths = [...this.content.querySelectorAll<HTMLElement>('[data-config-path]')];
    let candidate = path;
    let target: HTMLElement | undefined;
    while (!target && candidate.length > 1) {
      target = paths.find(node => node.dataset.configPath === candidate);
      candidate = candidate.replace(/(?:\.[^.\[]+|\[\d+\])$/, '');
    }
    target ??= this.content;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('is-located');
    window.setTimeout(() => target?.classList.remove('is-located'), 1800);
    target.querySelector<HTMLElement>('input,select,textarea,button')?.focus({ preventScroll: true });
  }

  private updateChrome(): void {
    this.title.textContent = `${DOMAIN_LABELS[this.selected]}配置`;
    this.pathLabel.textContent = this.selected === 'tuner' && !this.structuredMode
      ? 'tuner.json 元数据驱动 · 数值写回 path 所属域'
      : `/${this.selected}`;
    const hasSpecial = TREE_TOGGLE_DOMAINS.has(this.selected);
    this.modeButton.hidden = !hasSpecial;
    this.modeButton.textContent = this.structuredMode ? '返回专用表单' : '查看结构树';
    const dirtyReports = [...this.dirty].map(domain => this.reports[domain]);
    const allReported = dirtyReports.every((report): report is ValidationReportDto => Boolean(report));
    const hasError = dirtyReports.some(report => Boolean(report && reportHasErrors(report)));
    this.saveButton.disabled = import.meta.env.PROD || !this.dirty.size || this.saving || this.validating.size > 0 || !allReported || hasError;
    this.saveButton.textContent = this.saving ? '保存中…' : this.dirty.size ? `保存 ${this.dirty.size} 个域` : '保存';
    const pieces = [import.meta.env.PROD ? '只读演示模式：本页使用随构建打包的配置执行本地校验，不会写回仓库。' : this.message];
    if (this.dirty.size) pieces.push(`未保存：${[...this.dirty].join(', ')}`);
    if (hasError) pieces.push('存在 error，已禁用保存');
    if (!pieces.filter(Boolean).length) pieces.push('配置已加载；改动会自动校验。');
    this.status.textContent = pieces.filter(Boolean).join(' · ');
    this.status.className = `global-status${hasError ? ' global-status--error' : ''}`;
    this.renderReports();
  }

  private async save(): Promise<void> {
    if (!this.data || !this.originals || this.saveButton.disabled) return;
    this.saving = true;
    this.message = '';
    this.updateChrome();
    const domains = [...this.dirty];
    try {
      const entityDomains = domains.filter((domain): domain is EntityTextDomain =>
        domain === 'skills' || domain === 'gods');
      const pairedEntity = domains.length === 2 && domains.includes('texts') && entityDomains.length === 1
        ? entityDomains[0]
        : undefined;
      const result = pairedEntity
        ? await this.saveFlow.saveEntityWithTexts({
          entity: {
            domain: pairedEntity,
            data: this.data[pairedEntity],
            original: this.originals[pairedEntity],
          },
          texts: { domain: 'texts', data: this.data.texts, original: this.originals.texts },
        })
        : await this.saveFlow.save(domains.map(domain => ({
          domain,
          data: this.data?.[domain],
          original: this.originals?.[domain],
        })));
      this.reports = { ...this.reports, ...result.reports };
      if (!result.ok) {
        this.message = result.error ?? '保存失败，本地未保存态已保留。';
      } else {
        for (const domain of domains) {
          this.originals[domain] = deepClone(this.data[domain]);
          this.dirty.delete(domain);
        }
        this.message = '已通过配置管线写盘。刷新游戏页面后生效。';
      }
    } catch (error) {
      this.message = error instanceof Error ? error.message : String(error);
    } finally {
      this.saving = false;
      this.renderNavigation();
      this.updateChrome();
    }
  }
}
