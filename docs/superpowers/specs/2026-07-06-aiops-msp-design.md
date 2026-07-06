# 멀티클라우드 AIOps MSP 플랫폼 — 기획 설계서 v0.1

> **작성**: Fable 5 (기획 전담) · 2026-07-06 · CEO 지시 "SCP v2 + AWS AI Ops 시스템 전체 기획"
> **상태**: 초안 — §10 잔여 결정 항목 확정 전까지 코드 작업 금지 (Fable = 코딩 금지 원칙 준수)
> **위치**: `C:\AI_Projects\ddalkkak_Aiops` (2026-07-06 CEO 확정 — WAPLO와 완전 별개,
> **CEO 소속 회사 업무용** 프로젝트)

---

## 1. 한 줄 정의

여러 고객사의 **삼성클라우드플랫폼(SCP) v2 + AWS** 인프라를 한 콘솔에서
관제·분석·자동조치하는 **멀티테넌트 AIOps 플랫폼**.
MSP 운영센터용 중앙(SaaS) 모드가 기본이며, 플랫폼 서비스 이용이 불가능한
고객사는 해당 고객사 클라우드 안에 동일 시스템을 **전용(Dedicated) 설치**하여
운영한다. 두 모드는 **라이선스와 설정**으로 구성이 분기된다 (코드베이스 단일).

### 요구사항 (CEO 지시 원문 해석)

| # | 요구 | 설계 반영 |
|---|---|---|
| R1 | SCP v2 + AWS 대상 AIOps | §4 Provider Adapter 계층 |
| R2 | MSP 운영용 — 다수 고객사 테넌트 분리 관리 | §5 멀티테넌시 |
| R3 | 플랫폼 서비스 불가 고객사 → 고객 클라우드에 구축 | §3 배포 모델 (Dedicated) |
| R4 | 라이선스/설정에 따라 구성 분기 | §6 라이선스 시스템 |

---

## 2. 접근안 비교 (3안)

| | A. 풀커스텀 자체 개발 | B. 오픈소스 조립 | C. 상용 재판매 |
|---|---|---|---|
| 구성 | 전부 자체 구현 | Grafana/Prometheus/Keep 등 + 커스텀 글루 | Datadog/OpsRamp 등 + 스크립트 |
| SCP v2 지원 | 어댑터 직접 구현 ✅ | exporter 직접 구현 필요 | ❌ 사실상 불가 |
| 멀티테넌트 MSP | 설계대로 ✅ | 도구별 테넌트 개념 불일치 ⚠️ | 벤더 종속 |
| Dedicated 설치 | 패키징 자유 ✅ | 구성요소 많아 무거움 ⚠️ | ❌ 불가/고가 |
| 라이선스 게이팅 | 자유 ✅ | 어려움 | 불가 |
| 속도 | 느림 ⚠️ | 빠름 ✅ | 가장 빠름 |

**★ 추천: A+B 하이브리드** — 컨트롤플레인(테넌트·라이선스·알림·AI·콘솔)은
자체 개발, **저장 계층은 검증된 오픈소스**(시계열: VictoriaMetrics, 로그: Loki)를
컴포넌트로 채택. 차별화 가치(SCP 지원·멀티테넌트·Dedicated·AI)는 직접 만들고,
차별화가 아닌 것(TSDB·로그 저장)은 만들지 않는다.

---

## 3. 배포 모델 (R3·R4 핵심)

### 3.1 Mode C — Central (MSP 운영센터, 기본)

- 자사가 호스팅하는 **멀티테넌트** 컨트롤플레인. 운영팀이 전 고객사를 한 콘솔에서 관제.
- 고객사 연결 방식 2종 (고객사별 선택):
  - **C-1 Agentless**: 고객사가 발급한 최소권한 API 자격증명 등록 → 중앙에서 pull 수집. 온보딩 가장 빠름.
  - **C-2 Collector**: 고객 VPC 내 경량 수집기 설치 → outbound TLS 단방향 전송. 고객사가 자격증명 외부 반출을 거부할 때.

### 3.2 Mode D — Dedicated (고객 클라우드 내 전용 설치)

- 고객사의 SCP 또는 AWS 계정 안에 **전체 스택**(컨트롤플레인+데이터플레인) 설치. 단일 테넌트.
- 설치 패키지: 컨테이너 번들 + Terraform/Helm (SCP는 자체 K8s 서비스 또는 VM Compose 배포 — Phase 0 확인).
- **폐쇄망(에어갭) 지원**: 오프라인 라이선스 파일 검증 + 오프라인 업데이트 번들(서명된 이미지 아카이브 반입).
- 콜홈(원격지원·텔레메트리)은 설정으로 on/off — 기본 off, 고객 동의 시만.

