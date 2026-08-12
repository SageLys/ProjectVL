import type {
  DomainsResponse, EditorDomain, ValidateResponse, ValidationReportDto, WriteResponse,
} from './contracts';
import { cfg } from '../config';
import { texts } from '../data';
import { validateGameConfig } from '../config/validateAll';

export type EditorFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ConfigEndpointError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly response?: WriteResponse,
  ) {
    super(message);
  }
}

export class ConfigApi {
  constructor(private readonly fetcher: EditorFetch = globalThis.fetch.bind(globalThis)) {}

  private async post<T>(url: string, data: unknown): Promise<{ status: number; body: T }> {
    const response = await this.fetcher(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    let body: T;
    try {
      body = await response.json() as T;
    } catch {
      throw new ConfigEndpointError(`${url} 返回了非 JSON 响应`, response.status);
    }
    return { status: response.status, body };
  }

  async domains(): Promise<DomainsResponse['domains']> {
    if (import.meta.env.PROD) return Object.fromEntries([
      ...Object.keys(cfg).map(domain => [domain, `src/config/base/${domain}.json`]),
      ['texts', 'src/data/texts.json'],
    ]) as DomainsResponse['domains'];
    const { status, body } = await this.post<DomainsResponse | { ok: false; error?: string }>('/__config/domains', {});
    if (status !== 200 || !body.ok || !('domains' in body)) {
      throw new ConfigEndpointError('无法读取可写配置域', status);
    }
    return body.domains;
  }

  async load(path: string): Promise<unknown> {
    if (import.meta.env.PROD) {
      if (path.endsWith('/texts.json')) return structuredClone(texts);
      const domain = path.match(/\/([^/]+)\.json$/)?.[1] as keyof typeof cfg | undefined;
      if (domain && domain in cfg) return structuredClone(cfg[domain]);
      throw new ConfigEndpointError(`无法读取 ${path}`, 404);
    }
    const url = `/${path.replace(/^\/+/, '')}`;
    const response = await this.fetcher(url, { cache: 'no-store' });
    if (!response.ok) throw new ConfigEndpointError(`无法读取 ${path}`, response.status);
    return await response.json() as unknown;
  }

  async validate(domain: EditorDomain, data: unknown): Promise<ValidationReportDto> {
    if (import.meta.env.PROD) {
      const candidate = structuredClone(cfg);
      const candidateTexts = domain === 'texts' ? data : texts;
      if (domain !== 'texts') (candidate as unknown as Record<string, unknown>)[domain] = structuredClone(data);
      return validateGameConfig(candidate, candidateTexts as typeof texts) as ValidationReportDto;
    }
    const { status, body } = await this.post<ValidateResponse | { ok: false; error?: string }>(
      '/__config/validate', { domain, data },
    );
    if (status !== 200 || !('report' in body)) {
      throw new ConfigEndpointError(('error' in body && body.error) || `校验 ${domain} 失败`, status);
    }
    return body.report;
  }

  /** 校验磁盘上的完整现状；内容工作台启动时用它取得只读基线报告。 */
  async validateCurrent(): Promise<ValidationReportDto> {
    if (import.meta.env.PROD) return validateGameConfig(structuredClone(cfg), structuredClone(texts)) as ValidationReportDto;
    const { status, body } = await this.post<ValidateResponse | { ok: false; error?: string }>(
      '/__config/validate', {},
    );
    if (status !== 200 || !('report' in body)) {
      throw new ConfigEndpointError(('error' in body && body.error) || '校验当前配置失败', status);
    }
    return body.report;
  }

  async write(domain: EditorDomain, data: unknown): Promise<WriteResponse> {
    if (import.meta.env.PROD) return { ok: false, error: '只读演示模式：静态部署不执行写回。' };
    const { status, body } = await this.post<WriteResponse>('/__config/write', { domain, data });
    if (status === 200 || status === 422) return body;
    throw new ConfigEndpointError(body.error ?? `写入 ${domain} 失败`, status, body);
  }
}
