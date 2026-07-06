# TOMORROW — 다음 세션 인수인계

**현 단계**: ⏸ P0 착수 대기 — 잔여 결정 7건 전부 확정됨(D-005·D-006).
**CEO가 토큰 갱신 후 "진행" 지시하면 즉시 P0 시작** (추가 질문 불필요).

## P0 실행 계획 (트리거 시 바로)

Council 모드 (CTO·CRO·CFO·CISO·CPO 병렬) — **워커 전원 Sonnet/Haiku
(토큰 비싼 모델 금지 — D-006)**, 코딩은 전부 서브에이전트:

1. **SCP v2 API 인벤토리 실측 PoC** (1순위 — SCP가 메인 클라우드):
   메트릭·이벤트·로그·비용·자산 API 각각 가능/불가 표. 이벤트·비용
   커버리지가 최대 리스크. 실 API 호출 전 CEO ack (계정·키 필요).
2. AWS 교차계정(STS AssumeRole) 수집 PoC 설계
3. 스택 최종 확정 → 구현 계획서(writing-plans) → CEO ack

## 확정 반영 사항 (D-005)

- SCP 메인 / ITSM 자체 모듈 / Collector Python→Go / 개발 LLM = Claude Code
  CLI 로그인 방식 / 에어갭은 P3 유지(고객 실존, 검증 후) / 호스팅·가격 보류

## 주의

- Fable = 기획 전담·코딩 금지. 디스패치 prompt에 fable-mode 로드 1줄 주입
- 회사 PC 제약: dev 서버·브라우저 가끔만 (글로벌 룰 환경 표)
- 세션 시작: `git pull` 먼저 (집↔회사 PC 동기화)
