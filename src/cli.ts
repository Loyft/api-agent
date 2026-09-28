#!/usr/bin/env node
import { Command } from "commander";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { serve } from "@hono/node-server";
import { captureSite } from "./capture/playwright.js";
import { synthesizeAndSave } from "./synthesize/endpoints.js";
import {
  listSites,
  loadSite,
  loadOpenApi,
  getRegistrySummary,
  saveSite,
} from "./registry/store.js";
import { createApp } from "./serve/app.js";
import { proxyCall } from "./serve/proxy.js";
import { printJson, fail } from "./util/json.js";
import {
  defaultPort,
  getDataDir,
  getPidPath,
  getPortPath,
} from "./util/paths.js";
import { buildOpenApiYaml } from "./synthesize/openapi.js";
import type { EndpointDefinition, SiteApi } from "./types.js";
import { randomUUID } from "node:crypto";

const program = new Command();

program
  .name("api-agent")
  .description("Turn websites into local callable JSON APIs")
  .version("0.1.0");

program
  .command("create")
  .description("Capture a website and synthesize local API endpoints")
  .argument("<url>", "Website URL to capture")
  .requiredOption("-t, --task <text>", "Describe the data you need")
  .option("-n, --name <slug>", "Site slug / name override")
  .option("--interact <query>", "Type this into a search box during capture")
  .option("--headed", "Run browser headed (debug)", false)
  .option("--max-endpoints <n>", "Max endpoints to keep", "5")
  .action(async (url: string, opts) => {
    let sourceUrl = url;
    try {
      sourceUrl = new URL(url).toString();
    } catch {
      fail("invalid_url", `Not a valid URL: ${url}`);
    }

    printJson({ phase: "capturing", sourceUrl, task: opts.task });

    let trace;
    try {
      trace = await captureSite({
        sourceUrl,
        task: opts.task,
        headless: !opts.headed,
        interactQuery: opts.interact,
      });
    } catch (err) {
      fail("capture_failed", err instanceof Error ? err.message : String(err));
    }

    const result = await synthesizeAndSave({
      trace,
      name: opts.name,
      slug: opts.name,
      maxEndpoints: Number(opts.maxEndpoints) || 5,
      port: defaultPort(),
    });

    if (result.site.endpoints.length === 0) {
      fail("no_json_api", result.rejectedReason ?? "No replayable JSON endpoints found", {
        candidatesConsidered: result.candidatesConsidered,
        traceId: trace.id,
        suggested_action:
          "Open a page that loads live data via XHR/fetch JSON. HTML-only sites are out of MVP scope.",
      });
    }

    printJson({
      ok: true,
      phase: "live",
      site: {
        slug: result.site.slug,
        name: result.site.name,
        sourceUrl: result.site.sourceUrl,
        task: result.site.task,
        endpointCount: result.site.endpoints.length,
        endpoints: result.site.endpoints.map((e) => ({
          slug: e.slug,
          method: e.method,
          path: e.publicPath,
          params: e.params.map((p) => p.name),
          example_cli: `api-agent call ${result.site.slug} ${e.slug}`,
        })),
      },
      traceId: trace.id,
      candidatesConsidered: result.candidatesConsidered,
      docs_cmd: `api-agent docs ${result.site.slug}`,
      serve_hint: `api-agent serve  # then GET http://127.0.0.1:${defaultPort()}/v1/${result.site.slug}`,
    });
  });

program
  .command("serve")
  .description("Start the local API gateway")
  .option("-p, --port <n>", "Port", String(defaultPort()))
  .option("--foreground", "Run in foreground (default)", true)
  .action(async (opts) => {
    const port = Number(opts.port) || defaultPort();
    await mkdir(getDataDir(), { recursive: true });
    const app = createApp();

    await writeFile(getPidPath(), String(process.pid), "utf8");
    await writeFile(getPortPath(), String(port), "utf8");

    const cleanup = async () => {
      try {
        await unlink(getPidPath());
      } catch {
        /* ignore */
      }
      try {
        await unlink(getPortPath());
      } catch {
        /* ignore */
      }
    };

    process.on("SIGINT", async () => {
      await cleanup();
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      await cleanup();
      process.exit(0);
    });

    serve(
      {
        fetch: app.fetch,
        port,
        createServer,
      },
      (info) => {
        printJson({
          ok: true,
          phase: "listening",
          port: info.port,
          baseUrl: `http://127.0.0.1:${info.port}`,
          pid: process.pid,
          health: `http://127.0.0.1:${info.port}/health`,
        });
      },
    );
  });

