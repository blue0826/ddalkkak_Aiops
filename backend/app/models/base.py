from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, DateTime, Boolean, ForeignKey, Numeric
from datetime import datetime
from typing import List, Optional

class Base(DeclarativeBase):
    pass

class Tenant(Base):
    __tablename__ = "tenant"
    
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    users: Mapped[List["User"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    credentials: Mapped[List["CloudCredential"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    alert_rules: Mapped[List["AlertRule"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    incidents: Mapped[List["Incident"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")

class User(Base):
    __tablename__ = "user"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(50), ForeignKey("tenant.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)  # SYSTEM_ADMIN, TENANT_OPERATOR, TENANT_VIEWER
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    tenant: Mapped["Tenant"] = relationship(back_populates="users")

class CloudCredential(Base):
    __tablename__ = "cloud_credential"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(50), ForeignKey("tenant.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)  # scp, aws
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    encrypted_auth_data: Mapped[str] = mapped_column(String(1000), nullable=False)
    key_id: Mapped[str] = mapped_column(String(100), nullable=False)  # Envelope Encryption KEK 매핑용
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    tenant: Mapped["Tenant"] = relationship(back_populates="credentials")

class AlertRule(Base):
    __tablename__ = "alert_rule"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(50), ForeignKey("tenant.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(50), nullable=False)  # cpu, memory, disk, network, cost
    operator: Mapped[str] = mapped_column(String(10), nullable=False)  # gt, lt, eq
    threshold: Mapped[float] = mapped_column(nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=5)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    tenant: Mapped["Tenant"] = relationship(back_populates="alert_rules")

class AuditLog(Base):
    __tablename__ = "audit_log"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(50), ForeignKey("tenant.id"), nullable=False)
    user_email: Mapped[str] = mapped_column(String(100), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)  # login, create_credential, modify_rule, delete_credential
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(100), nullable=False)
    details: Mapped[str] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class Incident(Base):
    __tablename__ = "incident"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(50), ForeignKey("tenant.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="OPEN")  # OPEN, INVESTIGATING, RESOLVED
    severity: Mapped[str] = mapped_column(String(50), default="WARNING")  # INFO, WARNING, CRITICAL
    assigned_to: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    tenant: Mapped["Tenant"] = relationship(back_populates="incidents")
    timeline_events: Mapped[List["IncidentTimeline"]] = relationship(back_populates="incident", cascade="all, delete-orphan")

class IncidentTimeline(Base):
    __tablename__ = "incident_timeline"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incident_id: Mapped[int] = mapped_column(Integer, ForeignKey("incident.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)  # create, status_change, comment, ai_recommendation
    actor: Mapped[str] = mapped_column(String(100), nullable=False)  # System, AIOps AI, op_scp@client.com
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    incident: Mapped["Incident"] = relationship(back_populates="timeline_events")
