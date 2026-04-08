# Digital Currency Watch

Static public site for Beijing-time recent-three-day digital-currency news from whitelisted institutions. Built with Python at build time, published to `docs/`, and paired with a Cloudflare Worker that generates single-article reports without exposing the real model API key in the frontend.

## What it does

- Pulls built-in RSS feeds from central banks, regulators, and research institutions defined in `sources.yaml`
- Keeps only recent-three-day articles in `Asia/Shanghai`
- Uses a wide-in / strict-out keyword pipeline: broader candidate signals, then strong confirmation before publishing
- Extracts a cleaned excerpt and article body for the public site
- Publishes a static shell plus `docs/data/site.json`
- Lets users generate a fixed-format report for a single article through a Cloudflare Worker proxy
- Supports local custom RSS preview through the Worker without exposing those feeds publicly

## Project layout

- `dcw/`: Python build pipeline
- `sources.yaml`: built-in institution source registry
- `docs/`: generated Pages output and frontend assets
- `worker/`: Cloudflare Worker proxy for report generation and custom RSS preview

## Local build

```bash
pip install -r requirements.txt
python main.py
```

`python main.py` writes:

- `docs/data/site.json`
- `docs/index.html`

If remote feeds are unreachable, the build still completes and keeps the shell available.

## Built-in sources

Edit `sources.yaml` to manage the public institution whitelist.

Each source requires:

- `id`
- `category`
- `institution_name`
- `feeds`
- `strong_keywords`
- `medium_keywords` (optional but recommended for wider candidate matching)

Example:

```yaml
sources:
  - id: ecb
    category: central_bank
    institution_name: 欧洲中央银行（ECB）
    feeds:
      - https://www.ecb.europa.eu/rss/press.html
    strong_keywords:
      - digital euro
      - cbdc
    medium_keywords:
      - tokenisation
      - cross-border payments
```

## Cloudflare Worker setup

The public site never calls the model provider directly. Deploy the Worker in `worker/` and store the real key there.

### Environment vars

`wrangler.toml` includes non-secret vars:

- `ACTIVE_PROVIDER`: `openrouter` or `siliconflow`
- `ACTIVE_MODEL`: the model id you want the Worker to use
- `ALLOWED_ORIGIN`: your Pages domain
- `OPENROUTER_SITE_URL`
- `OPENROUTER_SITE_NAME`

### Secrets

Set only the secret you actually use:

```bash
cd worker
wrangler secret put OPENROUTER_API_KEY
wrangler secret put SILICONFLOW_API_KEY
```

### Deploy

```bash
cd worker
wrangler deploy
```

Then set your repo variable:

- `REPORT_WORKER_URL`: the deployed Worker base URL

The GitHub Actions build injects that URL into the static site shell.

## GitHub Actions

`.github/workflows/cron-job.yml`:

- runs every 2 hours plus manual dispatch
- uses the built-in `GITHUB_TOKEN`
- runs tests before building
- only commits `docs/index.html` and `docs/data/site.json`
- skips the commit if generated output did not change

You do not need a personal access token for this workflow.

## Tests

Python:

```bash
pytest tests -q
```

Worker:

```bash
node --test worker/test/report.test.js worker/test/custom-source.test.js
```
