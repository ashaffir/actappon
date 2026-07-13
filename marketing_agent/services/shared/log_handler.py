import logging
import datetime
from sqlalchemy.orm import Session
from sqlalchemy import create_engine, text
import os

# We need a separate engine or connection method usually to avoid messing up main app session
# but for simplicity, we'll assume we can get a session or use a raw connection
# Actually, for logging, robust error handling is needed so we don't crash app on log error

DATABASE_URL = os.getenv("DATABASE_URL")

class DbLogHandler(logging.Handler):
    def __init__(self, service_name):
        super().__init__()
        self.service_name = service_name
        self.engine = create_engine(DATABASE_URL) if DATABASE_URL else None
        
    def emit(self, record):
        if not self.engine:
            return

        try:
            msg = self.format(record)
            # Use raw sql for speed and simplicity in logger
            # Truncate message to fit? Text is usually large enough.
            
            # Escape single quotes in msg manually or use params
            # Using execute with params is safer
            
            query = text("""
                UPDATE system_status 
                SET message = :msg 
                WHERE service_name = :service
            """)
            
            with self.engine.connect() as conn:
                conn.execute(query, {"msg": msg, "service": self.service_name})
                conn.commit()
                
        except Exception:
            self.handleError(record)
