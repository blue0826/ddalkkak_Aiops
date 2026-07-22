# DB 운영 가이드

> 배경: 과거 `DATABASE_URL`이 상대경로(`sqlite+aiosqlite:///./aiops_mvp.db`)였던 탓에,
> 서버를 다른 작업 디렉터리(CWD)에서 띄우면 다른(빈) DB 파일을 새로 만들어 등록해둔
> 테넌트·SCP 자격증명이 사라진 것처럼 보이는 사고가 있었다. 이 문서는 재발 방지 절차다.

## 1. 절대 원칙 — DB 파일을 지우지 않는다

- `aiops_mvp.db`(개발 DB)에는 테넌트·사용자·**암호화된 클라우드 자격증명**·인시던트
  이력이 들어있다. **어떤 이유로도 이 파일을 수동으로 삭제하지 말 것.**
- 스키마를 바꿔야 할 때 "DB를 지우고 새로 만드는" 방식은 금지. 반드시 아래 2번의
  Alembic 절차를 따른다.
- `.gitignore`에 `*.db` / `*.sqlite` / `*.sqlite3`가 이미 포함되어 있어 DB 파일은
  git으로 추적되지 않는다(커밋되면 안 됨 — 자격증명 암호문이 담겨 있음).

## 2. DB 파일 위치 (절대경로, CWD 무관)

- `backend/app/core/config.py`가 자기 파일 위치(`__file__`) 기준으로 프로젝트 루트를
  계산하고, 기본 `DATABASE_URL`을 `sqlite+aiosqlite:///<프로젝트 루트>/aiops_mvp.db`
  (절대경로)로 anchor한다.
- 즉 서버를 프로젝트 루트에서 띄우든, `backend/`에서 띄우든, 다른 아무 디렉터리에서
  띄우든 **항상 같은 파일**을 읽는다. `.env`에는 더 이상 `DATABASE_URL`을 상대경로로
  넣지 않는다(운영 PostgreSQL 등으로 전환할 때만 `.env`에 명시적으로 오버라이드).
- 집 PC/회사 PC처럼 repo clone 경로 자체가 다른 경우에도 `__file__` 기준 계산이라
  자동으로 맞는 절대경로를 잡는다. `.env`에 절대경로를 직접 박아두지 말 것(PC마다
  clone 경로가 다르면 깨진다).
- 실제 파일 경로 확인: `python -c "from backend.app.core.config import settings; print(settings.DATABASE_URL)"`

## 3. 스키마 변경 절차 (Alembic)

`backend/` 아래에 Alembic이 설정되어 있다(`backend/alembic.ini`, `backend/alembic/`).
모델(`backend/app/models/base.py`)을 바꾼 뒤에는 **반드시** 아래 순서를 따른다:

```bash
# 1) backend/ 디렉터리에서 실행 (또는 -c backend/alembic.ini 옵션으로 어디서든)
cd backend

# 2) 모델 변경사항을 자동 감지해 마이그레이션 파일 생성
python -m alembic revision --autogenerate -m "변경 내용을 한국어로 짧게 설명"

# 3) 생성된 backend/alembic/versions/<hash>_설명.py 를 열어 diff가 의도한 대로인지
#    직접 확인(자동 감지가 완벽하지 않을 수 있음 - 컬럼 rename 등은 직접 손봐야 함)

# 4) 실제 DB에 적용
python -m alembic upgrade head
```

- `alembic revision --autogenerate`는 현재 DB 스키마와 `Base.metadata`(모델)를 비교해
  diff만 생성한다. **DB를 지우지 않는다.**
- `backend/app/main.py`의 `startup_event`는 여전히 `Base.metadata.create_all`을
  호출하지만, 이는 "테이블이 없으면 생성"만 하고 기존 테이블의 컬럼 변경은 반영하지
  않는다(개발 편의용 안전망일 뿐, 마이그레이션 대체 수단이 아님). **컬럼 추가/삭제/
  타입 변경 등은 반드시 Alembic으로.**
