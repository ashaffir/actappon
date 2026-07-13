import time
import schedule
import logging
from analyzer import run_llm_processor
from shared.database import init_db, get_db
from shared.models import SystemStatus

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SERVICE_NAME = "llm"

# Setup DB Logging
try:
    from shared.log_handler import DbLogHandler
    db_handler = DbLogHandler(SERVICE_NAME)
    db_handler.setLevel(logging.INFO)
    logger.addHandler(db_handler)
    logging.getLogger().addHandler(db_handler)
except Exception as e:
    logger.error(f"Failed to setup DB logging: {e}")

def get_desired_state():
    db = next(get_db())
    try:
        s = db.query(SystemStatus).filter(SystemStatus.service_name == SERVICE_NAME).first()
        return s.desired_state if s else "RUNNING"
    except:
        return "RUNNING"
    finally:
        db.close()

def update_status(status, message=None):
    db = next(get_db())
    try:
        record = db.query(SystemStatus).filter(SystemStatus.service_name == SERVICE_NAME).first()
        if not record:
            record = SystemStatus(service_name=SERVICE_NAME)
            db.add(record)
        record.status = status
        if message: record.message = message
        record.last_run_at = __import__("datetime").datetime.utcnow()
        db.commit()
    except Exception as e:
        logger.error(f"Failed to verify status: {e}")
    finally:
        db.close()

def job():
    state = get_desired_state()
    if state == "PAUSED":
        logger.info("LLM PAUSED.")
        update_status("PAUSED", "Paused by user")
        return
    if state == "STOPPED":
        logger.info("LLM STOPPED.")
        update_status("STOPPED", "Stopped by user")
        return

    update_status("RUNNING", "Processing opportunities...")
    logger.info("Starting LLM processor job...")
    
    def check_stop():
        # returns True if we should continue, False if we should stop
        state = get_desired_state()
        if state in ["PAUSED", "STOPPED"]:
            return False
        return True

    try:
        run_llm_processor(should_continue=check_stop)
        update_status("IDLE", "Job complete")
        logger.info("LLM processor job complete.")
    except Exception as e:
        logger.error(f"LLM failed: {e}")
        update_status("IDLE", f"Failed: {e}")

# Ensure DB init
init_db()

# Run frequently (e.g. every minute)
schedule.every(1).minutes.do(job)

# Run once on startup
# job()

if __name__ == "__main__":
    logger.info("LLM Service started.")
    while True:
        schedule.run_pending()
        time.sleep(1)
