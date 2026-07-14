# Frontend Status & API Handover - Phase 2 AI & Incident Management (완료)

본 문서는 백엔드 가상 시뮬레이션(Phase 0) 및 실물 데이터 저장소(Phase 1 MVP), 그리고 AI 분석 및 인시던트 관리(Phase 2) 관련 API 스펙과 프론트엔드(Next.js 14) 연계 가이드를 기술합니다.

---

## 1. 테스트 가상 사용자 계정 (RBAC 검증용)
로그인 및 각 계정 권한 범위 확인에 사용하십시오.

| 이메일 (username) | 비밀번호 | 테넌트 ID | 역할 (Role) | 설명 |
|---|---|---|---|---|
| `sysadmin@company.com` | `sysadmin123!` | `system` | `SYSTEM_ADMIN` | 시스템 어드민 (전체 테넌트 데이터 취합 조회 가능) |
| `op_scp@client.com` | `op123!` | `tenant-scp` | `TENANT_OPERATOR` | SCP 테넌트 운영자 (자격증명 등록/삭제, 경보 룰 생성 가능) |
| `op_aws@client.com` | `op123!` | `tenant-aws` | `TENANT_OPERATOR` | AWS 테넌트 운영자 (자격증명 등록/삭제, 경보 룰 생성 가능) |
| `view_scp@client.com` | `view123!` | `tenant-scp` | `TENANT_VIEWER` | SCP 테넌트 일반 사용자 (조회 전용, CUD 메뉴 비활성화 대상) |

---

## 2. API 명세서 (Phase 0 ~ Phase 2)

모든 API는 `Authorization: Bearer <JWT_TOKEN>` 헤더를 필요로 합니다. (로그인 API 제외)

### A. 인증 관련
- **로그인 및 토큰 발급**
  - `POST /api/v1/auth/login`
  - Body: `{"username": "이메일", "password": "비밀번호"}`
  - Response: `{"access_token": "...", "token_type": "bearer", "role": "...", "tenant_id": "...", "email": "..."}`

### B. 가상 관제 데이터 관련 (Phase 0 시뮬레이터)
- **리소스 토폴로지 조회**
  - `GET /api/v1/monitor/topology`
  - Query Params: `tenant_id` (SYSTEM_ADMIN만 지정 가능, 일반 사용자는 자사 테넌트로 고정)
  - Response: `{ nodes: [...], links: [...] }` (리소스 노드 맵 렌더링용)
- **실시간 메트릭 시계열 조회**
  - `GET /api/v1/monitor/metrics`
  - Query Params: `node_id` (예: scp-vm-web-01), `metric_name` (cpu/memory), `minutes` (예: 60)
  - Response: `[{"timestamp": "...", "value": 45.2}, ...]`
- **실시간 로그 스트림 조회**
  - `GET /api/v1/monitor/logs`
  - Response: `[{"timestamp": "...", "node_id": "...", "message": "...", "level": "info"}, ...]`
- **이상탐지 및 발생 이벤트 조회**
  - `GET /api/v1/monitor/events`
  - Response: `List[EventSchema]`
- **FinOps 비용 대시보드 조회**
  - `GET /api/v1/monitor/costs`
  - Response: 월별 총액, 일별 평균 및 7일 비용 트렌드 리스트, 최적화 추천 리스트 (Decimal 직렬화)

### C. 클라우드 연동 자격증명 관리 (Phase 1)
- **자격증명 신규 등록 (봉투 암호화 적용)**
  - `POST /api/v1/credentials`
  - Body: `{"provider": "scp | aws", "name": "식별명칭", "auth_data": "인증정보문자열"}`
  - Response: `{"id": 1, "tenant_id": "...", "provider": "...", "name": "...", "created_at": "..."}`
- **자격증명 목록 조회 (평문 마스킹)**
  - `GET /api/v1/credentials`
  - Response: `List[CredentialResponse]`
- **자격증명 상세 조회 (복호화 원문 노출 - 운영자 전용)**
  - `GET /api/v1/credentials/{credential_id}/decrypted`
  - Response: `{"id": 1, "provider": "...", "name": "...", "decrypted_auth_data": "복호화된평문", ...}`
- **자격증명 삭제**
  - `DELETE /api/v1/credentials/{credential_id}`
  - Response: `204 No Content`

