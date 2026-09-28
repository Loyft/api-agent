# Install api-agent skill on Hermes Agent

This guide is for a Hermes Agent instance (or a human) installing the local
website-to-API skill from this repository.

## Step 1 - Confirm environment

```bash
command -v node
command -v pnpm || command -v npm
```

Node.js 22+ is required.

## Step 2 - Install the project

From the api-agent repo root:

```bash
pnpm install
pnpm exec playwright install chromium
```

Optional: link the CLI globally for convenience:

```bash
pnpm link --global
# or: npm link
```

## Step 3 - Install the Hermes skill

```bash
CONFIG="$(hermes config path)"
HERMES_HOME="$(dirname "$CONFIG")"
mkdir -p "$HERMES_HOME/skills"
ln -sfn "$(pwd)/skill" "$HERMES_HOME/skills/api-agent"
# Verify:
test -f "$HERMES_HOME/skills/api-agent/SKILL.md" && echo skill-ok
chmod +x "$HERMES_HOME/skills/api-agent/scripts/"*.sh
```

Start a **new** Hermes session (`/new`) so the skill appears in the available list.

## Step 4 - Smoke test

```bash
./skill/scripts/status.sh
./skill/scripts/create.sh "https://hn.algolia.com/" "search stories title url" --name hn-demo || true
# Or without browser capture:
pnpm exec tsx src/cli.ts seed-sample
./skill/scripts/call.sh hn search-stories --query "ai"
```

## Step 5 - Chat

In Hermes:

> Create API endpoints for https://hn.algolia.com - search stories with title and url

Then:

> Call the HN search endpoint for query "rust"

## Removing

```bash
rm "$HERMES_HOME/skills/api-agent"   # if symlink
# registry data remains in ~/.api-agent unless you delete it
```
