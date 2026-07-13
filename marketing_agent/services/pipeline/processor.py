import logging
import re
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import or_
from shared.database import get_db
from shared.models import Candidate, Opportunity, OpportunityStatus, Cooldown

logger = logging.getLogger(__name__)

def parse_repo_from_url(url):
    # https://github.com/user/repo/issues/123
    match = re.search(r"github\.com/([^/]+/[^/]+)", url)
    if match:
        return match.group(1)
    return None

def is_cooled_down(db: Session, entity_type: str, entity_id: str, days: int) -> bool:
    if not entity_id:
        return False
        
    cutoff = datetime.utcnow() - timedelta(days=days)
    cooldown = db.query(Cooldown).filter(
        Cooldown.entity_type == entity_type,
        Cooldown.entity_id == entity_id,
        Cooldown.last_engaged_at > cutoff
    ).first()
    
    return cooldown is not None

def run_pipeline():
    db = next(get_db())
    logger.info("Running pipeline...")
    
    # Get candidates without an opportunity
    candidates = db.query(Candidate).outerjoin(Opportunity).filter(Opportunity.id == None).limit(50).all()
    
    processed_count = 0
    for candidate in candidates:
        if process_candidate(db, candidate):
            processed_count += 1
    
    db.commit()
    logger.info(f"Pipeline run complete. Created {processed_count} new opportunities.")

def process_candidate(db: Session, candidate: Candidate) -> bool:
    # 1. Cooldown Check - Author (14 days)
    if candidate.author and is_cooled_down(db, "user", candidate.author, 14):
        logger.info(f"Skipping candidate {candidate.id} due to author cooldown: {candidate.author}")
        # Create rejected opportunity or just skip? 
        # Better to create rejected opp so we don't re-process it forever
        create_rejected_opportunity(db, candidate, "author_cooldown")
        return False

    # 2. Cooldown Check - Repo (7 days)
    repo_name = parse_repo_from_url(candidate.url)
    if repo_name and is_cooled_down(db, "repo", repo_name, 7):
         logger.info(f"Skipping candidate {candidate.id} due to repo cooldown: {repo_name}")
         create_rejected_opportunity(db, candidate, "repo_cooldown")
         return False

    # 3. Create Pending Opportunity
    logger.info(f"Creating opportunity for candidate {candidate.id}: {candidate.title}")
    opp = Opportunity(
        candidate_id=candidate.id,
        status=OpportunityStatus.PENDING, # Ready for LLM
        signal_strength=0.0,
        failure_mode="unknown",
        recommended_action="unknown",
        risk_flags=[],
        analysis_summary=""
    )
    db.add(opp)
    return True

def create_rejected_opportunity(db: Session, candidate: Candidate, reason: str):
    opp = Opportunity(
        candidate_id=candidate.id,
        status=OpportunityStatus.REJECTED,
        signal_strength=0.0,
        failure_mode="N/A",
        recommended_action="ignore",
        risk_flags=[reason],
        analysis_summary=f"Auto-rejected due to {reason}"
    )
    db.add(opp)
