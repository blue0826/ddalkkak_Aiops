# TOMORROW — 다음 세션 인수인계

**현 단계**: Phase 0 진입 대기 (기획 완료, 잔여 결정 7건 미확정 → `06_PENDING.md`)

## 다음 작업 (우선순위순)

1. CEO 잔여 결정 7건 접수 → `05_DECISIONS.md` 기록
2. 결정 완료 시 **P0 Council 모드** 발동 (CTO·CRO·CFO·CISO·CPO 병렬):
   - 1순위: SCP v2 API 인벤토리 **실측 PoC** — 메트릭·이벤트·로그·비용 각각
     가능/불가 표 작성 (이벤트·비용 API 커버리지가 최대 리스크)
   - AWS 교차계정(STS AssumeRole) 수집 PoC
   - 스택 최종 확정 → 구현 계획서(writing-plans)
3. 회사 PC 최초 셋업 시: CLAUDE.md §5 절차 (clone + ~/.claude pull)

## 주의

- Fable = 기획 전담·코딩 금지. 구현은 Sonnet 워커 디스패치 (fable-mode 주입)
- 회사 PC 제약: dev 서버/브라우저 가끔만, GPU 호출 금지 (글로벌 룰 환경 표)
- P0 PoC도 외부 API **실 호출은 ack 게이트** (읽기 전용·무료 범위만 자율)
