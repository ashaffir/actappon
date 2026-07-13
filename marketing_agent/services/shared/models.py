import enum
from sqlalchemy import Column, Integer, String, Text, DateTime, Float, ForeignKey, JSON, Enum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class OpportunityStatus(enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class ActionStatus(enum.Enum):
    PENDING = "pending"
    EXECUTED = "executed"
    FAILED = "failed"

class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String, index=True) # github, linkedin, rss
    search_query = Column(String) # The query that found this candidate
    source_id = Column(String, unique=True, index=True) # e.g. github url or issue id
    url = Column(String)
    title = Column(String)
    raw_content = Column(Text)
    author = Column(String, nullable=True)
    fetched_at = Column(DateTime, default=datetime.utcnow)

    opportunity = relationship("Opportunity", back_populates="candidate", uselist=False)

class Opportunity(Base):
    __tablename__ = "opportunities"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("candidates.id"))
    signal_strength = Column(Float)
    failure_mode = Column(String)
    recommended_action = Column(String)
    risk_flags = Column(JSON) # List of strings
    risk_score = Column(Float, default=0.0)
    analysis_summary = Column(Text)
    status = Column(Enum(OpportunityStatus), default=OpportunityStatus.PENDING)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

    candidate = relationship("Candidate", back_populates="opportunity")
    drafts = relationship("Draft", back_populates="opportunity")
    actions = relationship("Action", back_populates="opportunity")

class Draft(Base):
    __tablename__ = "drafts"

    id = Column(Integer, primary_key=True, index=True)
    opportunity_id = Column(Integer, ForeignKey("opportunities.id"))
    variant_name = Column(String) # A, B, C
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    opportunity = relationship("Opportunity", back_populates="drafts")

class Action(Base):
    __tablename__ = "actions"

    id = Column(Integer, primary_key=True, index=True)
    opportunity_id = Column(Integer, ForeignKey("opportunities.id"))
    channel = Column(String)
    content_to_post = Column(Text)
    status = Column(Enum(ActionStatus), default=ActionStatus.PENDING)
    executed_at = Column(DateTime, nullable=True)
    outcome = Column(Text, nullable=True)
    error_log = Column(Text, nullable=True)

    opportunity = relationship("Opportunity", back_populates="actions")

class Cooldown(Base):
    __tablename__ = "cooldowns"

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String) # repo, user
    entity_id = Column(String, index=True)
    last_engaged_at = Column(DateTime)

class SystemStatus(Base):
    __tablename__ = "system_status"
    service_name = Column(String, primary_key=True) # collector, pipeline, llm, executor
    last_run_at = Column(DateTime)
    status = Column(String) # IDLE, RUNNING
    desired_state = Column(String, default="RUNNING") # RUNNING, PAUSED, STOPPED
    message = Column(String)
    trigger_run = Column(Boolean, default=False) # Helper for ad-hoc


class Setting(Base):
    __tablename__ = "settings"
    key = Column(String, primary_key=True)
    value = Column(String)
    description = Column(String)

class LLMUsageLog(Base):
    __tablename__ = "llm_usage_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    model_name = Column(String)
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    call_type = Column(String) # qualifier, strategist, composer

class PostPlatform(enum.Enum):
    LINKEDIN = "linkedin"
    TWITTER = "twitter"
    BLOG = "blog"

class GeneratedPost(Base):
    __tablename__ = "generated_posts"
    
    id = Column(Integer, primary_key=True, index=True)
    platform = Column(Enum(PostPlatform))
    content = Column(Text)
    image_prompt = Column(Text, nullable=True) # For graphical aids
    mermaid_code = Column(Text, nullable=True) # For graphical aids
    status = Column(Enum(OpportunityStatus), default=OpportunityStatus.PENDING) 
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

class PostSuggestion(Base):
    __tablename__ = "post_suggestions"
    
    id = Column(Integer, primary_key=True, index=True)
    platform = Column(Enum(PostPlatform))
    content = Column(Text)
    is_used = Column(Boolean, default=False)
    used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class RagDocument(Base):
    __tablename__ = "rag_documents"
    
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    content = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class GeneratedComment(Base):
    __tablename__ = "generated_comments"

    id = Column(Integer, primary_key=True, index=True)
    target_content = Column(Text) # The content being commented on
    target_url = Column(String, nullable=True)
    generated_content = Column(Text)
    platform = Column(String) # linkedin, twitter, etc
    tone = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


