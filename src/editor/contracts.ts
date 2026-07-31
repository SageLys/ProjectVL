/** 浏览器侧只描述端点 DTO；校验结论始终来自 /__config/validate。 */
export const EDITOR_DOMAINS = [
  'combat', 'waves', 'enemies', 'difficulty', 'skills', 'gods',
  'evolutionRecipes', 'waveRewards', 'rewardMeter', 'settlement', 'economy', 'bounty',
  'input', 'tuner', 'texts',
] as const;

export type EditorDomain = typeof EDITOR_DOMAINS[number];
export type ValidationLevel = 'error' | 'warning';
export type ValidationLayer = 'schema' | 'reference' | 'semantic';

export interface ValidationIssueDto {
  level: ValidationLevel;
  layer: ValidationLayer;
  domain: EditorDomain;
  path: string;
  message: string;
}

export interface ValidationReportDto {
  ok: boolean;
  issues: ValidationIssueDto[];
  checks: string[];
  variants?: Array<{ variant: string; report: ValidationReportDto }>;
}

export interface LocatedIssue {
  issue: ValidationIssueDto;
  variant?: string;
}

export interface DomainsResponse {
  ok: true;
  domains: Record<EditorDomain, string>;
}

export interface ValidateResponse {
  ok: boolean;
  report: ValidationReportDto;
}

export interface WriteResponse {
  ok: boolean;
  path?: string;
  error?: string;
  report?: ValidationReportDto;
}

export function collectIssues(report: ValidationReportDto): LocatedIssue[] {
  const base = report.issues.map(issue => ({ issue }));
  const variants = (report.variants ?? []).flatMap(entry =>
    collectIssues(entry.report).map(item => ({ ...item, variant: item.variant ?? entry.variant })),
  );
  return [...base, ...variants];
}

export function reportHasErrors(report: ValidationReportDto | undefined): boolean {
  return report ? collectIssues(report).some(item => item.issue.level === 'error') : true;
}

export function isEditorDomain(value: string): value is EditorDomain {
  return (EDITOR_DOMAINS as readonly string[]).includes(value);
}
