import { randomUUID } from "node:crypto";
import { chromium, type Response } from "playwright";
import type { CapturedHeader, CapturedRequest, CaptureTrace, HttpMethod } from "../types.js";
import { saveTrace } from "../registry/store.js";

const JSONISH = /application\/json|application\/.*\+json|text\/json/i;

function headersToList(headers: Record<string, string>): CapturedHeader[] {
  return Object.entries(headers).map(([name, value]) => ({ name, value }));
}

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return JSONISH.test(contentType);
}

function lookLikeJsonBody(body: string): boolean {
  const trimmed = body.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

async function tryParseJson(response: Response): Promise<{
  body: unknown;
  contentType: string | null;
  ok: boolean;
}> {
  const contentType = response.headers()["content-type"] ?? null;
  try {
    const text = await response.text();
    if (!text) return { body: null, contentType, ok: false };
    if (isJsonContentType(contentType) || lookLikeJsonBody(text)) {
      try {
        return { body: JSON.parse(text), contentType, ok: true };
      } catch {
        return { body: text, contentType, ok: false };
      }
    }
    return { body: null, contentType, ok: false };
  } catch {
    return { body: null, contentType, ok: false };
  }
}

export interface CaptureOptions {
  sourceUrl: string;
  task: string;
  /** Extra wait after load for lazy XHR (ms) */
  settleMs?: number;
  headless?: boolean;
  /** Optional text to type into a search-like input before waiting */
  interactQuery?: string;
}

export async function captureSite(options: CaptureOptions): Promise<CaptureTrace> {
  const {
    sourceUrl,
    task,
    settleMs = 2500,
    headless = true,
    interactQuery,
  } = options;

  const startedAt = new Date().toISOString();
  const requests: CapturedRequest[] = [];
  const seen = new Set<string>();

  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    page.on("response", async (response) => {
      try {
        const request = response.request();
        const resourceType = request.resourceType();
        if (resourceType !== "xhr" && resourceType !== "fetch") return;

        const method = request.method().toUpperCase() as HttpMethod;
        const url = response.url();
        const status = response.status();
        if (status < 200 || status >= 400) return;

        const key = `${method}:${url}`;
        if (seen.has(key)) return;

        const parsed = await tryParseJson(response);
        if (!parsed.ok) return;

        seen.add(key);

        let requestBody: string | null = null;
        try {
          requestBody = request.postData() ?? null;
        } catch {
          requestBody = null;
        }

        const captured: CapturedRequest = {
          id: randomUUID(),
          method,
          url,
          resourceType,
          requestHeaders: headersToList(request.headers()),
          requestBody,
          status,
          responseHeaders: headersToList(response.headers()),
          responseBody: parsed.body,
          contentType: parsed.contentType,
          capturedAt: new Date().toISOString(),
        };
        requests.push(captured);
      } catch {
        // Ignore individual response parse failures
      }
    });

    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

    if (interactQuery) {
      const selectors = [
        'input[type="search"]',
        'input[name="q"]',
        'input[name="query"]',
        'input[placeholder*="Search" i]',
        'input[aria-label*="Search" i]',
        'input[type="text"]',
      ];
      for (const sel of selectors) {
        const el = page.locator(sel).first();
        if ((await el.count()) > 0) {
          await el.fill(interactQuery);
          await el.press("Enter").catch(() => undefined);
          await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
          break;
        }
      }
    }

    await page.waitForTimeout(settleMs);
    await context.close();
  } finally {
    await browser.close();
  }

  const finishedAt = new Date().toISOString();
  const trace: CaptureTrace = {
    id: randomUUID(),
    sourceUrl,
    task,
    startedAt,
    finishedAt,
    requests,
  };

  await saveTrace(trace);
  return trace;
}
