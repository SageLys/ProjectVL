import { ConfigApi } from './api';
import {
  collectIssues, reportHasErrors,
  type EditorDomain, type ValidationReportDto, type WriteResponse,
} from './contracts';

export interface SaveCandidate {
  domain: EditorDomain;
  data: unknown;
  original: unknown;
}

export interface EntityTextSaveBatch {
  entity: SaveCandidate & { domain: 'skills' | 'gods' | 'relics' };
  texts: SaveCandidate & { domain: 'texts' };
}

export interface SaveFlowResult {
  ok: boolean;
  stage: 'validate' | 'write' | 'done';
  reports: Partial<Record<EditorDomain, ValidationReportDto>>;
  writes: Partial<Record<EditorDomain, WriteResponse>>;
  error?: string;
}

/**
 * 先把整批候选逐域预检，再开始写。若提交阶段意外失败，则仍经 write 端点补偿已写域。
 * 正常的 422 因此发生在零写入阶段，遗物 + texts 不会只落一半。
 */
export class ConfigSaveFlow {
  constructor(private readonly api: ConfigApi) {}

  async save(candidates: SaveCandidate[]): Promise<SaveFlowResult> {
    const reports: Partial<Record<EditorDomain, ValidationReportDto>> = {};
    const writes: Partial<Record<EditorDomain, WriteResponse>> = {};
    const validated = await Promise.all(candidates.map(async candidate => {
      const report = await this.api.validate(candidate.domain, candidate.data);
      reports[candidate.domain] = report;
      return report;
    }));
    if (validated.some(reportHasErrors)) {
      return { ok: false, stage: 'validate', reports, writes, error: '校验未通过，所有域均未写入' };
    }

    const committed: SaveCandidate[] = [];
    for (const candidate of candidates) {
      const response = await this.api.write(candidate.domain, candidate.data);
      writes[candidate.domain] = response;
      if (!response.ok) {
        if (response.report) reports[candidate.domain] = response.report;
        for (const previous of [...committed].reverse()) await this.api.write(previous.domain, previous.original);
        return {
          ok: false,
          stage: 'write',
          reports,
          writes,
          error: response.error ?? '写入被配置管线拒绝；已回滚本批次先前写入',
        };
      }
      committed.push(candidate);
    }
    return { ok: true, stage: 'done', reports, writes };
  }

  /** 卡 / 神 / 遗物的唯一双域保存入口；底层仍复用同一批次预检、写回与补偿逻辑。 */
  async saveEntityWithTexts(batch: EntityTextSaveBatch): Promise<SaveFlowResult> {
    return await this.save([batch.entity, batch.texts]);
  }

  static canSave(reports: Iterable<ValidationReportDto>): boolean {
    const list = [...reports];
    return list.length > 0 && list.every(report => collectIssues(report).every(item => item.issue.level !== 'error'));
  }
}
