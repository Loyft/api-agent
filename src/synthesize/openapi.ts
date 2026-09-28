import { stringify } from "yaml";
import type { SiteApi } from "../types.js";
import { defaultPort } from "../util/paths.js";

export function buildOpenApiDocument(site: SiteApi, port = defaultPort()): Record<string, unknown> {
  const paths: Record<string, unknown> = {};

  for (const ep of site.endpoints) {
    const method = ep.method.toLowerCase();
    const parameters = ep.params
      .filter((p) => p.in === "query" || p.in === "path" || p.in === "header")
      .map((p) => ({
        name: p.name,
        in: p.in,
        required: p.required,
        description: p.description ?? "",
        schema: { type: typeof p.example === "number" ? "number" : "string" },
        ...(p.example !== undefined ? { example: p.example } : {}),
      }));

    const operation: Record<string, unknown> = {
      operationId: `${site.slug}_${ep.slug}`,
      summary: ep.description,
      tags: [site.slug],
      parameters,
      responses: {
        "200": {
          description: "Upstream JSON replay",
          content: {
            "application/json": {
              schema: ep.responseSchema,
              example: ep.sampleResponse,
            },
          },
        },
      },
    };

    if (ep.method === "POST" || ep.method === "PUT" || ep.method === "PATCH") {
      const bodyParams = ep.params.filter((p) => p.in === "body");
      if (bodyParams.length > 0) {
        operation.requestBody = {
          required: bodyParams.some((p) => p.required),
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: Object.fromEntries(
                  bodyParams.map((p) => [
                    p.name,
                    { type: typeof p.example === "number" ? "number" : "string", example: p.example },
                  ]),
                ),
              },
            },
          },
        };
      }
    }

    const existing = (paths[ep.publicPath] as Record<string, unknown> | undefined) ?? {};
    paths[ep.publicPath] = { ...existing, [method]: operation };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: `${site.name} API`,
      description: `Local gateway for ${site.sourceUrl}\n\nTask: ${site.task}`,
      version: "0.1.0",
    },
    servers: [{ url: `http://127.0.0.1:${port}`, description: "api-agent local gateway" }],
    paths,
  };
}

export function buildOpenApiYaml(site: SiteApi, port = defaultPort()): string {
  return stringify(buildOpenApiDocument(site, port), {
    lineWidth: 100,
    aliasDuplicateObjects: false,
  });
}