### 3.3 분기 원칙

- **단일 코드베이스** + `deployment_profile: central | dedicated` 런타임 설정 + 라이선스 feature flag.
- 빌드 분기/포크 절대 금지 — Dedicated 고객 N곳 = 버전 파편화가 최대 유지보수 리스크이므로,
  프로파일 차이는 전부 설정·라이선스 계층에서만 발생해야 한다.
- Dedicated는 멀티테넌시 코드를 "테넌트 1개"로 그대로 사용 (별도 경로 없음 → 테스트 매트릭스 단순화).

---

## 4. 아키텍처

### 4.1 Control Plane / Data Plane 분리

```
[고객사 A: SCP]   [고객사 B: AWS]   [고객사 C: SCP+AWS]
   │ C-2 Collector    │ C-1 Agentless      │
   ▼                  ▼                    ▼
┌─────────────── Data Plane ────────────────┐
│ Collector (Provider Adapter 내장)          │
│  메트릭 / 로그 / 이벤트 / 자산 / 비용 수집    │
└──────────────────┬────────────────────────┘
                   ▼ (큐: Redis Streams → 확장 시 재검토)
┌─────────────── Control Plane ─────────────┐
│ API 서버 (FastAPI) · 테넌트/RBAC · 라이선스   │
│ 알림 라우팅 · 인시던트 · Runbook(승인 게이트) │
│ AI 분석 서비스 (L1~L5, §4.3)               │
│ 웹 콘솔 (Next.js)                          │
├── 저장: PostgreSQL 16 (RLS) · VictoriaMetrics(TSDB) · Loki(로그) · Redis ──┤
└───────────────────────────────────────────┘
```

### 4.2 Provider Adapter 계층 (R1)

공통 도메인 모델 `Resource / Metric / Event / LogStream / CostRecord / Alarm`을
정의하고, 클라우드별 어댑터가 이를 구현 (포트&어댑터 패턴). 향후 Azure·NCP·KT클라우드 확장 대비.

| 도메인 | AWS 어댑터 | SCP v2 어댑터 |
|---|---|---|
| 인증 | STS AssumeRole (교차계정 — MSP 표준 패턴) | Access Key + HMAC-SHA256 서명, 프로젝트 ID (`openapi.samsungsdscloud.com`) |
| 메트릭 | CloudWatch GetMetricData | Cloud Monitoring API |
| 이벤트 | EventBridge / Health API / CloudTrail | 이벤트 API 커버리지 **Phase 0 실측 필요** ⚠️ |
| 로그 | CloudWatch Logs / S3 | Cloud Logging API |
| 자산 | Config / Resource Explorer | 리소스 조회 API (Terraform provider 존재 → 조회 API는 있음) |
| 비용 | Cost Explorer / CUR | 빌링 API 커버리지 **Phase 0 실측 필요** ⚠️ |

- **SCP 갭 대비 우회로**: API로 안 나오는 데이터는 노드 내 에이전트(예: vmagent/fluent-bit) 설치 수집으로 보완. C-2/Dedicated 모드에서 자연스럽게 수용 가능.
- SCP OpenAPI는 IP 접근제어 지원 → Central 수집기 고정 IP 화이트리스트 운영.

### 4.3 AI 계층 (단계적 — "AIOps"의 실체)

| 레벨 | 기능 | 단계 |
|---|---|---|
| L1 | 룰/임계치 알림, 정적 대시보드 | Phase 1 (MVP) |
| L2 | 통계 이상탐지 — 동적 베이스라인, 계절성(주간/업무시간 패턴) | Phase 2 |
| L3 | 이벤트 상관·알람 노이즈 억제 — 그룹핑, 폭풍 억제, 중복 제거 | Phase 2 |
| L4 | LLM 운영 어시스턴트 — 인시던트 요약, RCA 추천, 자연어 질의, 월간보고 초안 | Phase 2~3 |
| L5 | Runbook 자동조치 — **인간 승인 게이트 필수** (회사 절대규칙 "AI 추천, 사람 결정") | Phase 3 |

- **폐쇄망 LLM 제약**: Dedicated 에어갭 환경은 외부 LLM API 불가 →
  (a) L4를 라이선스로 비활성, (b) 고객 보유 사내 LLM 엔드포인트(OpenAI 호환) 설정 주입 — 둘 다 지원하도록 LLM 게이트웨이를 추상화.
