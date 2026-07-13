import base64
import csv
import hashlib
import hmac
import json
import logging
import time
from fastapi import FastAPI, Depends, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from shared.database import get_db, init_db
from shared.models import Opportunity, OpportunityStatus, Draft, Action, ActionStatus, LLMUsageLog, RagDocument

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Ensure DB init
# Ensure DB init
init_db()

# Seed Settings from ENV if empty
import os
from datetime import datetime
from shared.models import Setting
import requests
import re
import html

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin").strip() or "admin"
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "").strip()
AUTH_TOKEN_TTL_SECONDS = int(os.getenv("AUTH_TOKEN_TTL_SECONDS", "86400"))

def b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")

def b64_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)

def auth_secret() -> bytes:
    return (os.getenv("AUTH_TOKEN_SECRET") or ADMIN_PASSWORD).encode("utf-8")

def create_auth_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": int(time.time()) + AUTH_TOKEN_TTL_SECONDS,
    }
    body = b64_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = b64_encode(hmac.new(auth_secret(), body.encode("utf-8"), hashlib.sha256).digest())
    return f"{body}.{sig}"

def verify_auth_token(token: str) -> bool:
    try:
        body, sig = token.split(".", 1)
        expected = b64_encode(hmac.new(auth_secret(), body.encode("utf-8"), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return False
        payload = json.loads(b64_decode(body).decode("utf-8"))
        return payload.get("sub") == ADMIN_USERNAME and int(payload.get("exp", 0)) > int(time.time())
    except Exception:
        return False

def clean_html(raw_html):
    # Simple cleaner: remove script/style, strip tags
    cleaner = re.compile('<script.*?>.*?</script>', re.IGNORECASE | re.DOTALL)
    cleantext = re.sub(cleaner, '', raw_html)
    cleaner = re.compile('<style.*?>.*?</style>', re.IGNORECASE | re.DOTALL)
    cleantext = re.sub(cleaner, '', cleantext)
    cleaner = re.compile('<.*?>')
    cleantext = re.sub(cleaner, '', cleantext)
    return html.unescape(cleantext).strip()

def fetch_content_from_url(url: str) -> str:
    try:
        # Use a user agent to avoid some blocks
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        return clean_html(resp.text)
    except Exception as e:
        logger.error(f"Failed to fetch URL {url}: {e}")
        return ""

def sync_env_model_setting(db: Session):
    env_model = os.getenv("GEMINI_MODEL")
    if not env_model:
        return None

    model_setting = db.query(Setting).filter(Setting.key == "llm_model").first()
    if model_setting:
        model_setting.value = env_model
    else:
        model_setting = Setting(key="llm_model", value=env_model, description="Model from ENV")
        db.add(model_setting)
    return env_model

PROJECT_SETTING_KEYS = {
    "project_name",
    "project_url",
    "search_queries",
    "reddit_search_queries",
    "target_repos",
    "target_subreddits",
    "post_max_age_days",
    "harvest_interval_hours",
    "min_signal_strength",
    "risk_score_threshold",
    "cooldown_days",
}

LIST_PROJECT_SETTING_KEYS = {
    "search_queries",
    "reddit_search_queries",
    "target_repos",
    "target_subreddits",
}

NUMERIC_PROJECT_SETTING_KEYS = {
    "post_max_age_days",
    "harvest_interval_hours",
    "min_signal_strength",
    "risk_score_threshold",
    "cooldown_days",
}

def normalize_config_key(key: str) -> str:
    return key.strip().lower().replace("-", "_").replace(" ", "_")

def clean_config_value(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1].strip()
    return value

def parse_inline_list(value: str) -> List[str]:
    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        value = value[1:-1]
    return [clean_config_value(item) for item in next(csv.reader([value], skipinitialspace=True)) if clean_config_value(item)]

def coerce_project_setting(key: str, value):
    if isinstance(value, list):
        items = [clean_config_value(str(item)) for item in value if clean_config_value(str(item))]
        return ", ".join(items)

    value = clean_config_value(str(value))
    if not value:
        return None

    if key in LIST_PROJECT_SETTING_KEYS and value.startswith("[") and value.endswith("]"):
        return ", ".join(parse_inline_list(value))

    if key in NUMERIC_PROJECT_SETTING_KEYS:
        try:
            return str(float(value)) if "." in value else str(int(value))
        except ValueError:
            return None

    return value

def extract_frontmatter(content: str):
    text = content.lstrip("\ufeff")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return "", content

    frontmatter = []
    for idx, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return "\n".join(frontmatter), "\n".join(lines[idx + 1:]).strip()
        frontmatter.append(line)

    return "", content

def parse_project_settings_from_markdown(content: str):
    frontmatter, _ = extract_frontmatter(content)
    if not frontmatter:
        return {}

    parsed = {}
    current_key = None
    current_items = []

    def flush_list():
        nonlocal current_key, current_items
        if current_key and current_items:
            parsed[current_key] = current_items
        current_key = None
        current_items = []

    for raw_line in frontmatter.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        if current_key and line.startswith("- "):
            current_items.append(line[2:].strip())
            continue

        flush_list()
        match = re.match(r"^([A-Za-z0-9 _-]+)\s*:\s*(.*)$", line)
        if not match:
            continue

        key = normalize_config_key(match.group(1))
        if key not in PROJECT_SETTING_KEYS:
            continue

        value = match.group(2).strip()
        if not value:
            current_key = key
            current_items = []
        elif key in LIST_PROJECT_SETTING_KEYS and value.startswith("[") and value.endswith("]"):
            parsed[key] = parse_inline_list(value)
        else:
            parsed[key] = value

    flush_list()

    settings = {}
    for key, value in parsed.items():
        coerced = coerce_project_setting(key, value)
        if coerced:
            settings[key] = coerced
    return settings

def apply_project_settings_from_rag(content: str, db: Session):
    settings = parse_project_settings_from_markdown(content)
    applied = {}
    for key, value in settings.items():
        setting = db.query(Setting).filter(Setting.key == key).first()
        if setting:
            setting.value = value
        else:
            db.add(Setting(key=key, value=value, description="Loaded from RAG document"))
        applied[key] = value
    return applied

def sync_project_settings_from_active_rag(db: Session):
    applied = {}
    docs = db.query(RagDocument).filter(RagDocument.is_active == True).order_by(RagDocument.created_at.asc()).all()
    for doc in docs:
        applied.update(apply_project_settings_from_rag(doc.content, db))
    return applied

def seed_settings():
    db = next(get_db())
    try:
        logger.info("Seeding/Syncing settings...")
        
        # 1. Always sync critical ENV overrides (User expects .env to drive these)
        sync_env_model_setting(db)

        # 2. Seed other defaults only if missing
        defaults = {
            "cooldown_days": "14",
            "min_signal_strength": "0.4",
            "risk_score_threshold": "0.7",
            "post_max_age_days": "7",
            "harvest_interval_hours": "6",
            "search_queries": "is:issue is:open (latency OR slow OR timeout OR retry OR stuck OR \"rate limit\") sort:updated-desc, is:pr is:open (otel OR opentelemetry OR tracing OR observability) sort:updated-desc",
            "reddit_search_queries": "latency OR slow OR timeout OR retry OR stuck OR \"rate limit\", otel OR opentelemetry OR tracing OR observability",
            "target_repos": "langchain-ai/langchain, crewAIInc/crewAI, microsoft/autogen",
            "target_subreddits": "LocalLLaMA, OpenAI, ArtificialInteligence, MachineLearning, LangChain, AutoGPT"
        }
        
        for k, v in defaults.items():
            if not db.query(Setting).filter(Setting.key == k).first():
                db.add(Setting(key=k, value=v, description=f"Default for {k}"))

        sync_project_settings_from_active_rag(db)
        
        db.commit()
    except Exception as e:
        logger.error(f"Failed to seed settings: {e}")
    finally:
        db.close()

seed_settings()

app = FastAPI(title="MSOA Review API")

# Allow CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev, restrict in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

AUTH_EXEMPT_PATHS = {"/auth/login", "/docs", "/redoc", "/openapi.json"}

@app.middleware("http")
async def require_auth(request: Request, call_next):
    if request.method == "OPTIONS" or request.url.path in AUTH_EXEMPT_PATHS:
        return await call_next(request)

    if not ADMIN_PASSWORD:
        return JSONResponse({"detail": "ADMIN_PASSWORD is not configured"}, status_code=503)

    auth_header = request.headers.get("authorization", "")
    prefix = "Bearer "
    if not auth_header.startswith(prefix):
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)

    if not verify_auth_token(auth_header[len(prefix):]):
        return JSONResponse({"detail": "Invalid or expired token"}, status_code=401)

    return await call_next(request)

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/auth/login")
def login(req: LoginRequest):
    if not ADMIN_PASSWORD:
        raise HTTPException(status_code=503, detail="ADMIN_PASSWORD is not configured")

    username_ok = hmac.compare_digest(req.username, ADMIN_USERNAME)
    password_ok = hmac.compare_digest(req.password, ADMIN_PASSWORD)
    if not username_ok or not password_ok:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return {"token": create_auth_token(ADMIN_USERNAME), "username": ADMIN_USERNAME}

# Pydantic models for response
class DraftModel(BaseModel):
    id: int
    variant_name: str
    content: str
class OpportunityListModel(BaseModel):
    id: int
    title: str
    source: str
    search_query: Optional[str] = None
    url: Optional[str] = None
    signal_strength: float
    status: str
    error_log: Optional[str] = None
    updated_at: str
    class Config:
        orm_mode = True

class OpportunityDetailModel(BaseModel):
    id: int
    title: str
    source: str
    search_query: Optional[str] = None
    url: str
    raw_content: str
    signal_strength: float
    analysis_summary: str
    recommended_action: str
    risk_flags: List[str]
    status: str
    drafts: List[DraftModel]
    class Config:
        orm_mode = True

class ApprovalRequest(BaseModel):
    draft_id: int
    edited_content: Optional[str] = None

@app.get("/opportunities", response_model=List[OpportunityListModel])
def list_opportunities(status: Optional[str] = "pending", db: Session = Depends(get_db)):
    # filter by status
    status_enum = OpportunityStatus.PENDING if status == "pending" else OpportunityStatus.APPROVED if status == "approved" else OpportunityStatus.REJECTED
    
    opps = db.query(Opportunity).filter(Opportunity.status == status_enum).all()
    
    # helper mapping
    results = []
    for o in opps:
        results.append({
            "id": o.id,
            "title": o.candidate.title,
            "source": o.candidate.source,
            "search_query": o.candidate.search_query,
            "url": o.candidate.url,
            "signal_strength": o.signal_strength or 0.0,
            "status": o.status.value,
            "updated_at": str(o.updated_at)
        })
    return results

@app.post("/opportunities/reject-all")
def reject_all_pending_opportunities(db: Session = Depends(get_db)):
    rejected_count = db.query(Opportunity).filter(
        Opportunity.status == OpportunityStatus.PENDING
    ).update({
        Opportunity.status: OpportunityStatus.REJECTED,
        Opportunity.updated_at: datetime.utcnow()
    }, synchronize_session=False)
    db.commit()
    return {"status": "rejected", "count": rejected_count}

@app.get("/opportunities/{opp_id}", response_model=OpportunityDetailModel)
def get_opportunity(opp_id: int, db: Session = Depends(get_db)):
    opp = db.query(Opportunity).filter(Opportunity.id == opp_id).first()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    return {
        "id": opp.id,
        "title": opp.candidate.title,
        "source": opp.candidate.source,
        "search_query": opp.candidate.search_query,
        "url": opp.candidate.url,
        "raw_content": opp.candidate.raw_content,
        "signal_strength": opp.signal_strength or 0.0,
        "analysis_summary": opp.analysis_summary or "",
        "recommended_action": opp.recommended_action or "",
        "risk_flags": opp.risk_flags or [],
        "status": opp.status.value,
        "drafts": [{"id": d.id, "variant_name": d.variant_name, "content": d.content} for d in opp.drafts]
    }

@app.post("/opportunities/{opp_id}/approve")
def approve_opportunity(opp_id: int, req: ApprovalRequest, db: Session = Depends(get_db)):
    opp = db.query(Opportunity).filter(Opportunity.id == opp_id).first()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    
    draft = db.query(Draft).filter(Draft.id == req.draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    # Update status to APPROVED
    opp.status = OpportunityStatus.APPROVED
    
    # Create Action
    action = Action(
        opportunity_id=opp.id,
        channel="github_comment", # Just forcing for now as per plan
        content_to_post=req.edited_content or draft.content,
        status=ActionStatus.PENDING
    )
    db.add(action)
    db.commit()
    return {"status": "approved"}

@app.post("/opportunities/{opp_id}/reject")
def reject_opportunity(opp_id: int, reason: str = Body(..., embed=True), db: Session = Depends(get_db)):
    opp = db.query(Opportunity).filter(Opportunity.id == opp_id).first()
    if not opp:
        raise HTTPException(status_code=404, detail="Opportunity not found")
        
    opp.status = OpportunityStatus.REJECTED
    # Could append reason to analysis or risk flags
    db.commit()
    return {"status": "rejected"}

@app.get("/dashboard/metrics")
def get_stats(db: Session = Depends(get_db)):
    total = db.query(Opportunity).count()
    pending = db.query(Opportunity).filter(Opportunity.status == OpportunityStatus.PENDING).count()
    approved = db.query(Opportunity).filter(Opportunity.status == OpportunityStatus.APPROVED).count()
    rejected = db.query(Opportunity).filter(Opportunity.status == OpportunityStatus.REJECTED).count()
    executed = db.query(Action).filter(Action.status == ActionStatus.EXECUTED).count()
    
    # LLM Stats
    from shared.models import LLMUsageLog
    from sqlalchemy import func
    from datetime import datetime, timedelta
    
    env_model = sync_env_model_setting(db)
    if env_model:
        db.commit()
    model_setting = db.query(Setting).filter(Setting.key == "llm_model").first()

    llm_stats = {
        "current_model": env_model or (model_setting.value if model_setting else "N/A"),
        "last_run_tokens": 0,
        "accumulated_14d_tokens": 0
    }
    
    latest_log = db.query(LLMUsageLog).order_by(LLMUsageLog.timestamp.desc()).first()
    if latest_log:
        # Estimate last run as sum of tokens in the last minute of the latest log (grouping close calls together)
        window_start = latest_log.timestamp - timedelta(minutes=1)
        last_run_sum = db.query(func.sum(LLMUsageLog.total_tokens)).filter(LLMUsageLog.timestamp >= window_start).scalar()
        llm_stats["last_run_tokens"] = last_run_sum or 0
        
    cutoff_14d = datetime.utcnow() - timedelta(days=14)
    acc_sum = db.query(func.sum(LLMUsageLog.total_tokens)).filter(LLMUsageLog.timestamp >= cutoff_14d).scalar()
    llm_stats["accumulated_14d_tokens"] = acc_sum or 0

    return {
        "total_opportunities": total,
        "pending_review": pending,
        "approved": approved,
        "rejected": rejected,
        "executed_actions": executed,
        "llm_stats": llm_stats,
        "system_status": "healthy" 
    }

@app.get("/history", response_model=List[OpportunityListModel])
def get_history(db: Session = Depends(get_db)):
    # Return approved/rejected items
    opps = db.query(Opportunity).filter(Opportunity.status != OpportunityStatus.PENDING).order_by(Opportunity.updated_at.desc()).limit(50).all()
    results = []
    for o in opps:
        # Find latest action error if any
        error_msg = None
        if o.actions:
            # Sort by executed_at desc or id desc to get latest
            last_action = sorted(o.actions, key=lambda a: a.id, reverse=True)[0]
            if last_action.status == ActionStatus.FAILED:
                error_msg = last_action.error_log

        results.append({
            "id": o.id,
            "title": o.candidate.title,
            "source": o.candidate.source,
            "search_query": o.candidate.search_query,
            "url": o.candidate.url,
            "signal_strength": o.signal_strength or 0.0,
            "status": o.status.value,
            "error_log": error_msg,
            "updated_at": str(o.updated_at)
        })
    return results

# --- New Endpoints ---
from shared.models import SystemStatus, Setting

@app.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    sync_env_model_setting(db)
    sync_project_settings_from_active_rag(db)
    db.commit()
    settings = db.query(Setting).all()
    # Return as key-value pairs
    res = {}
    for s in settings:
        res[s.key] = s.value
    return res

@app.post("/settings")
def update_settings(new_settings: dict = Body(...), db: Session = Depends(get_db)):
    env_model = sync_env_model_setting(db)
    for k, v in new_settings.items():
        if k == "llm_model" and env_model:
            v = env_model
        s = db.query(Setting).filter(Setting.key == k).first()
        if s:
            s.value = str(v)
        else:
            db.add(Setting(key=k, value=str(v), description="Created via UI"))
    db.commit()
    return {"status": "updated"}

@app.get("/dashboard/services")
def get_system_status(db: Session = Depends(get_db)):
    statuses = db.query(SystemStatus).all()
    # Fixed attribute name: last_run_at
    return {s.service_name: {"status": s.status, "last_run": s.last_run_at, "message": s.message, "desired_state": s.desired_state} for s in statuses}

@app.post("/system/run/{service_name}")
def trigger_service(service_name: str, db: Session = Depends(get_db)):
    # Set trigger flag
    status = db.query(SystemStatus).filter(SystemStatus.service_name == service_name).first()
    if not status:
        # Create if not exists (though services usually create this themselves)
        status = SystemStatus(service_name=service_name, status="IDLE")
        db.add(status)
    
    status.trigger_run = True
    db.commit()
    return {"status": "triggered"}

@app.post("/system/control/{service_name}")
def control_service(service_name: str, action: dict = Body(...), db: Session = Depends(get_db)):
    desired = action.get("action") # PAUSE, RESUME, STOP, etc.
    if not desired:
        raise HTTPException(status_code=400, detail="Missing action")
        
    s = db.query(SystemStatus).filter(SystemStatus.service_name == service_name).first()
    if not s:
        s = SystemStatus(service_name=service_name, status="IDLE")
        db.add(s)
        
    if desired == "PAUSE":
        s.desired_state = "PAUSED"
    elif desired == "RESUME":
        s.desired_state = "RUNNING"
    elif desired == "STOP":
        s.desired_state = "STOPPED"
    elif desired == "START":
        s.desired_state = "RUNNING"
    
    db.commit()
    return {"status": "updated", "desired_state": s.desired_state}

@app.post("/system/global/control")
def global_control(action: dict = Body(...), db: Session = Depends(get_db)):
    desired = action.get("action") # PAUSE, RESUME, STOP, START
    if not desired:
        raise HTTPException(status_code=400, detail="Missing action")
    
    target_state = "RUNNING"
    if desired == "PAUSE": target_state = "PAUSED"
    elif desired == "STOP": target_state = "STOPPED"
    elif desired == "RESUME": target_state = "RUNNING"
    elif desired == "START": target_state = "RUNNING"
    else: return {"status": "ignored", "reason": "unknown action"}

    # Update all known services
    services = ["collector", "llm", "executor"]
    for name in services:
        s = db.query(SystemStatus).filter(SystemStatus.service_name == name).first()
        if not s:
            s = SystemStatus(service_name=name, status="IDLE")
            db.add(s)
        s.desired_state = target_state
    
    db.commit()
    return {"status": "global_update", "desired_state": target_state}

# --- Posts Generator Logic ---
import vertexai
from vertexai.generative_models import GenerativeModel
from shared.models import GeneratedPost, PostPlatform
import json

# Setup Vertex AI
import warnings
# Suppress Vertex AI deprecation warnings
warnings.filterwarnings("ignore", module="vertexai")

GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID")
GCP_LOCATION = os.getenv("GCP_LOCATION", "us-central1")

if GCP_PROJECT_ID:
    try:
        vertexai.init(project=GCP_PROJECT_ID, location=GCP_LOCATION)
    except Exception as e:
        logger.error(f"Failed to init Vertex AI: {e}")

def get_full_rag_content(db: Session = None):
    content = []
    used_docs = []
    if db:
        docs = db.query(RagDocument).filter(RagDocument.is_active == True).all()
        for d in docs:
            _, body = extract_frontmatter(d.content)
            content.append(f"\n--- Document: {d.filename} ---\n{body}")
            used_docs.append(d.filename)
    if not content:
        return "No active RAG context documents are configured.", used_docs
    return "\n".join(content), used_docs

POST_SUGGESTION_PROMPT = """
You are a creative Marketing Strategist for the project described in the Context Source.
Your goal is to suggest 5 engaging post topics/ideas based on the company context and the target platform.
The suggestions must generally align with these style modifiers: {style_modifiers}.

Context Source:
{rag_content}

Platform: {platform}
Output Language: {language}

Instructions:
1. Analyze the Context Source to identify the project, audience, category, positioning, pain points, and key themes.
2. Generate 5 distinct post ideas suitable for the {platform}.
3. Each idea should be a short, punchy sentence (not a full post).
4. Ensure ideas are compatible with requested styles: {style_modifiers}
5. Write every suggestion in {language}.

Output JSON:
{{
  "suggestions": [
     "Idea 1...",
     "Idea 2...",
     "Idea 3...",
     "Idea 4...",
     "Idea 5..."
  ]
}}
"""

POSTS_GENERATOR_PROMPT = """
You are an expert Marketing Agent for the project described in the Context Source.
Your goal is to create high-quality social media posts or blog content based on user requests.

Context Source:
{rag_content}

Platform: {platform}
Topic/Idea: {user_request}
Style Modifiers: {style_modifiers}
Output Language: {language}

Instructions:
1. Use the provided Context Source to align with the project's messaging, tone, positioning, audience, and proof points.
2. Adapt the content for the specific Platform ({platform}).
   - LinkedIn: Professional, authoritative, industry-focused.
   - X (Twitter): Concise, engaging, thread-friendly if long.
   - Blog: Detailed, educational, narrative-driven.
3. Apply the requested Style Modifiers (e.g., "Technical", "Personal", "Controversial") to adjust the tone and structure.
4. If the platform is 'blog' OR if specifically requested, provide a description for a graphical aid (either Mermaid diagram code or an image generation prompt).
5. Write the generated post content in {language}. Keep image prompts and Mermaid labels in {language} when present.

Output JSON:
{{
  "content": "The generated post content...",
  "image_prompt": "Prompt for image generator (if applicable, else null)",
  "mermaid_code": "Mermaid code (if applicable, else null)"
}}
"""
COMMENT_GENERATOR_PROMPT = """
You are a sharp, witty, and intelligent social media commenter.
Your goal is to suggest 3 distinct comments for the given content.

Content to Comment On:
{target_content}

Platform: {platform}
Tone/Style: {tone}
Output Language: {language}

Instructions:
1.  Read the content carefully.
2.  Generate 3 distinct comments options that align with the requested tone.
3.  Each comment should be suitable for the specific platform (e.g., hashtags for Twitter/X, professional for LinkedIn).
4.  Do NOT be generic (e.g., "Great post!"). Be specific to the content.
5.  Write every comment in {language}.

Output JSON:
{{
  "comments": [
    "Comment option 1...",
    "Comment option 2...",
    "Comment option 3..."
  ]
}}
"""


class SuggestionRequest(BaseModel):
    platform: str
    style_modifiers: List[str] = []
    language: str = "English"

class SuggestionResultModel(BaseModel):
    id: int
    platform: str
    content: str
    is_used: bool
    created_at: str
    used_at: Optional[str] = None

class SuggestionResponse(BaseModel):
    suggestions: List[str]
    used_rag_docs: List[str] = []

class PostRequest(BaseModel):
    platform: str
    instructions: str
    style_modifiers: List[str] = []
    language: str = "English"

class PostResponse(BaseModel):
    content: str
    image_prompt: Optional[str] = None
    mermaid_code: Optional[str] = None
    used_rag_docs: List[str] = []

class PostApproveRequest(BaseModel):
    platform: str
    content: str
    image_prompt: Optional[str] = None
    mermaid_code: Optional[str] = None
    suggestion_id: Optional[int] = None

# --- Suggestions Endpoints ---

from shared.models import PostSuggestion, PostPlatform

@app.post("/generated-posts/suggestions", response_model=SuggestionResponse)
def generate_suggestions(req: SuggestionRequest, db: Session = Depends(get_db)):
    if not GCP_PROJECT_ID:
         raise HTTPException(status_code=500, detail="GCP_PROJECT_ID not set")

    model_setting = db.query(Setting).filter(Setting.key == "llm_model").first()
    model_name = model_setting.value if model_setting else os.getenv("GEMINI_MODEL", "gemini-1.5-flash-001")

    try:
        rag_text, used_docs = get_full_rag_content(db)

        model = GenerativeModel(model_name)
        prompt = POST_SUGGESTION_PROMPT.format(
            rag_content=rag_text,
            platform=req.platform,
            style_modifiers=", ".join(req.style_modifiers),
            language=req.language
        )
        
        logger.info(f"Generating suggestions for {req.platform} with modifiers: {req.style_modifiers}")
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )

         # Log usage
        if response.usage_metadata:
            try:
                 usage = response.usage_metadata
                 db.add(LLMUsageLog(
                     model_name=model_name,
                     prompt_tokens=usage.prompt_token_count,
                     completion_tokens=usage.candidates_token_count,
                     total_tokens=usage.total_token_count,
                     call_type="post_suggestions"
                 ))
                 db.commit()
            except Exception as e:
                 logger.error(f"Failed to log LLM usage: {e}")
                 db.rollback()
        else:
            logger.warning("No usage metadata in LLM response")
        
        data = json.loads(response.text)
        sug_texts = data.get("suggestions", [])
        
        # Store suggestions
        platform_map = {
            "linkedin": PostPlatform.LINKEDIN,
            "twitter": PostPlatform.TWITTER,
            "blog": PostPlatform.BLOG,
            "x": PostPlatform.TWITTER
        }
        plat_enum = platform_map.get(req.platform.lower(), PostPlatform.LINKEDIN)
        
        for text in sug_texts:
            s = PostSuggestion(
                platform=plat_enum,
                content=text,
                is_used=False
            )
            db.add(s)
        
        db.commit()
        
        return {"suggestions": sug_texts, "used_rag_docs": used_docs}
        
    except Exception as e:
        logger.error(f"Suggestion generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/suggestions/history", response_model=List[SuggestionResultModel])
def get_suggestion_history(db: Session = Depends(get_db)):
    items = db.query(PostSuggestion).order_by(PostSuggestion.created_at.desc()).limit(100).all()
    res = []
    for i in items:
        res.append({
            "id": i.id,
            "platform": i.platform.value,
            "content": i.content,
            "is_used": i.is_used,
            "created_at": str(i.created_at),
            "used_at": str(i.used_at) if i.used_at else None
        })
    return res

@app.post("/suggestions/{id}/mark-used")
def mark_suggestion_used(id: int, db: Session = Depends(get_db)):
    item = db.query(PostSuggestion).filter(PostSuggestion.id == id).first()
    if item:
        item.is_used = True
        item.used_at = datetime.utcnow()
        db.commit()
    return {"status": "ok"}

# --- RAG Management Endpoints ---

class ValidRagDoc(BaseModel):
    id: int
    filename: str
    content_preview: str
    created_at: str

@app.get("/rag/documents", response_model=List[ValidRagDoc])
def list_rag_docs(db: Session = Depends(get_db)):
    docs = db.query(RagDocument).filter(RagDocument.is_active == True).all()
    res = []
    for d in docs:
        res.append({
            "id": d.id,
            "filename": d.filename,
            "content_preview": d.content[:100] + "...",
            "created_at": str(d.created_at)
        })
    return res

@app.post("/rag/documents")
def add_rag_doc(filename: str = Body(...), content: str = Body(...), db: Session = Depends(get_db)):
    doc = RagDocument(filename=filename, content=content)
    db.add(doc)
    applied_settings = apply_project_settings_from_rag(content, db)
    db.commit()
    return {"status": "added", "id": doc.id, "applied_settings": applied_settings}

@app.delete("/rag/documents/{id}")
def delete_rag_doc(id: int, db: Session = Depends(get_db)):
    doc = db.query(RagDocument).filter(RagDocument.id == id).first()
    if doc:
        doc.is_active = False # Soft delete
        sync_project_settings_from_active_rag(db)
        db.commit()
    return {"status": "deleted"}

@app.post("/generated-posts/generate", response_model=PostResponse)
def generate_post(req: PostRequest, db: Session = Depends(get_db)):
    if not GCP_PROJECT_ID:
        raise HTTPException(status_code=500, detail="GCP_PROJECT_ID not set")
    
    # Get model from settings
    model_setting = db.query(Setting).filter(Setting.key == "llm_model").first()
    model_name = model_setting.value if model_setting else os.getenv("GEMINI_MODEL", "gemini-1.5-flash-001")
    
    try:
        rag_text, used_docs = get_full_rag_content(db)

        model = GenerativeModel(model_name)
        
        prompt = POSTS_GENERATOR_PROMPT.format(
            rag_content=rag_text,
            platform=req.platform,
            user_request=req.instructions,
            style_modifiers=", ".join(req.style_modifiers),
            language=req.language
        )
        
        logger.info(f"Generating post for {req.platform} with model {model_name}")
        
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        
        # Log usage
        try:
             usage = response.usage_metadata
             db.add(LLMUsageLog(
                 model_name=model_name,
                 prompt_tokens=usage.prompt_token_count,
                 completion_tokens=usage.candidates_token_count,
                 total_tokens=usage.total_token_count,
                 call_type="post_generator"
             ))
             db.commit()
        except:
             pass

        data = json.loads(response.text)
        return {
            "content": data.get("content", ""),
            "image_prompt": data.get("image_prompt"),
            "mermaid_code": data.get("mermaid_code"),
            "used_rag_docs": used_docs
        }

    except Exception as e:
        logger.error(f"Generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generated-posts/approve")
def approve_post(req: PostApproveRequest, db: Session = Depends(get_db)):
    # Map platform string to Enum
    platform_map = {
        "linkedin": PostPlatform.LINKEDIN,
        "twitter": PostPlatform.TWITTER,
        "blog": PostPlatform.BLOG,
        # Fallback
        "x": PostPlatform.TWITTER
    }
    
    plat_enum = platform_map.get(req.platform.lower(), PostPlatform.LINKEDIN)
    
    post = GeneratedPost(
        platform=plat_enum,
        content=req.content,
        image_prompt=req.image_prompt,
        mermaid_code=req.mermaid_code,
        status=OpportunityStatus.APPROVED 
    )
    db.add(post)
    
    # Mark suggestion as used if provided
    if req.suggestion_id:
        sug = db.query(PostSuggestion).filter(PostSuggestion.id == req.suggestion_id).first()
        if sug:
            sug.is_used = True
            sug.used_at = datetime.utcnow()
    
    db.commit()
    return {"status": "approved", "id": post.id}

@app.get("/generated-posts/stats")
def get_post_stats(db: Session = Depends(get_db)):
    # Stats: Approved count per platform, last published per platform
    stats = {}
    for p in PostPlatform:
        count = db.query(GeneratedPost).filter(
            GeneratedPost.platform == p, 
            GeneratedPost.status == OpportunityStatus.APPROVED
        ).count()
        
        last = db.query(GeneratedPost).filter(
            GeneratedPost.platform == p,
            GeneratedPost.status == OpportunityStatus.APPROVED
        ).order_by(GeneratedPost.created_at.desc()).first()
        
        stats[p.value] = {
            "approved_count": count,
            "last_approved_at": str(last.created_at) if last else None
        }
        
    return stats

# --- Post Manager Endpoints ---

class DuplicationCheckRequest(BaseModel):
    platform: str
    content: str

@app.get("/posts/all")
def list_all_posts(limit: int = 100, db: Session = Depends(get_db)):
    # Return all generated posts sorted by date
    posts = db.query(GeneratedPost).order_by(GeneratedPost.created_at.desc()).limit(limit).all()
    res = []
    for p in posts:
        res.append({
            "id": p.id,
            "platform": p.platform.value,
            "content": p.content,
            "status": p.status.value,
            "created_at": str(p.created_at)
        })
    return res

@app.post("/posts/check-duplication")
def check_duplication(req: DuplicationCheckRequest, db: Session = Depends(get_db)):
    # Check if content exists for the platform
    # Simple exact match or contains? Let's do exact match first.
    # We need to map string to Enum safely
    
    platform_map = {
        "linkedin": PostPlatform.LINKEDIN,
        "twitter": PostPlatform.TWITTER,
        "blog": PostPlatform.BLOG,
        "x": PostPlatform.TWITTER
    }
    plat_enum = platform_map.get(req.platform.lower(), PostPlatform.LINKEDIN)

    existing = db.query(GeneratedPost).filter(
        GeneratedPost.platform == plat_enum,
        GeneratedPost.content == req.content
    ).first()
    
    if existing:
        return {"is_duplicate": True, "existing_id": existing.id, "created_at": str(existing.created_at)}
    
    return {"is_duplicate": False}

@app.get("/posts/activity")
def get_post_activity(days: int = 14, db: Session = Depends(get_db)):
    # Return daily stats per platform
    from datetime import timedelta
    
    start_date = datetime.utcnow() - timedelta(days=days)
    
    posts = db.query(GeneratedPost).filter(GeneratedPost.created_at >= start_date).all()
    
    activity = {}
    
    # Init dates
    for i in range(days):
        d = (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d")
        activity[d] = {p.value: 0 for p in PostPlatform}
        
    for p in posts:
        d = p.created_at.strftime("%Y-%m-%d")
        if d in activity:
            activity[d][p.platform.value] += 1
            
    # Convert to list for frontend: Sorted by date ASC for charts
    res = []
    for d in sorted(activity.keys()):
        res.append({
            "date": d,
            "stats": activity[d]
        })
    return res

# --- Comment Generator Endpoints ---
from shared.models import GeneratedComment

class CommentGenerateRequest(BaseModel):
    target_content: str
    target_url: Optional[str] = None
    platform: str
    tone: str
    language: str = "English"

class CommentGenerateResponse(BaseModel):
    comments: List[str]

class CommentLogRequest(BaseModel):
    target_content: str
    target_url: Optional[str] = None
    generated_content: str
    platform: str
    tone: str
    language: str = "English"

@app.post("/comments/generate", response_model=CommentGenerateResponse)
def generate_comments(req: CommentGenerateRequest, db: Session = Depends(get_db)):
    if not GCP_PROJECT_ID:
        raise HTTPException(status_code=500, detail="GCP_PROJECT_ID not set")
    
    # Get model from settings
    model_setting = db.query(Setting).filter(Setting.key == "llm_model").first()
    model_name = model_setting.value if model_setting else os.getenv("GEMINI_MODEL", "gemini-1.5-flash-001")
    
    try:
        # Resolve content
        final_content = req.target_content
        if not final_content and req.target_url:
            logger.info(f"Fetching content from URL: {req.target_url}")
            fetched = fetch_content_from_url(req.target_url)
            if fetched:
                final_content = fetched[:20000] # Cap to avoid context limits
            else:
                 raise HTTPException(status_code=400, detail="Failed to fetch content from URL")
        
        if not final_content:
             raise HTTPException(status_code=400, detail="No content provided (text or URL)")

        model = GenerativeModel(model_name)
        prompt = COMMENT_GENERATOR_PROMPT.format(
            target_content=final_content,
            platform=req.platform,
            tone=req.tone,
            language=req.language
        )
        
        logger.info(f"Generating comments for {req.platform} with tone {req.tone}")
        
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        
        # Log usage
        try:
             usage = response.usage_metadata
             db.add(LLMUsageLog(
                 model_name=model_name,
                 prompt_tokens=usage.prompt_token_count,
                 completion_tokens=usage.candidates_token_count,
                 total_tokens=usage.total_token_count,
                 call_type="comment_generator"
             ))
             db.commit()
        except:
             pass

        data = json.loads(response.text)
        return {"comments": data.get("comments", [])}
        
    except Exception as e:
        logger.error(f"Comment generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/comments/log")
def log_comment(req: CommentLogRequest, db: Session = Depends(get_db)):
    comment = GeneratedComment(
        target_content=req.target_content,
        target_url=req.target_url,
        generated_content=req.generated_content,
        platform=req.platform,
        tone=req.tone
    )
    db.add(comment)
    db.commit()
    return {"status": "logged", "id": comment.id}

@app.get("/comments/history")
def get_comment_history(limit: int = 50, db: Session = Depends(get_db)):
    comments = db.query(GeneratedComment).order_by(GeneratedComment.created_at.desc()).limit(limit).all()
    res = []
    for c in comments:
        res.append({
            "id": c.id,
            "target_content": c.target_content[:50] + "..." if c.target_content else "",
            "target_url": c.target_url,
            "generated_content": c.generated_content,
            "platform": c.platform,
            "tone": c.tone,
            "created_at": str(c.created_at)
        })
    return res
