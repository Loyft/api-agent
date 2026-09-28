import { mkdir, readFile, writeFile, readdir, access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { constants } from "node:fs";
import type { CaptureTrace, RegistryIndex, SiteApi } from "../types.js";
import { getRegistryDir, getTracesDir } from "../util/paths.js";

async function ensureDirs(): Promise<void> {
  await mkdir(getRegistryDir(), { recursive: true });
  await mkdir(getTracesDir(), { recursive: true });
}

function sitePath(slug: string): string {
  return join(getRegistryDir(), `${slug}.json`);
}

function openApiPath(slug: string): string {
  return join(getRegistryDir(), `${slug}.openapi.yaml`);
}

function tracePath(id: string): string {
  return join(getTracesDir(), `${id}.json`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function saveTrace(trace: CaptureTrace): Promise<string> {
  await ensureDirs();
  const path = tracePath(trace.id);
  await writeFile(path, JSON.stringify(trace, null, 2), "utf8");
  return path;
}

export async function loadTrace(id: string): Promise<CaptureTrace | null> {
  const path = tracePath(id);
  if (!(await exists(path))) return null;
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as CaptureTrace;
}

export async function saveSite(site: SiteApi, openApiYaml: string): Promise<void> {
  await ensureDirs();
  await writeFile(sitePath(site.slug), JSON.stringify(site, null, 2), "utf8");
  await writeFile(openApiPath(site.slug), openApiYaml, "utf8");
  await rebuildIndex();
}

export async function loadSite(slug: string): Promise<SiteApi | null> {
  const path = sitePath(slug);
  if (!(await exists(path))) return null;
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as SiteApi;
}

export async function loadOpenApi(slug: string): Promise<string | null> {
  const path = openApiPath(slug);
  if (!(await exists(path))) return null;
  return readFile(path, "utf8");
}

export async function listSites(): Promise<SiteApi[]> {
  await ensureDirs();
  const files = await readdir(getRegistryDir());
  const sites: SiteApi[] = [];
  for (const file of files) {
    if (!file.endsWith(".json") || file === "index.json") continue;
    const raw = await readFile(join(getRegistryDir(), file), "utf8");
    sites.push(JSON.parse(raw) as SiteApi);
  }
  return sites.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function rebuildIndex(): Promise<RegistryIndex> {
  const sites = await listSites();
  const index: RegistryIndex = {
    version: 1,
    sites: sites.map((s) => ({
      slug: s.slug,
      name: s.name,
      sourceUrl: s.sourceUrl,
      endpointCount: s.endpoints.length,
      updatedAt: s.updatedAt,
    })),
  };
  await writeFile(join(getRegistryDir(), "index.json"), JSON.stringify(index, null, 2), "utf8");
  return index;
}

export async function deleteSite(slug: string): Promise<boolean> {
  const sp = sitePath(slug);
  const op = openApiPath(slug);
  let deleted = false;
  if (await exists(sp)) {
    await unlink(sp);
    deleted = true;
  }
  if (await exists(op)) {
    await unlink(op);
  }
  if (deleted) await rebuildIndex();
  return deleted;
}

export async function getRegistrySummary(): Promise<{
  registryPath: string;
  siteCount: number;
}> {
  await ensureDirs();
  const sites = await listSites();
  return {
    registryPath: getRegistryDir(),
    siteCount: sites.length,
  };
}