program
  .command("status")
  .description("Show gateway and registry status")
  .action(async () => {
    const summary = await getRegistrySummary();
    let running = false;
    let pid: number | undefined;
    let port = defaultPort();

    try {
      const pidRaw = await readFile(getPidPath(), "utf8");
      pid = Number(pidRaw.trim());
      if (pid > 0) {
        try {
          process.kill(pid, 0);
          running = true;
        } catch {
          running = false;
        }
      }
    } catch {
      running = false;
    }

    try {
      const portRaw = await readFile(getPortPath(), "utf8");
      port = Number(portRaw.trim()) || defaultPort();
    } catch {
      /* default */
    }

    // Also probe health if claimed running
    if (running) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(1500),
        });
        running = res.ok;
      } catch {
        running = false;
      }
    }

    printJson({
      running,
      port,
      baseUrl: `http://127.0.0.1:${port}`,
      pid: running ? pid : undefined,
      registryPath: summary.registryPath,
      dataDir: getDataDir(),
      siteCount: summary.siteCount,
    });
  });

program
  .command("list")
  .description("List synthesized site APIs")
  .action(async () => {
    const sites = await listSites();
    printJson({
      sites: sites.map((s) => ({
        slug: s.slug,
        name: s.name,
        sourceUrl: s.sourceUrl,
        task: s.task,
        endpointCount: s.endpoints.length,
        endpoints: s.endpoints.map((e) => e.slug),
        updatedAt: s.updatedAt,
      })),
    });
  });

program
  .command("docs")
  .description("Show routes and OpenAPI for a site")
  .argument("<site>", "Site slug")
  .option("--openapi", "Print OpenAPI YAML only", false)
  .action(async (siteSlug: string, opts) => {
    const site = await loadSite(siteSlug);
    if (!site) fail("site_not_found", `Unknown site "${siteSlug}". Run api-agent list.`);
    if (opts.openapi) {
      const yaml = await loadOpenApi(siteSlug);
      if (!yaml) fail("openapi_missing", "OpenAPI file missing for site");
      process.stdout.write(yaml.endsWith("\n") ? yaml : `${yaml}\n`);
      return;
    }
    printJson({
      site: {
        slug: site.slug,
        name: site.name,
        sourceUrl: site.sourceUrl,
        task: site.task,
      },
      routes: site.endpoints.map((e) => ({
        slug: e.slug,
        method: e.method,
        path: e.publicPath,
        description: e.description,
        parameters: e.params,
        upstreamUrlTemplate: e.upstreamUrlTemplate,
        example_cli: exampleCli(site.slug, e),
        example_curl: `curl "http://127.0.0.1:${defaultPort()}${e.publicPath}${exampleQuery(e)}"`,
      })),
      openapi_cmd: `api-agent docs ${site.slug} --openapi`,
    });
  });

program
  .command("call")
  .description("Invoke a synthesized route (via upstream replay)")
  .argument("<site>", "Site slug")
  .argument("<route>", "Route slug")
  .option("--via-gateway", "Call local gateway instead of direct upstream", false)
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action(async (siteSlug: string, routeSlug: string, opts) => {
    const site = await loadSite(siteSlug);
    if (!site) fail("site_not_found", `Unknown site "${siteSlug}"`);
    const endpoint = site.endpoints.find((e) => e.slug === routeSlug);
    if (!endpoint) {
      fail("route_not_found", `Unknown route "${routeSlug}"`, {
        available: site.endpoints.map((e) => e.slug),
      });
    }

    const params = parseParamFlags(collectDashedArgs());

    if (opts.viaGateway) {
      const port = await readPort();
      const qs = new URLSearchParams(params).toString();
      const url = `http://127.0.0.1:${port}${endpoint.publicPath}${qs ? `?${qs}` : ""}`;
      try {
        const res = await fetch(url, { method: endpoint.method });
        const body = await res.json();
        printJson(body);
        if (!res.ok) process.exit(1);
      } catch (err) {
        fail("gateway_unreachable", err instanceof Error ? err.message : String(err), {
          suggested_action: "Run `api-agent serve` first, or omit --via-gateway.",
        });
      }
      return;
    }

    const result = await proxyCall({ endpoint, params });
    if (!result.ok) {
      fail("upstream_error", result.error ?? "Upstream failed", {
        status: result.status,
        url: result.url,
        body: result.body,
      });
    }
    printJson({
      source: site.sourceUrl,
      site: site.slug,
      route: endpoint.slug,
      upstream_url: result.url,
      data: result.body,
    });
  });

