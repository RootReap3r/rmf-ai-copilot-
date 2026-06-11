# NIST 800-53 Rev 4 → Rev 5 Migration Pipeline

AI-driven pipeline: upload SSP content → AI generates SCTM, eMASS upload
rows, POA&M items, and a 20-family migration tracker. Progress
accumulates incrementally and persists across sessions.

This package is **provider-agnostic** by design. The frontend never
talks to an LLM directly — it calls your own local backend, which
talks to whichever model API you configure. Swapping from DeepSeek
(practice) to an Anthropic-compatible endpoint, AWS Bedrock, or an
internal SIPR/NIPR/FENCES gateway is a `.env` change, not a code change.

```
┌──────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│  Browser UI   │─────▶│  Local backend    │─────▶│  Your LLM provider   │
│  (React)      │      │  (Node/Express)   │      │  (configured in .env)│
│               │◀─────│  + storage.json   │◀─────│                      │
└──────────────┘      └──────────────────┘      └─────────────────────┘
```

---

## Quick Start (local machine, practice with DeepSeek)

**Requirements:** Node.js 18+ (or Docker)

### Option A — Docker (recommended, one command)

```bash
cd nist-pipeline-app
cp server/.env.example server/.env
# edit server/.env -> set LLM_API_KEY to your DeepSeek key
docker compose up --build
```

Open **http://localhost:3001**

### Option B — without Docker

```bash
cd nist-pipeline-app

# 1. Backend
cd server
cp .env.example .env
# edit .env -> set LLM_API_KEY
npm install
npm start
# Backend now running on http://localhost:3001

# 2. Frontend (separate terminal)
cd ../client
npm install
npm run dev
# Open http://localhost:5173 (Vite dev server, proxies /api to :3001)
```

For a single deployable build (no separate dev server):

```bash
cd client && npm install && npm run build
cd ../server && npm install && npm start
# Open http://localhost:3001 -- backend now serves the built frontend too
```

---

## Switching LLM Providers

Everything is controlled by `server/.env`. No code changes needed.

### DeepSeek (practice / default)
```ini
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
LLM_API_KEY=sk-your-deepseek-key
```

### Anthropic API directly
```ini
LLM_PROVIDER=anthropic
LLM_BASE_URL=https://api.anthropic.com
LLM_MODEL=claude-sonnet-4-20250514
LLM_API_KEY=sk-ant-your-key
```

### AWS Bedrock (NIPR / GovCloud)
Bedrock's native API shape differs slightly from both adapters above.
Two ways to use it:

1. **Recommended:** put a small Bedrock-compatible proxy in front
   (many teams already run one) that exposes either an OpenAI-style
   `/chat/completions` or Anthropic-style `/v1/messages` endpoint —
   then point `LLM_BASE_URL` at that proxy and pick the matching
   `LLM_PROVIDER`.
2. **Direct integration:** add a `callBedrock()` function to
   `server/llm.js` using `@aws-sdk/client-bedrock-runtime` with the
   `InvokeModel` API for an Anthropic Claude model on Bedrock. AWS
   credentials would come from the instance role / IAM, not
   `LLM_API_KEY`. This is a small, contained change — only
   `server/llm.js` needs to be touched.

### SIPR / FENCES / internal gateway
If your internal AI gateway speaks either the OpenAI Chat Completions
format or the Anthropic Messages format, just point `LLM_BASE_URL` at
it and set `LLM_PROVIDER` accordingly — no code change.

If it uses a different request/response shape entirely, add a new
case in `server/llm.js` (`callMyGateway()`) following the pattern of
the existing two adapters — each is ~20 lines. This is the **only**
file that ever needs to change to support a new environment.

---

## Where Progress Is Stored

`server/data/storage.json` — one entry per documented control
(`ctrl:AC-2`, `ctrl:AC-3(1)`, etc.), holding the AI-generated SCTM
status, implementation narrative, gap analysis, and eMASS fields.

- Survives restarts (mounted as a Docker volume in `docker-compose.yml`)
- Back it up like any file — copy it, version it in git (it contains
  no credentials, only control data), or move it between environments
- For team/shared deployments, replace `server/storage.js` with a real
  database (Postgres, DynamoDB, etc.) — it's a 4-function module
  (`get`, `set`, `del`, `listKeys`) so the swap is contained

---

## Deploying to AWS (NIPR / GovCloud)

The Docker image is environment-agnostic. Typical paths:

- **ECS Fargate / EC2:** push the image to ECR, run as a task/service,
  mount an EFS volume at `/app/server/data` for persistence, set
  `LLM_*` env vars via task definition or Secrets Manager
- **App Runner:** point at the ECR image, set env vars in the console
- **EC2 + Docker Compose:** simplest — `docker compose up -d` on an
  instance, EBS volume for `./server/data`

None of this requires internet egress beyond whatever URL you put in
`LLM_BASE_URL` — if that's an internal VPC endpoint, the container
never needs to leave your network boundary.

---

## What's Inside

```
nist-pipeline-app/
├── server/
│   ├── index.js       # Express API: /api/chat, /api/storage/*
│   ├── llm.js          # Provider adapters (THE file to extend for new envs)
│   ├── storage.js       # File-based KV store (swap for a DB if needed)
│   ├── .env.example     # Copy to .env and configure
│   └── data/             # storage.json lives here (gitignored)
├── client/
│   └── src/App.jsx      # The full pipeline UI (unchanged logic from Claude.ai version)
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Notes on Classified Environments

This package is just code — it makes no assumptions about
classification level. What determines whether it's appropriate for
SIPR, NIPR, or FENCES is:

1. Whatever LLM endpoint you point `LLM_BASE_URL` at, and whether
   that endpoint is approved for that environment's data
2. Standard ATO/accreditation review for any new tool running on that
   network, regardless of what it does

Nothing in this codebase calls out to the public internet except the
single configurable LLM endpoint — there's no telemetry, analytics, or
external dependencies fetched at runtime once built.
