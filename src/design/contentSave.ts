import { ConfigApi } from '../editor/api';
import type { EditorDomain, ValidationReportDto } from '../editor/contracts';
import { ConfigSaveFlow, type SaveCandidate, type SaveFlowResult } from '../editor/saveFlow';

const ENTITY_DOMAINS = ['skills', 'gods'] as const;

export class DesignContentSaveCoordinator {
  private readonly flow: ConfigSaveFlow;

  constructor(private readonly api: ConfigApi) { this.flow = new ConfigSaveFlow(api); }

  async validate(domain: EditorDomain, data: unknown): Promise<ValidationReportDto> {
    return await this.api.validate(domain, data);
  }

  async save(candidates: SaveCandidate[]): Promise<SaveFlowResult> {
    const texts = candidates.find(candidate => candidate.domain === 'texts');
    const entities = candidates.filter(candidate => (ENTITY_DOMAINS as readonly string[]).includes(candidate.domain));
    if (candidates.length === 2 && texts && entities.length === 1) {
      const entity = entities[0] as SaveCandidate & { domain: typeof ENTITY_DOMAINS[number] };
      return await this.flow.saveEntityWithTexts({
        entity,
        texts: texts as SaveCandidate & { domain: 'texts' },
      });
    }
    return await this.flow.save(candidates);
  }
}
