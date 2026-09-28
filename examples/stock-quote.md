# Stooq / quote-style live prices

Example flow for **stock or index quotes** where a page loads JSON for a ticker. Patterns match the long-term Hermes goal: ask once to create endpoints, then fetch live prices on demand.

## Capture a quote page

Pick a public quote page that loads JSON over XHR (many finance sites do). Example shape:

```bash
pnpm exec tsx src/cli.ts create "https://stooq.com/q/?s=aapl.us" \
  --task "live AAPL stock price" \
  --name stooq-aapl \
  --interact "aapl.us"
pnpm exec tsx src/cli.ts docs stooq-aapl
pnpm exec tsx src/cli.ts call stooq-aapl <route-slug>
```

If the site is HTML-only or blocks headless Chrome, create fails with `no_json_api`. That is expected for MVP - try another quote source that exposes JSON.

## Hermes chat

> Create API endpoints for \<quote-site-url\> - live AAPL price

> What's AAPL trading at using the API we created?

## Tips

- Pass `--interact "AAPL"` when the page needs a search box before the JSON quote loads.
- After create, always `docs` to see parameter names (`symbol`, `s`, `ticker`, …).
- Re-call the same route later for updated prices; do not re-run create unless the upstream shape breaks.
