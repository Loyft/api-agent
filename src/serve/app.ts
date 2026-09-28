import { Hono } from "hono";
import { listSites, loadSite, loadOpenApi } from "../registry/store.js";
import { proxyCall } from "./proxy.js";
import { getDataDir, getRegistryDir } from "../util/paths.js";

export function createApp(): Hono {
  const app = new Hono();

  app.get("/", (c) =>
    c.json({
      name: "api-agent",
      message: "Local website-to-API gateway",
      endpoints: {
        health: "/health",
        list: "/v1",
        site: "/v1/:site",
        openapi: "/v1/:site/openapi.yaml",
        call: "/v1/:site/:route",
      },
    }),
  );

  app.get("/health", async (c) => {
    const sites = await listSites();
    return c.json({
      ok: true,
      registryPath: getRegistryDir(),
      dataDir: getDataDir(),
      siteCount: sites.length,
    });
  });

  app.get("/v1", async (c) => {
    const sites = await listSites();
    return c.json({
      sites: sites.map((s) => ({
        slug: s.slug,
        name: s.name,
        sourceUrl: s.sourceUrl,
        task: s.task,
        endpoints: s.endpoints.map((e) => ({
          slug: e.slug,
          method: e.method,
          path: e.publicPath,
          description: e.description,
          params: e.params,
        })),
      })),
    });
  });

  app.get("/v1/:site/openapi.yaml", async (c) => {
    const yaml = await loadOpenApi(c.req.param("site"));
    if (!yaml) return c.json({ error: { code: "site_not_found", message: "Unknown site" } }, 404);
    return c.body(yaml, 200, { "Content-Type": "application/yaml; charset=utf-8" });
  });

  app.get("/v1/:site", async (c) => {
    const site = await loadSite(c.req.param("site"));
    if (!site) return c.json({ error: { code: "site_not_found", message: "Unknown site" } }, 404);
    return c.json({
      slug: site.slug,
      name: site.name,
      sourceUrl: site.sourceUrl,
      task: site.task,
      endpoints: site.endpoints.map((e) => ({
        slug: e.slug,
        method: e.method,
        path: e.publicPath,
        description: e.description,
        params: e.params,
        upstreamUrlTemplate: e.upstreamUrlTemplate,
      })),
    });
  });

  app.all("/v1/:site/:route", async (c) => {
    const siteSlug = c.req.param("site");
    const routeSlug = c.req.param("route");
    const site = await loadSite(siteSlug);
    if (!site) {
      return c.json({ error: { code: "site_not_found", message: `Unknown site "${siteSlug}"` } }, 404);
    }
    const endpoint = site.endpoints.find((e) => e.slug === routeSlug);
    if (!endpoint) {
      return c.json(
        {
          error: {
            code: "route_not_found",
            message: `Unknown route "${routeSlug}" for site "${siteSlug}"`,
            available: site.endpoints.map((e) => e.slug),
          },
        },
        404,
      );
    }

    if (c.req.method !== endpoint.method && !(c.req.method === "GET" && endpoint.method === "GET")) {
      // Allow GET for GET; for others require matching method
      if (c.req.method !== endpoint.method) {
        return c.json(
          {
            error: {
              code: "method_not_allowed",
              message: `Use ${endpoint.method} for this route`,
            },
          },
          405,
        );
      }
    }

    const params: Record<string, string> = {};
    // Query params
    const url = new URL(c.req.url);
    for (const [k, v] of url.searchParams.entries()) {
      params[k] = v;
    }
    // JSON body params
    if (["POST", "PUT", "PATCH"].includes(c.req.method)) {
      try {
        const body = await c.req.json();
        if (body && typeof body === "object") {
          for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
            if (v !== undefined && v !== null) params[k] = String(v);
          }
        }
      } catch {
        // no body
      }
    }

    const result = await proxyCall({ endpoint, params });
    if (!result.ok) {
      return c.json(
        {
          error: {
            code: "upstream_error",
            message: result.error ?? "Upstream request failed",
            status: result.status,
            url: result.url,
          },
          body: result.body,
        },
        result.status && result.status >= 400 ? (result.status as 502) : 502,
      );
    }

    return c.json({
      source: site.sourceUrl,
      site: site.slug,
      route: endpoint.slug,
      upstream_url: result.url,
      data: result.body,
    });
  });

  return app;
}