program
  .command("seed-sample")
  .description("Install hand-written sample sites (HN + CoinGecko) without browser capture")
  .action(async () => {
    const now = new Date().toISOString();
    const hnEndpoint: EndpointDefinition = {
      id: randomUUID(),
      slug: "search-stories",
      method: "GET",
      publicPath: "/v1/hn/search-stories",
      description: "Search Hacker News stories via Algolia public API",
      upstreamUrlTemplate: "https://hn.algolia.com/api/v1/search?query={query}&tags=story",
      params: [
        {
          name: "query",
          in: "query",
          required: true,
          example: "ai",
          description: "Search query",
        },
      ],
      requiredHeaders: { Accept: "application/json" },
      sampleResponse: {
        hits: [{ title: "Example", url: "https://example.com", points: 1 }],
        nbHits: 1,
      },
      responseSchema: {
        type: "object",
        properties: {
          hits: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                url: { type: "string" },
                points: { type: "integer" },
              },
            },
          },
          nbHits: { type: "integer" },
        },
      },
      createdAt: now,
    };

    const hn: SiteApi = {
      slug: "hn",
      name: "Hacker News",
      sourceUrl: "https://news.ycombinator.com",
      task: "Search stories and return title, url, points",
      createdAt: now,
      updatedAt: now,
      endpoints: [hnEndpoint],
      traceId: "seed-sample",
    };

    const cgEndpoint: EndpointDefinition = {
      id: randomUUID(),
      slug: "simple-price",
      method: "GET",
      publicPath: "/v1/coingecko/simple-price",
      description: "Live crypto prices via CoinGecko simple/price API",
      upstreamUrlTemplate:
        "https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies={vs_currencies}",
      params: [
        {
          name: "ids",
          in: "query",
          required: true,
          example: "bitcoin",
          description: "Coin id (e.g. bitcoin, ethereum)",
        },
        {
          name: "vs_currencies",
          in: "query",
          required: true,
          example: "usd",
          description: "Fiat/crypto quote currencies",
        },
      ],
      requiredHeaders: { Accept: "application/json" },
      sampleResponse: { bitcoin: { usd: 0 } },
      responseSchema: {
        type: "object",
        additionalProperties: {
          type: "object",
          additionalProperties: { type: "number" },
        },
      },
      createdAt: now,
    };

    const cg: SiteApi = {
      slug: "coingecko",
      name: "CoinGecko",
      sourceUrl: "https://www.coingecko.com",
      task: "Live crypto prices in USD",
      createdAt: now,
      updatedAt: now,
      endpoints: [cgEndpoint],
      traceId: "seed-sample",
    };

    await saveSite(hn, buildOpenApiYaml(hn, defaultPort()));
    await saveSite(cg, buildOpenApiYaml(cg, defaultPort()));
    printJson({
      ok: true,
      sites: [
        {
          slug: "hn",
          endpoints: ["search-stories"],
          example_cli: 'api-agent call hn search-stories --query "ai"',
        },
        {
          slug: "coingecko",
          endpoints: ["simple-price"],
          example_cli: "api-agent call coingecko simple-price --ids bitcoin --vs_currencies usd",
        },
      ],
    });
  });

function exampleCli(site: string, e: EndpointDefinition): string {
  const flags = e.params
    .filter((p) => p.example !== undefined)
    .map((p) => `--${p.name} ${JSON.stringify(String(p.example))}`)
    .join(" ");
  return `api-agent call ${site} ${e.slug}${flags ? ` ${flags}` : ""}`;
}

function exampleQuery(e: EndpointDefinition): string {
  const parts = e.params
    .filter((p) => p.in === "query" && p.example !== undefined)
    .map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(String(p.example))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

function parseParamFlags(args: string[]): Record<string, string> {
  const params: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) continue;
    const body = a.slice(2);
    if (body.includes("=")) {
      const [k, ...rest] = body.split("=");
      params[k] = rest.join("=");
    } else {
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        params[body] = next;
        i++;
      } else {
        params[body] = "true";
      }
    }
  }
  return params;
}

/** Commander may swallow unknown dashed args; also read from process.argv after route */
function collectDashedArgs(): string[] {
  const argv = process.argv;
  const callIdx = argv.findIndex((a) => a === "call");
  if (callIdx < 0) return [];
  // skip: call <site> <route>
  return argv.slice(callIdx + 3).filter((a) => a.startsWith("--") || !a.startsWith("-"));
}

async function readPort(): Promise<number> {
  try {
    const raw = await readFile(getPortPath(), "utf8");
    return Number(raw.trim()) || defaultPort();
  } catch {
    return defaultPort();
  }
}

await program.parseAsync(process.argv);
