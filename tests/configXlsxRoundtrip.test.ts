import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import type { CardDef } from '../src/core/effects/defs';
import { WRITABLE_DOMAINS, type WritableDomain } from '../src/config/pipeline';
import {
  importConfigWorkbook, loadConfigSnapshot, readSkillsSheets, writeConfigWorkbook, writeSkillsSheets,
} from '../scripts/configXlsx';

function minimalCard(): CardDef {
  return {
    id: 'demoZone',
    category: 'domain',
    synergyTags: ['domain'],
    textKey: 'cards.demoZone',
    teaching: false,
    stars: {
      '3': { tier: 'core', equip: [{ trigger: 'onHit', effects: [{ atom: 'slow', params: { ratio: 0.2 } }] }] },
      '5': { tier: 'dual', equip: [{ trigger: 'interval', triggerParams: { seconds: 2 }, effects: [{ atom: 'dot', params: { damageRatio: 0.2 } }] }] },
      '6': {
        tier: 'transform',
        equip: [{
          trigger: 'interval',
          triggerParams: { seconds: 1.5 },
          effects: [{
            atom: 'groundZone',
            params: {
              radius: 120,
              duration: 4,
              tickInterval: 0.5,
              effects: [
                { atom: 'dot', params: { damageRatio: 0.3 } },
                { atom: 'slow', params: { ratio: 0.25, duration: 0.6 } },
              ],
            },
          }],
        }],
      },
    },
    amplifyAxis: { params: { radius: 'areaScaleMul' } },
    consumable: {
      placement: 'point',
      interpolation: 'linear',
      anchors: {
        '1': { radius: 70, effects: [{ atom: 'slow', params: { ratio: 0.1 } }] },
        '3': { radius: 100, effects: [{ atom: 'slow', params: { ratio: 0.2 } }] },
        '6': { radius: 140, effects: [{ atom: 'slow', params: { ratio: 0.3 } }] },
      },
    },
    designNotes: 'round-trip fixture',
  };
}

function cardTexts(): Record<string, unknown> {
  return {
    demoZone: {
      name: '测试领域',
      hand: { shortByTier: { '1': '测试 1★', '3': '测试 3★', '6': '测试 6★' } },
      equip: { shortByTier: { '3': '测试 3★', '5': '测试 5★', '6': '测试 6★' } },
      overview: '用于 Excel 关联表往返测试。',
    },
  };
}

async function roundTripSkills(skills: unknown, texts: Record<string, unknown>): Promise<ReturnType<typeof readSkillsSheets>> {
  const first = new ExcelJS.Workbook();
  writeSkillsSheets(first, skills, texts);
  const dir = await mkdtemp(join(tmpdir(), 'projectvl-skills-xlsx-'));
  try {
    const firstPath = join(dir, 'first.xlsx');
    const secondPath = join(dir, 'second.xlsx');
    await first.xlsx.writeFile(firstPath);
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.readFile(firstPath);
    const imported = readSkillsSheets(loaded);
    const second = new ExcelJS.Workbook();
    writeSkillsSheets(second, imported.skills, imported.texts);
    await second.xlsx.writeFile(secondPath);
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.readFile(secondPath);
    return readSkillsSheets(reloaded);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function headerColumns(sheet: ExcelJS.Worksheet): Map<string, number> {
  const out = new Map<string, number>();
  sheet.getRow(3).eachCell((cell, column) => {
    if (typeof cell.value === 'string') out.set(cell.value, column);
  });
  return out;
}

describe('config xlsx round-trip', () => {
  it('keeps export → import → export logically idempotent for a small workbook', async () => {
    const skills = { version: '0.4.1', cards: [minimalCard()] };
    const imported = await roundTripSkills(skills, cardTexts());
    expect(imported.skills).toEqual(skills);
    expect(imported.texts).toEqual(cardTexts());
  });

  it('round-trips nested groundZone params.effects without flattening loss', async () => {
    const card = minimalCard();
    const imported = await roundTripSkills({ version: '0.4.1', cards: [card] }, cardTexts());
    const roundTripped = (imported.skills as { cards: CardDef[] }).cards[0];
    expect(roundTripped.stars['6'].equip[0].effects).toEqual(card.stars['6'].equip[0].effects);
    expect(roundTripped.stars['6'].equip[0].effects[0]).toMatchObject({
      atom: 'groundZone',
      params: { effects: [{ atom: 'dot' }, { atom: 'slow' }] },
    });
  });

  it('rejects dangling ids and out-of-range atom params before writing any domain', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'projectvl-config-xlsx-invalid-'));
    try {
      const workbookPath = join(dir, 'invalid.xlsx');
      const targetRoot = join(dir, 'target');
      const snapshot = await loadConfigSnapshot();
      await writeConfigWorkbook(snapshot, workbookPath);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(workbookPath);
      const gods = workbook.getWorksheet('gods');
      if (!gods) throw new Error('missing gods sheet');
      const godColumns = headerColumns(gods);
      const anchorsCell = gods.getCell(5, godColumns.get('anchorCardIds') ?? 0);
      const anchors = JSON.parse(String(anchorsCell.value)) as string[];
      anchors.push('missingCardFromExcel');
      anchorsCell.value = JSON.stringify(anchors);

      const params = workbook.getWorksheet('skills.effectParams');
      if (!params) throw new Error('missing skills.effectParams sheet');
      const paramColumns = headerColumns(params);
      let changedBounces = false;
      for (let row = 5; row <= params.rowCount; row++) {
        if (params.getCell(row, paramColumns.get('paramName') ?? 0).value === 'bounces') {
          params.getCell(row, paramColumns.get('value') ?? 0).value = -1;
          changedBounces = true;
          break;
        }
      }
      expect(changedBounces).toBe(true);
      await workbook.xlsx.writeFile(workbookPath);

      const before = new Map<WritableDomain, string>();
      for (const [domain, relativePath] of Object.entries(WRITABLE_DOMAINS) as Array<[WritableDomain, string]>) {
        const source = await readFile(resolve(process.cwd(), relativePath), 'utf8');
        const target = resolve(targetRoot, relativePath);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, source, 'utf8');
        before.set(domain, source);
      }

      const result = await importConfigWorkbook(workbookPath, { root: targetRoot, write: true });
      expect(result.ok).toBe(false);
      expect(result.written).toBe(false);
      expect(result.issues.some(issue => issue.path === '$.gods.gods[0].anchorCardIds')).toBe(true);
      expect(result.issues.some(issue => issue.domain === 'skills' && /bounces/.test(`${issue.path} ${issue.message}`))).toBe(true);
      for (const [domain, relativePath] of Object.entries(WRITABLE_DOMAINS) as Array<[WritableDomain, string]>) {
        expect(await readFile(resolve(targetRoot, relativePath), 'utf8')).toBe(before.get(domain));
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
