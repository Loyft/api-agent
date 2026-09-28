---
name: api-agent
description: Create and call local website data APIs.
version: 0.1.0
author: api-agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [api, web, scraping, openapi, live-data]
    related_skills: []
---

# api-agent

Turn a website into **local callable JSON APIs** by capturing the site's own XHR/fetch traffic, then replaying those requests through a stable gateway. Use this when the user wants live/changing data (news, prices, listings) without browsing the site each time.

## Prerequisites

1. Node.js 22+
2. This repo installed (`pnpm install` in the api-agent project)
3. Chromium for Playwright (`pnpm exec playwright install chromium`)

Prefer invoking the wrappers under this skill's `scripts/` directory so command shapes stay consistent.

Set `API_AGENT_HOME` if you want a non-default registry (default: `~/.api-agent`).

## When to use

- "Create API endpoints for site \<url\>"
- "Fetch live prices / headlines / listings via the API we created"
- "What endpoints do we have for \<site\>?"

## Workflow

### 1. Ensure the gateway can run

```bash
scripts/status.sh
# If not running:
scripts/serve.sh
```

`serve` blocks in the foreground. For Hermes, start it in the background (e.g. `scripts/serve.sh &`) then re-check `status`.

### 2. Create endpoints from a website

```bash
scripts/create.sh "<url>" "<task description>"
# optional named slug:
scripts/create.sh "<url>" "<task description>" --name my-site
# optional: type into a search box during capture
scripts/create.sh "<url>" "<task description>" --interact "AAPL"
```

Stdout is JSON. On success, read `site.slug`, `site.endpoints[].slug`, and `example_cli`.

**Failure mode:** if the site only serves HTML (no JSON XHR/fetch), create exits non-zero with `no_json_api`. Tell the user HTML-only sites are out of MVP scope; suggest a page that loads data via JSON APIs.

### 3. Inspect routes

```bash
scripts/list.sh
scripts/docs.sh <site-slug>
```

### 4. Call an endpoint (live upstream replay)

```bash
scripts/call.sh <site-slug> <route-slug> --param value
# or via the local gateway (requires serve):
scripts/call.sh <site-slug> <route-slug> --via-gateway --param value
```

Pass route parameters as `--name value` flags matching `docs` parameters.

### 5. Answer the user with structured data

Prefer fields from the JSON `data` object. Cite `source` / `upstream_url` briefly when useful.

## Chat examples

**Create**

> Create API endpoints for https://news.ycombinator.com - top stories title and url

Steps: `create` → report slug + routes → offer an example `call`.

**Fetch**

> What's trending on the HN API we created?

Steps: `list` / `docs` → `call` with a sensible query → summarize hits.

**Prices**

> Create APIs for https://www.coingecko.com/en/coins/bitcoin - live BTC price USD

Steps: `create` (may need `--interact`) → `call` → report price fields.

## Rules

- Always use the CLI/scripts; do not invent upstream URLs by hand when a registry entry exists.
- After `create`, run `docs` before guessing parameter names.
- If `serve` is down, `call` without `--via-gateway` still works (direct upstream replay).
- Do not attempt CAPTCHA/login bypass; report blockers clearly.
- Registry + OpenAPI live under `$API_AGENT_HOME/registry/` (default `~/.api-agent/registry/`).

## Quick reference

| Intent | Command |
|--------|---------|
| Status | `scripts/status.sh` |
| Serve | `scripts/serve.sh` |
| Create | `scripts/create.sh <url> "<task>"` |
| List | `scripts/list.sh` |
| Docs | `scripts/docs.sh <site>` |
| Call | `scripts/call.sh <site> <route> --key value` |
| Sample seed | `api-agent seed-sample` (HN Algolia without browser) |
