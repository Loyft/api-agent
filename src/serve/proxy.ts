import type { EndpointDefinition, EndpointParam } from "../types.js";

export interface ProxyCallInput {
  endpoint: EndpointDefinition;
  params: Record<string, string>;
}

export interface ProxyCallResult {
  ok: boolean;
  status: number;
  url: string;
  body: unknown;
  error?: string;
}

function applyTemplate(template: string, params: Record<string, string>, epParams: EndpointParam[]): string {
  let url = template;
  for (const p of epParams) {
    const value = params[p.name] ?? (p.example !== undefined ? String(p.example) : undefined);
    if (value === undefined) continue;
    url = url.replaceAll(`{${p.name}}`, encodeURIComponent(value));
  }
  // For any remaining {placeholders} without values, leave or strip
  return url;
}

function buildUrl(endpoint: EndpointDefinition, params: Record<string, string>): string {
  // Start from template; fill placeholders
  let url = applyTemplate(endpoint.upstreamUrlTemplate, params, endpoint.params);

  // If template has no query placeholders but caller passed query params, append them
  const u = new URL(url.replace(/\{[^}]+\}/g, (m) => {
    // Unfilled placeholders: try to use example from param def
    const name = m.slice(1, -1);
    const p = endpoint.params.find((x) => x.name === name);
    if (params[name] !== undefined) return encodeURIComponent(params[name]);
    if (p?.example !== undefined) return encodeURIComponent(String(p.example));
    return "";
  }));

  for (const p of endpoint.params.filter((x) => x.in === "query")) {
    const key = p.upstreamName ?? p.name;
    const value = params[p.name] ?? (p.example !== undefined ? String(p.example) : undefined);
    if (value === undefined) continue;
    // Template may already have set it via placeholder
    if (!u.searchParams.has(key) || u.searchParams.get(key) === "" || u.searchParams.get(key)?.includes("{")) {
      u.searchParams.set(key, value);
    }
  }

  return u.toString();
}

function buildBody(
  endpoint: EndpointDefinition,
  params: Record<string, string>,
): string | undefined {
  if (!["POST", "PUT", "PATCH"].includes(endpoint.method)) return undefined;
  const bodyParams = endpoint.params.filter((p) => p.in === "body");
  if (bodyParams.length === 0) return undefined;
  const obj: Record<string, string> = {};
  for (const p of bodyParams) {
    const value = params[p.name] ?? (p.example !== undefined ? String(p.example) : undefined);
    if (value !== undefined) obj[p.upstreamName ?? p.name] = value;
  }
  return JSON.stringify(obj);
}

export async function proxyCall(input: ProxyCallInput): Promise<ProxyCallResult> {
  const { endpoint, params } = input;
  const url = buildUrl(endpoint, params);
  const headers: Record<string, string> = { ...endpoint.requiredHeaders };
  const body = buildBody(endpoint, params);
  if (body && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(url, {
      method: endpoint.method,
      headers,
      body,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }
    return {
      ok: res.ok,
      status: res.status,
      url,
      body: parsed,
      error: res.ok ? undefined : `Upstream returned ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      url,
      body: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
