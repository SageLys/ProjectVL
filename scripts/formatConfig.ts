// `npm run format:config`：把全部配置 JSON 规整为规范格式（2 空格缩进、LF、结尾换行）。
// 与 /__config/write 共用 src/config/format.ts，因此「工具写回」与「手工编辑 + 本命令」字节一致。
// 加 `--check` 只报告不改写（CI/预提交可用）。
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stableJson } from '../src/config/format.ts';
import { WRITABLE_DOMAINS } from '../src/config/pipeline.ts';

function main(): void {
  const checkOnly = process.argv.includes('--check');
  const changed: string[] = [];

  for (const relative of Object.values(WRITABLE_DOMAINS)) {
    const absolute = resolve(process.cwd(), relative);
    const current = readFileSync(absolute, 'utf8');
    const normalized = stableJson(JSON.parse(current));
    if (current === normalized) continue;
    changed.push(relative);
    if (!checkOnly) writeFileSync(absolute, normalized, 'utf8');
  }

  if (!changed.length) return console.log('全部配置文件已是规范格式。');
  console.log(`${checkOnly ? '需要规整' : '已规整'} ${changed.length} 个文件：`);
  for (const path of changed) console.log(`  ${path}`);
  if (checkOnly) process.exitCode = 1;
}

main();
