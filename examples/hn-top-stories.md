# Hacker News - search stories

Live news-style data via Algolia's public HN API. Good first demo: changing content, no auth.

## Option A - seed without a browser

```bash
pnpm exec tsx src/cli.ts seed-sample
pnpm exec tsx src/cli.ts call hn search-stories --query "ai"
```

## Option B - capture from the Algolia UI

```bash
pnpm exec tsx src/cli.ts create "https://hn.algolia.com/?q=typescript&type=story" \
  --task "search stories and return title, url, points" \
  --name hn-live
pnpm exec tsx src/cli.ts docs hn-live
pnpm exec tsx src/cli.ts call hn-live <route-slug> --query typescript
```

## Via the local gateway

```bash
pnpm exec tsx src/cli.ts serve --port 8787
# other terminal:
curl "http://127.0.0.1:8787/v1/hn/search-stories?query=rust"
```

## Hermes chat

> Create API endpoints for https://hn.algolia.com - search stories title and url

> Fetch stories about "openai" using that API
