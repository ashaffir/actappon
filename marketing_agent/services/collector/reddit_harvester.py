import os
import logging
import requests
import time
from datetime import datetime, timedelta
from shared.database import get_db
from shared.models import Candidate, Setting

logger = logging.getLogger(__name__)

REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET")
USER_AGENT = "marketing-agent/0.1 by /u/marketing_agent_bot"

# Configuration defaults
DEFAULT_SUBREDDITS = [
    "LocalLLaMA",
    "OpenAI",
    "ArtificialInteligence",
    "MachineLearning",
    "LangChain",
    "AutoGPT",
    "Singularity"
]

DEFAULT_QUERIES = [
    "latency OR slow OR timeout OR retry OR stuck OR \"rate limit\"",
    "otel OR opentelemetry OR tracing OR observability"
]

def get_reddit_token():
    if not REDDIT_CLIENT_ID or not REDDIT_CLIENT_SECRET:
        logger.warning("Reddit credentials not found. Skipping Reddit harvest.")
        return None

    auth = requests.auth.HTTPBasicAuth(REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET)
    data = {'grant_type': 'client_credentials'}
    headers = {'User-Agent': USER_AGENT}

    try:
        response = requests.post('https://www.reddit.com/api/v1/access_token',
                                 auth=auth, data=data, headers=headers)
        response.raise_for_status()
        return response.json()['access_token']
    except Exception as e:
        logger.error(f"Failed to authenticate with Reddit: {e}")
        return None

def search_subreddit(subreddit, query, token):
    headers = {
        'Authorization': f'bearer {token}',
        'User-Agent': USER_AGENT
    }
    # Search within last month for relevance
    url = f"https://oauth.reddit.com/r/{subreddit}/search?q={query}&restrict_sr=1&sort=new&t=month&limit=10"
    
    try:
        response = requests.get(url, headers=headers)
        if response.status_code == 403:
             logger.warning(f"Forbidden access to r/{subreddit}. Might be private or banned.")
             return []
        response.raise_for_status()
        data = response.json()
        return data.get('data', {}).get('children', [])
    except Exception as e:
        logger.error(f"Error searching r/{subreddit} for '{query}': {e}")
        return []

def run_reddit_harvest():
    logger.info("Running Reddit Harvest...")
    
    token = get_reddit_token()
    if not token:
        return

    db = next(get_db())
    
    # Load settings
    query_setting = db.query(Setting).filter(Setting.key == "reddit_search_queries").first()
    if query_setting:
        queries = [q.strip() for q in query_setting.value.split(",")]
    else:
        queries = DEFAULT_QUERIES

    sub_setting = db.query(Setting).filter(Setting.key == "target_subreddits").first()
    if sub_setting:
        subreddits = [s.strip() for s in sub_setting.value.split(",")]
    else:
        subreddits = DEFAULT_SUBREDDITS

    post_age_setting = db.query(Setting).filter(Setting.key == "post_max_age_days").first()
    max_days = int(post_age_setting.value) if post_age_setting else 7

    count_new = 0
    seen_source_ids = set()
    
    for sub in subreddits:
        for query in queries:
            posts = search_subreddit(sub, query, token)
            for post_wrapper in posts:
                post = post_wrapper.get('data', {})
                
                source_id = f"reddit_{post.get('id')}"
                if source_id in seen_source_ids:
                    continue

                existing = db.query(Candidate).filter(Candidate.source_id == source_id).first()
                
                if not existing:
                    # Check recency
                    created_utc = post.get('created_utc', 0)
                    post_date = datetime.fromtimestamp(created_utc)
                    
                    if post_date < datetime.utcnow() - timedelta(days=max_days):
                        continue
                    
                    # Construct URL
                    permalink = post.get('permalink')
                    url = f"https://www.reddit.com{permalink}" if permalink else ""

                    new_candidate = Candidate(
                        source="reddit",
                        source_id=source_id,
                        url=url,
                        title=post.get('title', ''),
                        raw_content=post.get('selftext', '') or "",
                        author=post.get('author', 'unknown'),
                        search_query=query,
                        fetched_at=datetime.utcnow()
                    )
                    db.add(new_candidate)
                    seen_source_ids.add(source_id)
                    count_new += 1
            
            # Be nice to Reddit API
            time.sleep(1)

    db.commit()
    logger.info(f"Reddit Harvest complete. Added {count_new} new candidates.")
