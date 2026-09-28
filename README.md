# api-agent

Turn websites into **local, callable JSON APIs** for Hermes (and any HTTP client). Capture the site's own XHR/fetch traffic, synthesize stable routes, and replay them for live/changing data - news, prices, listings - without browsing every time.

This project is **local-first**: registry and gateway run on your machine.

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium

# Sample HN endpoint (no browser)
pnpm exec tsx src/cli.ts seed-sample
pnpm exec tsx src/cli.ts call hn search-stories --query "ai"

# Local gateway
pnpm exec tsx src/cli.ts serve --port 8787
curl "http://127.0.0.1:8787/v1/hn/search-stories?query=rust"
```

### Create from a website

```bash
pnpm exec tsx src/cli.ts create "https://hn.algolia.com/?q=typescript&type=story" \
  --task "search stories title url points" \
  --name hn-live

pnpm exec tsx src/cli.ts docs hn-live
pnpm exec tsx src/cli.ts call hn-live <route-slug>
```

## CLI

| Command | Purpose |
|---------|---------|
| `create <url> --task "..."` | Capture JSON XHR/fetch and register endpoints |
| `serve [--port 8787]` | Local OpenAPI gateway |
| `status` | Gateway + registry status |
| `list` | List registered sites |
| `docs <site>` | Routes, params, example commands |
| `call <site> <route> --param value` | Live upstream replay |
| `seed-sample` | Install demo HN Algolia route |

Data directory: `~/.api-agent` (override with `API_AGENT_HOME`).

## Hermes

See [skill/INSTALL_FOR_HERMES.md](skill/INSTALL_FOR_HERMES.md) and [skill/SKILL.md](skill/SKILL.md).

Chat examples:

- “Create API endpoints for https://hn.algolia.com - search stories title and url”
- “Fetch stories about rust via that API”

## Examples

- [examples/hn-top-stories.md](examples/hn-top-stories.md)
- [examples/coingecko-btc-price.md](examples/coingecko-btc-price.md)
- [examples/stock-quote.md](examples/stock-quote.md)

## How it works

1. **Capture** - Playwright records `xhr`/`fetch` JSON responses while loading the page.
2. **Synthesize** - Heuristics rank requests, parameterize query/path/body, emit OpenAPI.
3. **Serve / call** - Gateway or CLI replays the upstream request with your params.

HTML-only sites (no JSON APIs) fail with `no_json_api` - that is intentional for MVP durability.

## Out of scope (for now)

CAPTCHA/proxy bypass, login-gated sites, hosted marketplace, auto-repair probes.

## License

MIT
