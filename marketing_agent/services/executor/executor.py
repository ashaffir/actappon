import os
import logging
import requests
import time
from datetime import datetime
from sqlalchemy.orm import Session
from shared.database import get_db
from shared.models import Action, ActionStatus, Cooldown

logger = logging.getLogger(__name__)

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json"
} if GITHUB_TOKEN else {}

def run_executor():
    if not GITHUB_TOKEN:
        logger.error("GITHUB_TOKEN not found, skipping execution.")
        return

    db = next(get_db())
    
    # Get PENDING approved actions
    actions = db.query(Action).filter(Action.status == ActionStatus.PENDING).limit(5).all()
    
    for action in actions:
        execute_action(db, action)
        # Rate limit safety: sleep 2 seconds between actions
        time.sleep(2)
    
    db.commit()

def execute_action(db: Session, action: Action):
    logger.info(f"Log-only execution for action {action.id} (Opportunity {action.opportunity_id})")
    
    # Manual Mode: We don't post. We just mark as executed.
    # The user will copy/paste manually.
    
    action.status = ActionStatus.EXECUTED
    action.executed_at = datetime.utcnow()
    action.outcome = "Manual log by user preference"
    
    # Update Cooldowns (Repo and User)
    try:
        cand = action.opportunity.candidate
        if cand:
            if cand.author:
                db.add(Cooldown(entity_type="user", entity_id=cand.author, last_engaged_at=datetime.utcnow()))
    except Exception as e:
        logger.error(f"Error updating cooldowns: {e}")
        # Don't fail the action for this

# post_github_comment removed
