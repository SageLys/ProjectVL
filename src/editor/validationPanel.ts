import { collectIssues, type EditorDomain, type ValidationReportDto } from './contracts';
import { button, el } from './dom';

export type LocateIssue = (domain: EditorDomain, path: string) => void;

export function renderValidationPanel(
  container: HTMLElement,
  reports: Partial<Record<EditorDomain, ValidationReportDto>>,
  validating: boolean,
  locate: LocateIssue,
): void {
  container.replaceChildren();
  const title = el('div', 'validation-title');
  title.append(el('h2', '', '配置校验'));
  if (validating) title.append(el('span', 'status-badge status-badge--busy', '校验中'));
  container.append(title);

  const entries = Object.entries(reports) as Array<[EditorDomain, ValidationReportDto]>;
  if (!entries.length) {
    container.append(el('p', 'empty-state', '修改配置后，这里会显示配置管线的校验结论。'));
    return;
  }

  const grouped = new Map<EditorDomain, { reports: ValidationReportDto[]; issues: ReturnType<typeof collectIssues> }>();
  for (const [candidateDomain, report] of entries) {
    const issues = collectIssues(report);
    if (!issues.length) {
      const group = grouped.get(candidateDomain) ?? { reports: [], issues: [] };
      group.reports.push(report);
      grouped.set(candidateDomain, group);
    }
    for (const issue of issues) {
      const domain = issue.issue.domain;
      const group = grouped.get(domain) ?? { reports: [], issues: [] };
      group.issues.push(issue);
      grouped.set(domain, group);
    }
  }

  for (const [domain, group] of grouped) {
    const section = el('section', 'validation-group');
    const issues = group.issues;
    const errors = issues.filter(item => item.issue.level === 'error').length;
    const warnings = issues.length - errors;
    const heading = el('div', 'validation-group__heading');
    heading.append(el('h3', '', domain));
    heading.append(el('span', errors ? 'status-badge status-badge--error' : 'status-badge status-badge--ok', errors ? `${errors} error` : '可保存'));
    if (warnings) heading.append(el('span', 'status-badge status-badge--warning', `${warnings} warning`));
    section.append(heading);
    if (!issues.length) {
      const checks = new Set(group.reports.flatMap(report => report.checks));
      section.append(el('p', 'validation-ok', `已通过 ${checks.size} 项检查`));
    }
    for (const { issue, variant } of issues) {
      const item = el('article', `validation-issue validation-issue--${issue.level}`);
      const meta = el('div', 'validation-issue__meta');
      meta.append(el('span', '', `${issue.layer}${variant ? ` · variant: ${variant}` : ''}`));
      const path = button(issue.path, 'path-link');
      path.addEventListener('click', () => locate(issue.domain, issue.path));
      meta.append(path);
      item.append(meta, el('p', '', issue.message));
      section.append(item);
    }
    container.append(section);
  }
}
