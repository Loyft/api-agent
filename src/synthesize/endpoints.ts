import { randomUUID } from "node:crypto";
import type {
  CapturedRequest,
  CaptureTrace,
  EndpointDefinition,
  EndpointParam,
  SiteApi,
} from "../types.js";
import { siteSlugFromUrl, routeSlugFromUrl, slugify } from "../util/slug.js";
import { inferJsonSchema, topLevelFieldNames } from "./schema.js";
import { buildOpenApiYaml } from "./openapi.js";
import { saveSite } from "../registry/store.js";
import { defaultPort } from "../util/paths.js";

const BROWSER_ONLY_HEADERS = new Set([
  "cookie",
  "origin",
  "referer",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-user",
  "upgrade-insecure-requests",
  "user-agent",
  "accept-encoding",
  "accept-language",
  "connection",
  "host",
  "content-length",
  "pragma",
  "cache-control",
]);

const KEEP_HEADER_HINTS = [
  "authorization",
  "x-api-key",
  "api-key",
  "x-auth",
  "x-access",
  "x-csrf",
  "x-requested-with",
  "accept",
  "content-type",
];

function registrableHost(hostname: string): string {
  const parts = hostname.replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

function relatedHost(sourceUrl: string, requestUrl: string): boolean {
  try {
    const a = registrableHost(new URL(sourceUrl).hostname);
    const b = registrableHost(new URL(requestUrl).hostname);
    if (a === b) return true;
    // Common API subdomains / CDNs sharing brand token
    const brand = a.split(".")[0];
    return brand.length >= 3 && b.includes(brand);
  } catch {
    return false;
  }
}

function scoreRequest(req: CapturedRequest, sourceUrl: string, task: string): number {
  let score = 0;
  if (relatedHost(sourceUrl, req.url)) score += 5;
  if (req.method === "GET") score += 2;
  if (req.method === "POST") score += 1;
  if (req.status === 200) score += 1;

  const urlLower = req.url.toLowerCase();
  const taskTokens = task
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);

  for (const token of taskTokens) {
    if (urlLower.includes(token)) score += 2;
  }

  const fields = topLevelFieldNames(req.responseBody).map((f) => f.toLowerCase());
  for (const token of taskTokens) {
    if (fields.some((f) => f.includes(token) || token.includes(f))) score += 3;
  }

  // Prefer list-shaped or object with several fields
  if (Array.isArray(req.responseBody) && req.responseBody.length > 0) score += 6;
  else if (fields.includes("hits") || fields.includes("results") || fields.includes("items") || fields.includes("data")) {
    score += 8;
  } else if (fields.length >= 3) score += 2;

  // Prefer URLs that look like data APIs
  if (/\/(api|search|query|v1|v2|graphql)\b/i.test(req.url)) score += 4;

  // Deprioritize analytics / tracking / health / config noise
  if (
    /google-analytics|segment\.|sentry|hotjar|doubleclick|facebook|pixel|isalive|health|settings|config\.js|beacon|telemetry|metrics/i.test(
      req.url,
    )
  ) {
    score -= 25;
  }

  // Tiny / empty responses are usually probes
  const size = JSON.stringify(req.responseBody ?? "").length;
  if (size < 40) score -= 10;
  if (size > 500) score += 3;

  return score;
}

function extractRequiredHeaders(req: CapturedRequest): Record<string, string> {
  const out: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
  };
  for (const h of req.requestHeaders) {
    const name = h.name.toLowerCase();
    if (BROWSER_ONLY_HEADERS.has(name)) continue;
    if (KEEP_HEADER_HINTS.some((hint) => name.includes(hint))) {
      out[h.name] = h.value;
    }
  }
  return out;
}

function parameterizeUrl(
  url: string,
  task: string,
  requestBody: string | null = null,
): { template: string; params: EndpointParam[] } {
  const u = new URL(url);
  const params: EndpointParam[] = [];
  const taskTokens = new Set(
    task
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1),
  );

  // Query params - all become optional public params
  for (const [key, value] of u.searchParams.entries()) {
    params.push({
      name: key,
      in: "query",
      required: false,
      example: value,
      description: `Maps to upstream query param "${key}"`,
      upstreamName: key,
    });
  }

  // Path segments that look like resource IDs → {param}
  // Skip short numeric version segments (e.g. /api/v1/ or /1/indexes/)
  const segments = u.pathname.split("/").filter(Boolean);
  const newSegments = segments.map((seg, idx) => {
    const isVersionish = /^\d{1,2}$/.test(seg) && idx <= 1;
    const isId = !isVersionish && (/^\d{3,}$/.test(seg) || /^[0-9a-f]{8,}$/i.test(seg));
    if (isId) {
      const name = "id";
      if (!params.some((p) => p.name === name && p.in === "path")) {
        params.push({
          name,
          in: "path",
          required: true,
          example: seg,
          description: "Path identifier",
        });
      }
      return `{${name}}`;
    }
    return seg;
  });

  u.pathname = "/" + newSegments.join("/");

  // JSON body fields → body params (shallow)
  if (requestBody) {
    try {
      const parsed = JSON.parse(requestBody) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            const lower = key.toLowerCase();
            const looksUseful =
              /^(q|query|search|symbol|ticker|id|page|limit|offset|tags)$/i.test(key) ||
              taskTokens.has(lower);
            params.push({
              name: key,
              in: "body",
              required: looksUseful,
              example: value as string | number | boolean,
              description: `Maps to upstream JSON body field "${key}"`,
              upstreamName: key,
            });
          }
        }
      }
    } catch {
      /* ignore non-json bodies */
    }
  }

  const template = `${u.origin}${u.pathname}`;
  return { template, params };
}

