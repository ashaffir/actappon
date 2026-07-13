import os
import logging
import json
import vertexai
from vertexai.generative_models import GenerativeModel, Part
from sqlalchemy.orm import Session
from shared.database import get_db
from shared.models import Opportunity, Draft, OpportunityStatus, Setting, LLMUsageLog, RagDocument
from prompts import QUALIFIER_PROMPT, STRATEGIST_PROMPT, COMPOSER_PROMPT

logger = logging.getLogger(__name__)

# Configure Vertex AI
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID")
GCP_LOCATION = os.getenv("GCP_LOCATION", "us-central1")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

if GCP_PROJECT_ID:
    try:
        vertexai.init(project=GCP_PROJECT_ID, location=GCP_LOCATION)
        model = GenerativeModel(GEMINI_MODEL)
    except Exception as e:
        logger.error(f"Failed to init Vertex AI: {e}")
        model = None
else:
    logger.warning("GCP_PROJECT_ID not found")
    model = None

def strip_frontmatter(content: str) -> str:
    lines = content.lstrip("\ufeff").splitlines()
    if not lines or lines[0].strip() != "---":
        return content

    for idx, line in enumerate(lines[1:], start=1):
        if line.strip() == "---":
            return "\n".join(lines[idx + 1:]).strip()
    return content

def get_project_context(db: Session) -> str:
    docs = db.query(RagDocument).filter(RagDocument.is_active == True).order_by(RagDocument.created_at.asc()).all()
    if not docs:
        return "No active RAG context documents are configured."
    return "\n\n".join(
        f"--- Document: {doc.filename} ---\n{strip_frontmatter(doc.content)}"
        for doc in docs
    )

def run_llm_processor(should_continue=None):
    db = next(get_db())

    
    # Reload model from settings if available
    model_setting = db.query(Setting).filter(Setting.key == "llm_model").first()
    model_name = model_setting.value if model_setting else GEMINI_MODEL
    
    try:
        current_model = GenerativeModel(model_name)
    except Exception as e:
        logger.error(f"Failed to init Vertex AI with model {model_name}: {e}")
        return

    logger.info(f"Running LLM Processor (Vertex AI) with {model_name}...")
    project_context = get_project_context(db)
    
    opportunities = db.query(Opportunity).filter(
        Opportunity.status == OpportunityStatus.PENDING,
        (Opportunity.analysis_summary == "") | (Opportunity.analysis_summary == None)
    ).limit(10).all()
    
    for opp in opportunities:
        if should_continue and not should_continue():
            logger.info("LLM Processor stopping early due to signal.")
            break
        process_opportunity(db, opp, current_model, model_name, project_context)

    
    db.commit()
    logger.info("LLM Processor complete.")

def process_opportunity(db: Session, opp: Opportunity, llm_model, model_string_name, project_context):
    if not opp.candidate:
        logger.warning(f"Opportunity {opp.id} has no candidate data")
        return

    logger.info(f"Analyzing opportunity {opp.id}...")
    
    candidate_data = {
        "title": opp.candidate.title,
        "body_excerpt": opp.candidate.raw_content[:2000],
        "source": opp.candidate.source
    }
    
    qualifier_resp = generate_json(db, llm_model, QUALIFIER_PROMPT, str(candidate_data), "qualifier", model_string_name, project_context)
    if not qualifier_resp:
        logger.error(f"Failed to qualify {opp.id}")
        return

    opp.signal_strength = qualifier_resp.get("signal_strength", 0.0)
    opp.failure_mode = qualifier_resp.get("failure_mode", "unknown")
    opp.risk_flags = qualifier_resp.get("risk_flags", [])
    opp.risk_score = qualifier_resp.get("risk_score", 0.0)
    opp.analysis_summary = qualifier_resp.get("why_relevant", "")
    opp.recommended_action = qualifier_resp.get("recommended_action", "ignore")
    
    # Load thresholds
    min_signal_setting = db.query(Setting).filter(Setting.key == "min_signal_strength").first()
    min_signal = float(min_signal_setting.value) if min_signal_setting else 0.4

    max_risk_setting = db.query(Setting).filter(Setting.key == "risk_score_threshold").first()
    max_risk = float(max_risk_setting.value) if max_risk_setting else 0.5 

    if opp.signal_strength < min_signal:
        logger.info(f"Opportunity {opp.id} rejected: Signal {opp.signal_strength} < {min_signal}")
        opp.status = OpportunityStatus.REJECTED
        return

    if opp.risk_score > max_risk:
        logger.info(f"Opportunity {opp.id} rejected: Risk {opp.risk_score} > {max_risk}")
        opp.status = OpportunityStatus.REJECTED
        return

    if opp.recommended_action == "ignore":
        opp.status = OpportunityStatus.REJECTED
        return

    strategist_resp = generate_json(db, llm_model, STRATEGIST_PROMPT, json.dumps(qualifier_resp), "strategist", model_string_name, project_context)
    
    drafting_context = f"Candidate: {candidate_data}\nAnalysis: {qualifier_resp}\nStrategy: {strategist_resp}"
    composer_resp = generate_json(db, llm_model, COMPOSER_PROMPT, drafting_context, "composer", model_string_name, project_context)
    
    if composer_resp:
        for variant, content in composer_resp.items():
            if content:
                draft = Draft(
                    opportunity_id=opp.id,
                    variant_name=variant,
                    content=content
                )
                db.add(draft)
        
        opp.updated_at = datetime.utcnow()

def generate_json(db, active_model, prompt, context, call_type, model_name, project_context):
    try:
        full_prompt = f"{prompt}\n\nProject Context:\n{project_context}\n\nCandidate Context:\n{context}"
        # Vertex AI generation
        response = active_model.generate_content(
            full_prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        
        # Log Usage
        try:
            usage = response.usage_metadata
            log = LLMUsageLog(
                model_name=model_name,
                prompt_tokens=usage.prompt_token_count,
                completion_tokens=usage.candidates_token_count,
                total_tokens=usage.total_token_count,
                call_type=call_type
            )
            db.add(log)
        except Exception as e:
            logger.error(f"Failed to log usage: {e}")

        return json.loads(response.text)
    except Exception as e:
        logger.error(f"LLM Generation failed: {e}")
        return None

from datetime import datetime
