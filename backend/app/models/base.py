from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, DateTime, Boolean, ForeignKey, Numeric, UniqueConstraint
from datetime import datetime
from typing import List, Optional

class Base(DeclarativeBase):
    pass

class Tenant(Base):
    __tablename__ = "tenant"
    
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # 데모 워크스페이스 플래그 - 실 고객사(False)와 완전히 분리된, 명확히 라벨된 데모
    # 고객사(True)를 구분한다. True인 테넌트만 데모 엔진(backend/app/services/demo/)의
    # 데이터를 서빙받는다 - 실 고객사 경로(cloud_adapter 실연동)는 항상 False로 유지된다.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

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

    # L5 추천→승인→실행 3단계 상태머신 (헌법 #4: AI 추천, 사람 결정)
    remediation_status: Mapped[str] = mapped_column(String(50), default="NONE")  # NONE|RECOMMENDED|APPROVED|EXECUTED
    remediation_action: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    remediation_approved_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    tenant: Mapped["Tenant"] = relationship(back_populates="incidents")
    timeline_events: Mapped[List["IncidentTimeline"]] = relationship(back_populates="incident", cascade="all, delete-orphan")

class TenantServiceSetting(Base):
    """
    테넌트별 프로바이더 과금(유료) 서비스 옵트인 설정 (예: SCP Cloud Monitoring/Cloud
    Logging). CEO 결정(2026-07-20): 운영자가 해당 고객사에 대해 명시적으로 켜기 전에는
    백엔드가 유료 외부 API를 절대 호출하지 않는다 - 무단 과금 서프라이즈 방지가 목적이다.

    (tenant_id, provider, service_key) 행이 없으면 비활성(OFF)으로 간주한다 -
    "부재 = 비활성"이 명시적 기본값이며, 이 규칙은 라우터(monitor.py)의 게이트 로직이
    강제한다.
    """
    __tablename__ = "tenant_service_setting"
    __table_args__ = (
        UniqueConstraint("tenant_id", "provider", "service_key", name="uq_tenant_service_setting"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String(50), ForeignKey("tenant.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)  # scp, aws
    service_key: Mapped[str] = mapped_column(String(50), nullable=False)  # monitoring, logging
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # 마지막 실 API 호출 결과 - unknown(호출 이력 없음)|ok|forbidden(403)|error(그 외 실패)
    last_status: Mapped[str] = mapped_column(String(20), default="unknown", nullable=False)
    last_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class IncidentTimeline(Base):
    __tablename__ = "incident_timeline"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incident_id: Mapped[int] = mapped_column(Integer, ForeignKey("incident.id"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)  # create, status_change, comment, ai_recommendation
    actor: Mapped[str] = mapped_column(String(100), nullable=False)  # System, AIOps AI, op_scp@client.com
    message: Mapped[str] = mapped_column(String(1000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    incident: Mapped["Incident"] = relationship(back_populates="timeline_events")
