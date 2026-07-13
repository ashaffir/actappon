import time
import schedule
import logging
from processor import run_pipeline
from shared.database import init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def job():
    logger.info("Starting pipeline job...")
    run_pipeline()
    logger.info("Pipeline job complete.")

# Ensure DB init
init_db()

# Run frequently (e.g. every minute) as it processes local DB records
schedule.every(1).minutes.do(job)

job()

if __name__ == "__main__":
    logger.info("Pipeline service started.")
    while True:
        schedule.run_pending()
        time.sleep(1)
