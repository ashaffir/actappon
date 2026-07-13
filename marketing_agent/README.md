# ATI Market Signal & Outreach Assistant (MSOA)

MSOA is an internal tool designed to identify high-signal production pain in "agentic / orchestration / LLM workflows" (e.g. LangChain, AutoGen, CrewAI) and draft non-intrusive, technical engagement responses.

## Prerequisites

- **Docker** & **Docker Compose**
- **Git**

## Quick Start

1. **Configure Environment**
   ```bash
   cd marketing_agent
   ./run.sh init-env
   ./run.sh setup
   ```

   Edit `.env` and set the required values:

   - `GITHUB_TOKEN`
   - `GCP_PROJECT_ID`
   - `GOOGLE_APPLICATION_CREDENTIALS`
   - `ADMIN_PASSWORD`

   *(See "Obtaining Keys" below for instructions)*

2. **Run with the main Actappon stack**

   From the root project directory:

   ```bash
   cd ..
   ./run.sh
   ```

3. **Access the UI**

   Open [https://msoa.actappon.com](https://msoa.actappon.com) in your browser.

   The main nginx container proxies:

   - `msoa.actappon.com` -> `ui-frontend:5173`
   - `msoa.actappon.com/api/` -> `ui-backend:8088`

## Cloudflare setup

This repository cannot change Cloudflare for you. Configure this in the
Cloudflare dashboard:

- Add/update an `A` record for `msoa.actappon.com`.
- Point it to the current server public IP.
- Set proxy status to `Proxied` / orange-clouded.
- Keep SSL/TLS mode as `Flexible`.

To get the current server public IP from the server:

```bash
curl ipinfo.io/ip
```

You can also run:

```bash
./run.sh setup
```

from this directory to print the required external setup checklist.

## Obtaining Keys

### 1. Vertex AI Credentials (`GCP_PROJECT_ID` + JSON Key)
The application uses the Vertex AI SDK which requires a Google Cloud Service Account.

1. **Create Service Account**:
   - Go to [GCP Console > IAM > Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts).
   - Create a new service account (e.g. `msoa-bot`).
   - Grant it the **"Vertex AI User"** role.

2. **Generate Key**:
   - Click the service account > **Keys** tab > **Add Key** > **Create new key** > **JSON**.
   - Save the file as `gcp-key.json` in the project root directory.

3. **Configure .env**:
   - Set `GCP_PROJECT_ID` to your project ID (from the top left of GCP console).
   - Ensure `GOOGLE_APPLICATION_CREDENTIALS=./gcp-key.json` (this is default).

### 2. GitHub Token (`GITHUB_TOKEN`)
You need a **Classic** Personal Access Token to post comments.

1. Go to [GitHub Developer Settings > Personal access tokens > Tokens (classic)](https://github.com/settings/tokens).
2. Click **Generate new token (classic)**.
3. **Scopes**: Select `public_repo`.
4. Generate the token and paste it into your `.env` file.

## Architecture

The system runs as a set of Docker containers:
- **Collector**: Harvests issues from GitHub every 6 hours.
- **Pipeline**: Deduplicates and enforces cooldowns (runs every minute).
- **LLM**: Analyzes items using Gemini 2.0 Flash to score relevance and draft responses.
- **UI**: A React dashboard for human review and approval.
- **Executor**: Posts approved comments to GitHub (rate-limited).

## Usage Guide

1. **Inbox**: The dashboard shows "Pending" opportunities found by the collector.
2. **Review**: Click an item to see the AI analysis (Signal Strength, Failure Mode) and drafted responses.
3. **Edit & Approve**: You can edit the selected draft before approving. Once approved, it is queued for execution.
4. **Reject**: If an item is not relevant, reject it to train the system (future feature) and hide it.

## Troubleshooting

- **Logs**: View logs for a specific service:
  ```bash
  ./run.sh logs llm 120 true
  ```
- **Force Harvest**: To trigger a GitHub search immediately:
  ```bash
  ./run.sh trigger collector
  ```