function buildUpstreamUrlTemplate(url: string, params: EndpointParam[]): string {
  const u = new URL(url);
  // Replace path ids
  const segments = u.pathname.split("/").filter(Boolean);
  const pathParams = params.filter((p) => p.in === "path");
  let pathIdx = 0;
  const newSegments = segments.map((seg, idx) => {
    const isVersionish = /^\d{1,2}$/.test(seg) && idx <= 1;
    const isId = !isVersionish && (/^\d{3,}$/.test(seg) || /^[0-9a-f]{8,}$/i.test(seg));
    if (isId) {
      const p = pathParams[pathIdx++] ?? pathParams[0];
      return p ? `{${p.name}}` : seg;
    }
    return seg;
  });
  u.pathname = "/" + newSegments.join("/");

  // Query: replace values with {name} placeholders for known params
  const queryParams = params.filter((p) => p.in === "query");
  if (queryParams.length > 0) {
    u.search = "";
    for (const p of queryParams) {
      const key = p.upstreamName ?? p.name;
      u.searchParams.set(key, `{${p.name}}`);
    }
  }

  return u.toString().replace(/%7B/gi, "{").replace(/%7D/gi, "}");
}

function describeEndpoint(req: CapturedRequest, task: string): string {
  const fields = topLevelFieldNames(req.responseBody);
  const fieldHint = fields.length ? ` Fields: ${fields.slice(0, 8).join(", ")}.` : "";
  return `Replay of ${req.method} ${new URL(req.url).pathname} for: ${task}.${fieldHint}`;
}

export interface SynthesizeOptions {
  trace: CaptureTrace;
  name?: string;
  slug?: string;
  maxEndpoints?: number;
  port?: number;
}

export interface SynthesizeResult {
  site: SiteApi;
  openApiYaml: string;
  candidatesConsidered: number;
  rejectedReason?: string;
}

export function synthesizeEndpoints(options: SynthesizeOptions): SynthesizeResult {
  const { trace, maxEndpoints = 5, port = defaultPort() } = options;
  const scored = trace.requests
    .map((req) => ({ req, score: scoreRequest(req, trace.sourceUrl, trace.task) }))
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      site: emptySite(trace, options),
      openApiYaml: "",
      candidatesConsidered: trace.requests.length,
      rejectedReason:
        "no JSON XHR/fetch found; HTML-only sites are out of MVP scope. Try a page that loads data via JSON APIs.",
    };
  }

  const picked = scored.slice(0, maxEndpoints);
  const slug = options.slug ?? siteSlugFromUrl(trace.sourceUrl);
  const name = options.name ?? slug;
  const now = new Date().toISOString();

  const usedSlugs: string[] = [];
  const endpoints: EndpointDefinition[] = picked.map(({ req }, index) => {
    const { params } = parameterizeUrl(req.url, trace.task, req.requestBody);
    const routeSlug = uniqueSlug(routeSlugFromUrl(req.url, index), usedSlugs);
    usedSlugs.push(routeSlug);
    const publicPath = `/v1/${slug}/${routeSlug}`;
    return {
      id: randomUUID(),
      slug: routeSlug,
      method: req.method,
      publicPath,
      description: describeEndpoint(req, trace.task),
      upstreamUrlTemplate: buildUpstreamUrlTemplate(req.url, params),
      params,
      requiredHeaders: extractRequiredHeaders(req),
      sampleResponse: req.responseBody,
      responseSchema: inferJsonSchema(req.responseBody),
      createdAt: now,
    };
  });

  const site: SiteApi = {
    slug,
    name,
    sourceUrl: trace.sourceUrl,
    task: trace.task,
    createdAt: now,
    updatedAt: now,
    endpoints,
    traceId: trace.id,
  };

  const openApiYaml = buildOpenApiYaml(site, port);
  return {
    site,
    openApiYaml,
    candidatesConsidered: trace.requests.length,
  };
}

function emptySite(trace: CaptureTrace, options: SynthesizeOptions): SiteApi {
  const now = new Date().toISOString();
  return {
    slug: options.slug ?? siteSlugFromUrl(trace.sourceUrl),
    name: options.name ?? siteSlugFromUrl(trace.sourceUrl),
    sourceUrl: trace.sourceUrl,
    task: trace.task,
    createdAt: now,
    updatedAt: now,
    endpoints: [],
    traceId: trace.id,
  };
}

function uniqueSlug(base: string, existing: string[]): string {
  let candidate = slugify(base);
  let i = 2;
  while (existing.includes(candidate)) {
    candidate = `${slugify(base)}-${i++}`;
  }
  return candidate;
}

export async function synthesizeAndSave(options: SynthesizeOptions): Promise<SynthesizeResult> {
  const result = synthesizeEndpoints(options);
  if (result.site.endpoints.length === 0) {
    return result;
  }
  await saveSite(result.site, result.openApiYaml);
  return result;
}
