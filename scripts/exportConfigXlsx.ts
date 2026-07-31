import { resolve } from 'node:path';
import { CONFIG_XLSX_PATH, exportCurrentConfigWorkbook } from './configXlsx.ts';

async function main(): Promise<void> {
  const output = await exportCurrentConfigWorkbook();
  console.log(`配置工作簿已导出：${output}`);
  console.log(`固定路径：${resolve(process.cwd(), CONFIG_XLSX_PATH)}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