- L3(노이즈 억제)를 L2와 같은 Phase에 두는 이유: 이상탐지만 넣으면 알람이 늘어 신뢰를 잃는다. 탐지와 억제는 한 세트.

---

## 5. 멀티테넌시 · 보안 (R2)

### 5.1 테넌트 격리 방식 비교

| | Row-level (RLS) ★추천 | Schema-per-tenant | DB-per-tenant |
|---|---|---|---|
| 격리 강도 | 중 (DB 강제) | 중상 | 최상 |
| 운영/마이그레이션 | 단순 ✅ | 스키마 N개 관리 ⚠️ | 비용·운영 최악 |
| 테넌트 수 확장 | 수백 개 무리 없음 | 수십 개 한계 | 수 개 |
| Dedicated 재사용 | 테넌트 1개로 동일 코드 ✅ | 동일 | 동일 |

**추천: PostgreSQL RLS + `tenant_id`** — 모든 테이블에 RLS 정책 강제, 애플리케이션이
아닌 DB가 격리를 보증. 시계열(VictoriaMetrics)·로그(Loki)는 테넌트별 네임스페이스/레이블 격리.
초대형·규제 고객이 강한 격리를 요구하면 → 그 고객은 Dedicated 모드로 유도 (제품 구조가 답).

### 5.2 보안 원칙

1. **고객 자격증명 = 최고 민감 자산** (유출 = 사업 종료급): envelope encryption(테넌트별 키), 평문 저장 절대 금지, 응답 마스킹 — 회사 보안 룰 그대로.
2. **최소권한**: AWS는 ReadOnly 역할 기본 + 자동조치용 액션은 별도 role로 분리 발급. SCP는 IP 화이트리스트 병용.
3. **RBAC 3계층**: MSP 관리자(전 테넌트) / 고객사 담당 엔지니어(배정 테넌트만) / 고객사 셀프서비스 포털(자사 read-only — Phase 4).
4. **감사로그**: 열람 포함 전 민감 이벤트 기록, 5년 보관 (회사 공통 룰).
5. 사용자 향 메시지 전부 한국어 (§6.2).

---

## 6. 라이선스/구성 시스템 (R4)

- **서명된 라이선스 파일** (Ed25519, 오프라인 검증 — 에어갭에서도 동작):
  `edition / 만료일 / 한도(테넌트 수·모니터링 노드 수·데이터 보존일) / feature flags`
- **Edition 제안** (가격은 CFO 검토 후 CEO ack):

| Edition | 대상 | 포함 |
|---|---|---|
| MSP Central | 자사 운영센터 | 전 기능, 테넌트 무제한 |
| Dedicated Standard | 전용 설치 고객 | 수집·대시보드·룰 알림·리포트 (L1) |
| Dedicated AI | 전용 설치 고객 | + 이상탐지·노이즈 억제·LLM (L2~L4) |
| Add-on | 공통 | 자동조치(L5), FinOps 모듈 |

- 런타임 feature flag 게이팅 + 미보유 기능 UI 숨김.
- **만료 정책**: 만료 시 수집·저장은 계속, 콘솔은 읽기전용 전환 + 유예 30일 — 관제 공백으로 고객 장애를 놓치는 것이 최악이므로 "수집 중단"은 하지 않는다.

---

## 7. 기능 모듈 (MSP 실무 관점)

| 모듈 | 내용 | 단계 |
|---|---|---|
| 통합 관제 대시보드 | 전 고객사 상태 한눈에 + 고객사별 드릴다운 | P1 |
| 테넌트 온보딩 | 고객사 등록 → 자격증명/Collector 연결 → 자동 자산 발견 | P1 |
| 알림 라우팅 | 담당자·근무조·에스컬레이션 정책, 채널(카카오워크/슬랙/문자/이메일) | P1 |
| 인시던트 관리 | 알람→인시던트 승격, 타임라인, 조치 기록 (외부 ITSM 연동은 §10-7) | P2 |
| 월간 보고서 자동화 | SLA·가용성·리소스·비용 리포트 자동 생성 (LLM 초안) — **MSP 수익 업무 직결** | P2 |
| 정기점검 자동화 | 점검 체크리스트 자동 수행·증적 수집 | P3 |
| FinOps | 비용 이상 탐지, 절감 추천 (rightsizing) | P4 |
| 고객 셀프서비스 포털 | 고객사가 자사 현황·리포트 열람 | P4 |

## 8. 기술 스택 (회사 표준 + 보강)