### D. 경보 임계치 룰 및 보안 감사 로그 (Phase 1)
- **경보 룰 신규 등록 (임계치 감시)**
  - `POST /api/v1/alerts/rules`
  - Body: `{"name": "경보명", "metric_name": "cpu|memory|disk", "operator": "gt|lt|eq", "threshold": 90.0, "duration_minutes": 5}`
  - Response: `{"id": 1, "tenant_id": "...", "name": "...", "metric_name": "...", "operator": "...", "threshold": 90.0, "is_active": true, ...}`
- **경보 룰 목록 조회**
  - `GET /api/v1/alerts/rules`
  - Response: `List[AlertRuleResponse]`
- **경보 룰 삭제**
  - `DELETE /api/v1/alerts/rules/{rule_id}`
  - Response: `204 No Content`
- **보안 감사 로그 조회 (모든 자격증명 CUD 및 룰 CUD 행위 자동 로깅)**
  - `GET /api/v1/alerts/audit-logs`
  - Query Params: `limit` (기본 100)
  - Response: `List[AuditLogResponse]` (작업 내역 추적용)

### E. AI 및 장애 인시던트 관리 (Phase 2)
- **장애 인시던트 목록 조회**
  - `GET /api/v1/incidents`
  - Response: `List[IncidentResponse]` (현재 로그인된 테넌트의 장애 인시던트 목록 반환)
- **장애 인시던트 상세 및 타임라인 조회**
  - `GET /api/v1/incidents/{incident_id}`
  - Response: `{"incident": IncidentResponse, "timeline": List[IncidentTimelineResponse]}` (장애 정보와 트레이스 로그 통합 노출)
- **인시던트 조치 상태 변경**
  - `PUT /api/v1/incidents/{incident_id}`
  - Body: `{"status": "INVESTIGATING | RESOLVED", "assigned_to": "이메일 | null"}`
  - Response: `IncidentResponse` (상태 변경 및 대응 내역이 타임라인에 즉시 로깅됨)
- **AI 기반 장애 원인 분석 (RCA) 및 런북 추천**
  - `POST /api/v1/incidents/{incident_id}/analyze`
  - Response: `{"summary": "장애 요약", "probable_cause": "RCA 근본원인 분석", "recommended_runbook": "권장 조치 가이드", "analyzed_at": "분석 시간"}` (L4 가상 AI 비서 탑재)
- **월간 MSP 운영 보고서 자동 생성**
  - `GET /api/v1/incidents/report/monthly`
  - Response: `{"report_markdown": "Markdown 형식의 보고서 텍스트"}` (가용성 SLA, 리소스 피크, 비용 및 rightsizing 절감액 요약문 자동 조립)
- **L5 AI 자동조치(Remediation) 승인 및 실행**
  - `POST /api/v1/incidents/{incident_id}/remediate`
  - Response: `IncidentResponse` (운영자 승인 로그와 VM 런북 가동 결과가 타임라인에 순차 강제 로깅됨)
- **Ed25519 라이선스 유효성 및 만료 상태 조회**
  - `GET /api/v1/license`
  - Response: `{"edition": "Dedicated AI | MSP Central", "expire_date": "YYYY-MM-DD", "max_nodes": 50, "max_tenants": 1, "is_valid": true, "is_expired": false, "is_evaluation": false}`

---

## 3. 프론트엔드 연동 개발 권장 라이브러리 및 요구사항
- **인포그래픽 / 노드 관계 맵**:
  - D3.js 혹은 Cytoscape.js를 사용해 `/monitor/topology`가 반환하는 Parent-Child 및 Network Flow 관계 기반의 노드 그래프 시각화.
  - 노드의 `status`가 `warning`인 경우 테두리 점멸 또는 색상 변화 애니메이션 적용.
- **인시던트 제어 허브**:
  - AWS 관리 콘솔 스타일의 테이블 뷰와 사건 경과를 한눈에 보여주는 타임라인(Timeline Trail) 뷰를 연동할 것.
  - AI RCA 기능 수행 시 오퍼레이터 화면에 하이라이트 경고 상자 및 런북 실행 셸 복사 기능을 제공할 것.
- **차트**: Recharts 또는 Chart.js 라이브러리 활용.
- **비용**: 금액 정보 표기 시 소수점 내림/올림 처리를 프론트엔드에서 수동 계산하지 말고, API가 반환하는 정밀 문자열 형태 그대로 화면에 렌더링할 것.
