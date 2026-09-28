export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface CapturedHeader {
  name: string;
  value: string;
}

export interface CapturedRequest {
  id: string;
  method: HttpMethod;
  url: string;
  resourceType: string;
  requestHeaders: CapturedHeader[];
  requestBody: string | null;
  status: number;
  responseHeaders: CapturedHeader[];
  responseBody: unknown;
  contentType: string | null;
  capturedAt: string;
}

export interface CaptureTrace {
  id: string;
  sourceUrl: string;
  task: string;
  startedAt: string;
  finishedAt: string;
  requests: CapturedRequest[];
}

export type ParamLocation = "query" | "path" | "body" | "header";

export interface EndpointParam {
  name: string;
  in: ParamLocation;
  required: boolean;
  description?: string;
  example?: string | number | boolean;
  /** Original query/path/body key when different from public name */
  upstreamName?: string;
}

export interface EndpointDefinition {
  id: string;
  slug: string;
  method: HttpMethod;
  /** Public path under the gateway, e.g. /v1/hn/top-stories */
  publicPath: string;
  description: string;
  upstreamUrlTemplate: string;
  params: EndpointParam[];
  /** Headers required for successful upstream replay */
  requiredHeaders: Record<string, string>;
  /** Sample JSON response from capture */
  sampleResponse: unknown;
  /** JSON Schema (draft-ish) inferred from sample */
  responseSchema: Record<string, unknown>;
  createdAt: string;
}

export interface SiteApi {
  slug: string;
  name: string;
  sourceUrl: string;
  task: string;
  createdAt: string;
  updatedAt: string;
  endpoints: EndpointDefinition[];
  traceId: string;
}

export interface RegistryIndex {
  version: 1;
  sites: Array<{
    slug: string;
    name: string;
    sourceUrl: string;
    endpointCount: number;
    updatedAt: string;
  }>;
}

export interface ServerStatus {
  running: boolean;
  port: number;
  baseUrl: string;
  pid?: number;
  registryPath: string;
  siteCount: number;
}
