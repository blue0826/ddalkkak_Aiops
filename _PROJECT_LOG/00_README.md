# _PROJECT_LOG — 세션 간 인수인계 (집 PC ↔ 회사 PC 공유)

이 폴더가 **PC 간 컨텍스트 동기화의 핵심**이다. 어느 PC든 세션 시작 시
이 폴더를 읽고, 세션 종료 시 갱신 후 push한다.

| 파일 | 용도 | 갱신 |
|---|---|---|
| `05_DECISIONS.md` | CEO 확정 결정 누적 (prepend) | 결정 발생 시 |
| `06_PENDING.md` | 미확정·대기 항목 | 수시 |
| `07_SESSION_LOG.md` | 세션별 작업 기록 (append, Haiku 위임) | 매 세션 종료 |
| `_TOMORROW.md` | 다음 세션이 이어받을 작업 | 매 세션 종료 |

## 세션 프로토콜

1. 시작: `git pull` → 프로젝트 `CLAUDE.md` → `_TOMORROW.md` → `06_PENDING.md` 순서로 로드
2. 종료: `07_SESSION_LOG.md` append + `_TOMORROW.md` 갱신 → commit → push (CEO ack)
