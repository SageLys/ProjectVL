import { ConfigApi } from '../editor/api';
import type { ValidationReportDto } from '../editor/contracts';
import { ConfigSaveFlow, type SaveFlowResult } from '../editor/saveFlow';

export class DesignTextSaveCoordinator {
  private readonly flow: ConfigSaveFlow;

  constructor(private readonly api: ConfigApi) {
    this.flow = new ConfigSaveFlow(api);
  }

  async validate(texts: Record<string, unknown>): Promise<ValidationReportDto> {
    return await this.api.validate('texts', texts);
  }

  async save(texts: Record<string, unknown>, original: Record<string, unknown>): Promise<SaveFlowResult> {
    return await this.flow.save([{ domain: 'texts', data: texts, original }]);
  }
}
