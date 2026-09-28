# CoinGecko - live crypto prices

Live price-style data. CoinGecko's site and public API expose JSON that agents can call repeatedly without reopening the browser.

## Option A - seed without a browser

```bash
pnpm exec tsx src/cli.ts seed-sample
pnpm exec tsx src/cli.ts call coingecko simple-price --ids bitcoin --vs_currencies usd
```

Expected shape:

```json
{ "data": { "bitcoin": { "usd": 83899 } } }
```

## Option B - capture from a coin page

```bash
pnpm exec tsx src/cli.ts create "https://www.coingecko.com/en/coins/bitcoin" \
  --task "live bitcoin price USD market cap" \
  --name coingecko-btc
pnpm exec tsx src/cli.ts docs coingecko-btc
pnpm exec tsx src/cli.ts call coingecko-btc <route-slug>
```

If capture finds no useful JSON (bot walls / HTML-only), use the public simple API as a manual seed equivalent:

```bash
# Direct public API (for comparison / fallback testing):
curl -s "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
```

Register it as a local site with `seed-sample`-style editing, or re-run create against `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd` is not a browser page - prefer the marketing page capture when it works.

### Hermes chat

> Create API endpoints for https://www.coingecko.com/en/coins/bitcoin - live BTC price in USD

> What's the current BTC price via our coingecko API?

## Notes

- Rate limits apply on free CoinGecko endpoints.
- Prefer the synthesized upstream replay over scraping HTML price nodes.