- 새 모델 파일을 추가하는 경우, `backend/alembic/env.py`에서 해당 모델을 import해
  `Base.metadata`에 등록되게 할 것(현재는 `backend/app/models/base.py` 하나에 전 모델이
  있어 이미 import돼 있음).
- 마이그레이션 실행은 sync 드라이버(`sqlite:///...`)로 처리한다 — `env.py`가
  `settings.DATABASE_URL`(앱이 쓰는 async `sqlite+aiosqlite://` URL)을 자동으로
  변환해서 쓰므로 별도 설정 불필요.

### 최초 셋업 이력 (참고용)

기존에 `create_all`로 이미 만들어져 있던 DB에 Alembic을 소급 적용할 때는
`alembic upgrade head` 대신 `alembic stamp head`를 썼다(테이블이 이미 존재하므로
CREATE TABLE을 다시 실행하면 오류 - 스키마가 모델과 정확히 일치함을 확인한 뒤
버전만 기록). 최초 마이그레이션(`664fbaafbf10_initial_schema_capture.py`)이 현재
전체 스키마(tenant/user/cloud_credential/alert_rule/audit_log/incident/
incident_timeline)를 캡처한 베이스라인이다. **이후의 스키마 변경부터는 항상
`upgrade head`(stamp 아님)를 사용할 것** — stamp는 최초 소급 적용 때만 쓰는 예외.

## 4. MASTER_KEK 백업 — 반드시 별도 보관

- `.env`의 `MASTER_KEK`는 저장된 모든 클라우드 자격증명(`cloud_credential.
  encrypted_auth_data`)을 복호화하는 봉투암호화(envelope encryption) 루트 키다.
- **이 키를 분실하면 DB 파일이 멀쩡히 남아 있어도 기존에 등록된 모든 SCP/AWS
  자격증명을 복호화할 수 없다** — 사실상 데이터 소실과 동일한 결과. `JWT_SECRET`과
  달리 재발급으로 복구되지 않는다.
- `.env`는 git에 커밋되지 않으므로(`.gitignore` 적용), 별도로 안전한 곳(예: 회사
  비밀번호 관리자, 암호화된 백업)에 `MASTER_KEK` 값을 반드시 백업해 둘 것.
- `MASTER_KEK`를 교체(rotate)하려면 기존 자격증명을 옛 키로 복호화 → 새 키로 재암호화
  하는 별도 마이그레이션 스크립트가 필요하다(현재 미구현 - 필요 시 별도 작업으로 진행).

## 5. 테스트는 실제 DB를 건드리지 않는다

- `backend/tests/conftest.py`가 `backend.app.main`을 임포트하기 **이전에**
  `DATABASE_URL` 환경변수를 임시 디렉터리(`tempfile.mkdtemp`)의 파일로 못박는다.
  pydantic-settings는 환경변수를 `.env` 값보다 우선하므로, pytest 실행 중에는
  `aiops_mvp.db`(실 DB)가 아니라 이 임시 DB만 사용된다.
- 일부 개별 테스트 파일(`test_phase1/test_db_and_services.py`,
  `test_phase2/test_detection_cycle.py` 등)은 각자 `sqlite+aiosqlite:///:memory:`로
  완전히 독립된 엔진을 직접 생성해 쓴다 — 이 역시 실 DB와 무관.
- **주의**: 이 conftest 격리가 없던 상태에서 실수로 pytest를 한 번 돌리면 실
  `aiops_mvp.db`에 테스트 픽스처 데이터(tenant-scp/tenant-aws 등)가 섞여 들어갈 수
  있다 — 반드시 이 격리가 유지되도록 conftest.py를 건드릴 때 주의할 것.

## 6. 빠른 점검 명령

```bash
# 현재 적용된 마이그레이션 버전 확인
cd backend && python -m alembic current

# 모델과 DB가 정합한지(빈 diff인지) 확인 - 결과 파일의 upgrade()/downgrade()가
# pass면 정합. 확인용으로 생성한 리비전 파일은 커밋하지 말고 지울 것.
python -m alembic revision --autogenerate -m "check"
```
