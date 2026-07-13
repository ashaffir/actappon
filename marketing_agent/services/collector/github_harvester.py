import os
import logging
import requests
from datetime import datetime, timedelta
from shared.database import get_db
from shared.models import Candidate, Setting

logger = logging.getLogger(__name__)

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json"
} if GITHUB_TOKEN else {}

# Configuration from spec (can be moved to DB or config file later)
TARGET_REPOS = [
    "langchain-ai/langchain",
    "crewAIInc/crewAI",
    "microsoft/autogen",
    "run-llama/llama_index",
    "Significant-Gravitas/AutoGPT"
]

DEFAULT_QUERIES = [
    'is:issue is:open (latency OR slow OR timeout OR retry OR stuck OR "rate limit") sort:updated-desc',
    'is:pr is:open (otel OR opentelemetry OR tracing OR observability) sort:updated-desc'
]

def search_github(query, repo):
    url = f"https://api.github.com/search/issues?q=repo:{repo} {query}&per_page=10"
    try:
        response = requests.get(url, headers=HEADERS)
        response.raise_for_status()
        return response.json().get("items", [])
    except Exception as e:
        logger.error(f"Error searching GitHub for {repo}: {e}")
        return []

def run_github_harvest():
    db = next(get_db())
    logger.info("Running GitHub Harvest...")
    
    # Load settings
    query_setting = db.query(Setting).filter(Setting.key == "search_queries").first()
    if query_setting:
        queries = [q.strip() for q in query_setting.value.split(",")]
    else:
        queries = DEFAULT_QUERIES

    repo_setting = db.query(Setting).filter(Setting.key == "target_repos").first()
    if repo_setting:
        target_repos = [r.strip() for r in repo_setting.value.split(",")]
    else:
        target_repos = TARGET_REPOS


    post_age_setting = db.query(Setting).filter(Setting.key == "post_max_age_days").first()
    max_days = int(post_age_setting.value) if post_age_setting else 7

    count_new = 0
    for repo in target_repos:
        for query in queries:
            items = search_github(query, repo)
            for item in items:
                # Basic deduplication by source_id (GitHub URL or ID)
                source_id = str(item["id"])
                existing = db.query(Candidate).filter(Candidate.source_id == source_id).first()
                
                if not existing:
                    # Filter by recency (updated in last 30 days)
                    updated_at = datetime.strptime(item["updated_at"], "%Y-%m-%dT%H:%M:%SZ")
                    if updated_at < datetime.utcnow() - timedelta(days=max_days):
                        continue

                    new_candidate = Candidate(
                        source="github",
                        source_id=source_id,
                        url=item["html_url"],
                        title=item["title"],
                        raw_content=item.get("body", "") or "",
                        author=item.get("user", {}).get("login"),
                        search_query=query,
                        fetched_at=datetime.utcnow()
                    )
                    db.add(new_candidate)
                    count_new += 1
    
    db.commit()
    logger.info(f"GitHub Harvest complete. Added {count_new} new candidates.")
