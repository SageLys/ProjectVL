// `npm run validate`：一条命令做完 schema + 跨引用 + 语义三层校验，输出分域报告。
// 有 error 即非零退出（CI 就绪）；warning 只提示不拦。
// 额外附带 `--format-check`：顺带检查配置文件是否已是规范 JSON 格式。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isStableJson } from '../src/config/format.ts';
import { WRITABLE_DOMAINS, validateCurrentConfig } from '../src/config/pipeline.ts';
import type { ValidationIssue, ValidationReport } from '../src/config/validateAll.ts';

const RESET = '[0m';
const RED = '[31m';
const YELLOW = '[33m';
const GREEN = '[32m';
const DIM = '[2m';

function printIssues(title: string, report: ValidationReport): { errors: number; warnings: number } {
  const errors = report.issues.filter(issue => issue.level === 'error');
  const warnings = report.issues.filter(issue => issue.level === 'warning');
  if (!errors.length && !warnings.length) {
    console.log(`${GREEN}✓${RESET} ${title} ${DIM}(${report.checks.length} 项检查全过)${RESET}`);
    return { errors: 0, warnings: 0 };
  }

  console.log(`\n${errors.length ? RED : YELLOW}●${RESET} ${title}`);
  const byDomain = new Map<string, ValidationIssue[]>();
  for (const issue of report.issues) {
    const bucket = byDomain.get(issue.domain) ?? [];
    bucket.push(issue);
    byDomain.set(issue.domain, bucket);
  }
  for (const [domain, issues] of [...byDomain].sort(([a], [b]) => (a < b ? -1 : 1))) {
    console.log(`  ${domain}`);
    for (const issue of issues) {
      const mark = issue.level === 'error' ? `${RED}ERROR${RESET}` : `${YELLOW}WARN ${RESET}`;
      console.log(`    ${mark} ${DIM}[${issue.layer}]${RESET} ${issue.path}\n           ${issue.message}`);
    }
  }
  return { errors: errors.length, warnings: warnings.length };
}

function formatCheck(): string[] {
  return Object.values(WRITABLE_DOMAINS).filter(relative => {
    const absolute = resolve(process.cwd(), relative);
    try {
      return !isStableJson(readFileSync(absolute, 'utf8'));
    } catch {
      return false;
    }
  });
}

function main(): void {
  const report = validateCurrentConfig();
  console.log(`${DIM}配置管线 v1 · 三层校验（schema / 跨引用 / 语义）${RESET}\n`);

  let errors = 0;
  let warnings = 0;
  const base = printIssues('base（无 variant）', report);
  errors += base.errors;
  warnings += base.warnings;
  for (const entry of report.variants) {
    const counted = printIssues(`variant: ${entry.variant}`, entry.report);
    errors += counted.errors;
    warnings += counted.warnings;
  }

  const unformatted = formatCheck();
  if (unformatted.length) {
    warnings += unformatted.length;
    console.log(`\n${YELLOW}●${RESET} 格式`);
    for (const path of unformatted) {
      console.log(`    ${YELLOW}WARN ${RESET} ${DIM}[format]${RESET} ${path}\n           不是规范 JSON 格式，运行 npm run format:config 规整`);
    }
  }

  console.log(`\n检查项：${report.checks.join('、')}`);
  console.log(`结果：${errors ? `${RED}${errors} 个错误${RESET}` : `${GREEN}0 错误${RESET}`}、${warnings} 个警告`);
  if (errors) process.exitCode = 1;
}

main();