- 회사 표준 그대로: **Next.js 14 + TS / FastAPI + Python 3.12 / PostgreSQL 16 / Redis 7 + Celery / SQLAlchemy 2.0 async + Alembic**
- 보강 (이 도메인 특성):
  - 시계열: **VictoriaMetrics** (싱글 바이너리 — Dedicated 설치 용이, Prometheus 호환)
  - 로그: **Loki** (경량 — Dedicated 고려. OpenSearch는 무거워 비추천)
  - Collector: 1차 Python(개발 속도) → Dedicated 패키징(P3) 전에 Go 단일 바이너리 재작성 검토 (§10-9)
- 과잉설계 금지: Kafka X (Redis Streams로 시작), 마이크로서비스 X (모듈러 모놀리스), K8s는 Dedicated 패키징 옵션으로만.

## 9. 로드맵 · 리스크

### Phase (기간은 Council 모드 산정 후 확정)

- **P0 — 검증 (1~2주)**: SCP v2 API 인벤토리 실측 PoC(메트릭·이벤트·로그·비용 각각 가능/불가 표), AWS 교차계정 수집 PoC, 스택·이름 확정. **Council 모드 토의 대상.**
- **P1 — MVP (Central)**: 테넌트 온보딩 + AWS/SCP 수집 + 통합 대시보드 + 룰 알림 + RBAC/감사로그
- **P2 — AI**: 이상탐지 + 노이즈 억제 + LLM 인시던트 요약 + 월간 보고서 자동화
- **P3 — Dedicated**: 설치 패키징 + 오프라인 라이선스 + 에어갭 업데이트 번들 + 자동조치(승인 게이트)
- **P4 — 확장**: 셀프서비스 포털, FinOps, 3rd 클라우드

### Premortem (실패 시나리오 → 완화)

1. **SCP v2 API 커버리지 부족** (최대 리스크) → P0 실측 최우선. 갭은 노드 에이전트 수집으로 우회.
2. **Dedicated 버전 파편화** → 단일 코드베이스+프로파일 강제, 서명된 업데이트 번들 자동화, 지원 버전 N-1 정책.
3. **고객 자격증명 유출** → §5.2 (envelope encryption·최소권한·감사).
4. **알람 노이즈 → 운영팀 신뢰 상실** → L2와 L3를 한 세트로 출시.
5. **폐쇄망 LLM 불가** → LLM 게이트웨이 추상화 + 라이선스 게이팅.
6. **Datadog 등 기존 강자와 경쟁** → 차별화 = SCP+AWS 동시 지원(외산 미지원 영역) + 한국 MSP 실무 특화(월간보고·정기점검·에어갭) + Dedicated 옵션.

---

## 10. CEO 결정 필요 항목 (★ ack 게이트)

1. ~~프로젝트/repo 이름·위치~~ ✅ **확정 (2026-07-06)**: `C:\AI_Projects\ddalkkak_Aiops`
2. ~~사업 주체·트랙~~ ✅ **확정 (2026-07-06)**: WAPLO와 별개, **CEO 소속 회사 업무용**.
   단, AI 조직 운영 방식(MODU DDAL-KKAK 룰·DKM·모델 전략)은 그대로 적용.
3. **첫 타깃 클라우드 순서** — 추천: 어댑터 설계는 동시, P0 실측은 SCP 먼저 (리스크가 SCP에 있음)
4. **Central 호스팅 위치** — 자사 SCP vs AWS vs 기타
5. **에디션·가격 구조** — §6 제안 기반 CFO 시뮬레이션 후 확정
6. **완전 에어갭 고객 실존 여부** — 오프라인 업데이트 파이프라인 투자 규모 좌우
7. **ITSM** — 자체 인시던트 모듈로 충분 vs Jira/기존 도구 연동 필수
8. **LLM 공급** — Central은 Anthropic API 기본 추천 / Dedicated 대안 정책
9. **Collector 언어** — Python 시작 후 Go 전환 vs 처음부터 Go

**진행 원칙**: §10 미확정 상태에서는 되돌리기 쉬운 것(P0 API 실측, UI 목업)만 진행
가능. DB 스키마·repo·스택 고정은 ack 필수 (회사 룰 v1.1.4).

---

*다음 단계: CEO가 §10 확정 → P0 Council 모드 (CTO·CRO·CFO·CISO·CPO 병렬 토의) → 구현 계획서(writing-plans) 작성. 구현은 Sonnet 워커 디스패치 (Fable 코딩 금지).*
