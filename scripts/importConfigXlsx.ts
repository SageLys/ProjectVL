import { resolve } from 'node:path';
import { CONFIG_XLSX_PATH, formatImportIssue, importConfigWorkbook } from './configXlsx.ts';

async function main(): Promise<void> {
  const input = resolve(process.cwd(), CONFIG_XLSX_PATH);
  const result = await importConfigWorkbook(input);
  if (!result.ok) {
    console.error(`配置工作簿校验失败（${result.issues.length} error），没有写入任何文件：`);
    result.issues.forEach(issue => console.error(formatImportIssue(issue)));
    process.exitCode = 1;
    return;
  }
  console.log(`配置工作簿导入成功：15 个域全部通过 validateCandidate，已用 stableJson 写回。`);
}

main().catch(error => {
  console.error(`配置工作簿导入失败，没有写入任何文件：\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
