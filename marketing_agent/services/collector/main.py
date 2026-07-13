import time
import schedule
import logging
from github_harvester import run_github_harvest as run_harvester
from reddit_harvester import run_reddit_harvest


from shared.database import init_db, get_db
from shared.models import SystemStatus, Setting
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SERVICE_NAME = "collector"

# Setup DB Logging
try:
    from shared.log_handler import DbLogHandler
    db_handler = DbLogHandler(SERVICE_NAME)
    db_handler.setLevel(logging.INFO)
    logger.addHandler(db_handler)
    # Also attach to root logger to capture library logs if wanted
    logging.getLogger().addHandler(db_handler)
except Exception as e:
    logger.error(f"Failed to setup DB logging: {e}")


def update_status(status, message=None, last_run=False):
    db = next(get_db())
    try:
        record = db.query(SystemStatus).filter(SystemStatus.service_name == SERVICE_NAME).first()
        if not record:
            record = SystemStatus(service_name=SERVICE_NAME)
            db.add(record)
        
        record.status = status
        if message: record.message = message
        if last_run: record.last_run_at = datetime.utcnow()
        # Reset trigger if we are starting a run
        if status == "RUNNING": record.trigger_run = False
        
        db.commit()
    except Exception as e:
        logger.error(f"Failed to update status: {e}")
    finally:
        db.close()

def check_trigger():
    db = next(get_db())
    try:
        record = db.query(SystemStatus).filter(SystemStatus.service_name == SERVICE_NAME).first()
        if record and record.trigger_run:
            logger.info("Trigger detected! Running job...")
            job()
    finally:
        db.close()

def job():
    logger.info("Starting collector job...")
    update_status("RUNNING", "Harvesting candidates...")
    try:
        run_harvester()
        run_reddit_harvest()
        update_status("IDLE", "Harvest complete", last_run=True)
        logger.info("Collector job complete.")
    except Exception as e:
        logger.error(f"Job failed: {e}")
        update_status("IDLE", f"Failed: {str(e)}")

# Ensure DB init
init_db()

# Initial status
update_status("IDLE", "Waiting for schedule")

# Run frequently (e.g. every 6 hours)
def run_check_loop():
    db = next(get_db())
    try:
        # Check trigger
        status_record = db.query(SystemStatus).filter(SystemStatus.service_name == SERVICE_NAME).first()
        if status_record:
            if status_record.desired_state == "PAUSED":
                logger.info("Service PAUSED. Skip.")
                update_status("PAUSED", "Service paused by user")
                return
            if status_record.desired_state == "STOPPED":
                 logger.info("Service STOPPED.")
                 update_status("STOPPED", "Service stopped by user")
                 return

            if status_record.trigger_run:
                logger.info("Trigger detected! Running job...")
                job()
                return

        # Check Interval
        interval_setting = db.query(Setting).filter(Setting.key == "harvest_interval_hours").first()
        interval_hours = int(interval_setting.value) if interval_setting else 6
        
        last_run = status_record.last_run_at if status_record else None
        
        should_run = False
        if not last_run:
            should_run = True
        else:
             if datetime.utcnow() - last_run > timedelta(hours=interval_hours):
                 should_run = True
        
        if should_run:
            logger.info(f"Scheduled interval ({interval_hours}h) reached. Running job...")
            job()
            
    except Exception as e:
        logger.error(f"Check loop error: {e}")
    finally:
        db.close()

# Run frequently to check db state
schedule.every(1).minutes.do(run_check_loop)

# Run once on startup
# job() # Removing auto-run on startup to let loop handle it or avoid double run if just restarted


if __name__ == "__main__":
    logger.info("Collector service started.")
    while True:
        schedule.run_pending()
        time.sleep(1)
