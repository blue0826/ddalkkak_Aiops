# ddalkkak_Aiops — 프로젝트 헌법 (킥오프 v0.1)

> 신규 세션이 처음 읽는 문서. 2026-07-06 CEO 지시로 킥오프.

## 1. 정체성

- **한 줄 정의**: 삼성클라우드플랫폼(SCP) v2 + AWS 고객사들을 관제하는
  **멀티테넌트 AIOps MSP 플랫폼**. 중앙(Central) 모드 기본 + 플랫폼 서비스
  불가 고객사는 고객 클라우드 내 전용(Dedicated) 설치. 라이선스/설정으로
  구성 분기, 코드베이스는 단일.
- **주체**: **CEO 소속 회사 업무용** — WAPLO/코리앤/스토리안과 완전 별개
  (브랜드·코드·DB 공유 없음). 단, AI 조직 운영 방식은 MODU DDAL-KKAK 룰
  (`~/.claude/CLAUDE.md` v1.1.4 + `company/*`)을 그대로 상속.
- **마스터 스펙**: [docs/superpowers/specs/2026-07-06-aiops-msp-design.md](docs/superpowers/specs/2026-07-06-aiops-msp-design.md)
  — 요구사항·아키텍처·멀티테넌시·라이선스·로드맵·리스크 전부 이 문서 기준.
- **CEO 보고서**: [docs/reports/2026-07-06-aiops-msp-plan.html](docs/reports/2026-07-06-aiops-msp-plan.html)

## 2. 현재 단계

- **Phase 0 진입 대기** — 스펙 §10 잔여 결정(3~9번: 클라우드 착수 순서·Central
  호스팅·에디션 가격·에어갭 고객 여부·ITSM·LLM 공급·Collector 언어) 확정 필요.
- 미확정 상태에서 가능한 작업: SCP v2 API 실측 PoC(읽기 전용), UI 목업.
  **금지**: DB 스키마 확정, 스택 고정, 외부 API 유료 호출 (ack 게이트).
- Phase 0 = Council 모드 (CTO·CRO·CFO·CISO·CPO 병렬) — SCP v2 API
  인벤토리 실측이 1순위 (이벤트·비용 API 커버리지가 최대 리스크).

## 3. 절대 원칙 (스펙 요약 — 상세는 마스터 스펙)

1. **단일 코드베이스** — Central/Dedicated 분기는 `deployment_profile` 설정 +
   서명 라이선스(Ed25519) feature flag로만. 빌드 포크 절대 금지.
2. **테넌트 격리 = DB 강제** — PostgreSQL RLS + `tenant_id`, 전 테이블 적용.
3. **고객 자격증명 = 최고 민감 자산** — envelope encryption, 평문 저장 금지,
   최소권한(AWS ReadOnly 기본, 자동조치 role 분리), 감사로그 5년.
4. **자동조치(L5)는 인간 승인 게이트 필수** — AI 추천, 사람 결정.
5. **알람 노이즈 억제(L3)는 이상탐지(L2)와 한 세트로 출시.**
6. 사용자 향 메시지 한국어만 / 신규 파일 <500줄 / 테스트 없는 코드 = 미완성.

## 4. 역할

- **Fable 5 = 기획 전담, 코딩 금지.** 구현은 COO(Opus)가 Sonnet 워커 디스패치
  (fable-mode 로드 1줄 주입 의무), 단순 작업은 Haiku, 다중 파일 기계 수정은
  결정론적 스크립트.
- **원격 repo**: `https://github.com/blue0826/ddalkkak_Aiops.git` (Private 유지
  필수 — 내부 기획 문서 포함). git push는 CEO 명시 ack 필수.

## 5. 집 PC ↔ 회사 PC 동기화 (2026-07-06 셋업)

동기화 3축 — 프로젝트 상태는 repo, 회사 자산은 claude-config, 세션 컨텍스트는
`_PROJECT_LOG/`. 회사 자산(`company/*`·스킬)은 이 repo에 **복사하지 않는다**
(양 PC 모두 `~/.claude`로 동기화되므로 중복 금지 — 표준 §7 절차의 의도적 예외).

### 회사 PC 최초 셋업 (한 번만)

```bash
# 1. 프로젝트 clone — 경로 동일하게 (메모리·스킬 경로 호환)
git clone https://github.com/blue0826/ddalkkak_Aiops.git C:/AI_Projects/ddalkkak_Aiops

# 2. 회사 자산 최신화 (claude-config — 이미 셋업돼 있으면 pull만)
cd ~/.claude && git pull origin master
```

### 매 세션 루틴 (양 PC 공통)

- **시작**: `git pull` → `CLAUDE.md` → `_PROJECT_LOG/_TOMORROW.md` →
  `_PROJECT_LOG/06_PENDING.md` 로드
- **종료**: `_PROJECT_LOG/07_SESSION_LOG.md` append + `_TOMORROW.md` 갱신 →
  commit → push (CEO ack). **push 안 하고 퇴근하면 다음 PC에서 컨텍스트 끊김.**
- 단말기 제약 자동 적용 (글로벌 룰): 회사 PC = dev 서버·브라우저 가끔만,
  무거운 시각 검증·GPU 작업은 집 PC에서.
