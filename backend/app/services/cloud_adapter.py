from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from backend.app.services.simulator import simulator
from backend.app.core.providers import get_provider
from backend.app.core.config import settings
from loguru import logger

class BaseCloudAdapter(ABC):
    """
    클라우드 자원 수집용 Port (공통 인터페이스 계약)
    """
    
    @abstractmethod
    def fetch_metrics(self, node_id: str, metric_name: str, minutes: int) -> List[Dict[str, Any]]:
        """
        특정 인스턴스 노드의 성능 지표 시계열 데이터를 수집합니다.
        """
        pass
        
    @abstractmethod
    def fetch_logs(self, limit: int) -> List[Dict[str, Any]]:
        """
        클라우드 감사 및 엔진 로그 스트림을 수집합니다.
        """
        pass
        
    @abstractmethod
    def fetch_costs(self) -> Dict[str, Any]:
        """
        클라우드 월간 과금 및 Rightsizing 추천 데이터를 조회합니다.
        """
        pass

class AWSAdapter(BaseCloudAdapter):
    """
    AWS CloudWatch / Cost Explorer 수집 어댑터 (Adapter)
    SIMULATED 모드 - 실 AWS boto3/STS AssumeRole 연동 이전 단계.
    """
    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id

    def get_metadata(self) -> Dict[str, Any]:
        """
        AWS Provider Registry 메타데이터를 반환합니다. (SIMULATED - 실연동 자격증명 확보 전)
        """
        return get_provider("aws")

    def fetch_metrics(self, node_id: str, metric_name: str, minutes: int) -> List[Dict[str, Any]]:
        logger.debug(f"[AWS CloudWatch Metrics 수집] 노드: {node_id}, 지표: {metric_name}")
        return simulator.get_metrics(self.tenant_id, node_id, metric_name, minutes)

    def fetch_logs(self, limit: int) -> List[Dict[str, Any]]:
        logger.debug("[AWS CloudWatch Logs 수집] 로그 폴링 중...")
        # provider="aws"로 명시 스코프하여 SCP 로그와의 교차 오염을 원천 차단
        all_logs = simulator.get_logs(self.tenant_id, limit, provider="aws")
        return [log for log in all_logs if log.get("provider") == "aws"]

    def fetch_costs(self) -> Dict[str, Any]:
        logger.debug("[AWS Cost Explorer 비용 수집] 호출 중...")
        return simulator.get_costs(self.tenant_id, provider="aws")

import hmac
import hashlib
import time
import urllib.request
import urllib.error
import urllib.parse
import json
import base64
import httpx
from datetime import datetime, timezone, timedelta


def _to_scp_iso_ms(dt: datetime) -> str:
    """
    SCP Cloud Monitoring metric-data API가 요구하는 ISO-8601 UTC 밀리초 포맷으로 변환한다
    (예: "2026-07-20T05:47:10.855Z"). 2026-07-20 P0 실측 확정 스펙 - datetime.isoformat()의
    기본 마이크로초(6자리)나 오프셋(+00:00) 표기와 달라 별도 포맷터가 필요하다.
    """
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


class SCPAdapter(BaseCloudAdapter):
    """
    삼성클라우드플랫폼(SCP) V2 OpenAPI 및 Cloud Monitoring / Billing 수집 어댑터 (Adapter)
    """

    # 내부 지표명 -> SCP Cloud Monitoring metricKey 매핑 (2026-07-20 실측 확정, 모노스(monos)
    # 실 테넌트 자격증명으로 라이브 검증). "basic"은 하이퍼바이저가 에이전트 설치 없이
    # 수집하는 [Basic] 키 - 이번 구현이 실제로 호출하는 값이다(항상 데이터 있음, 실측 확인).
    # "agent_fallback"은 VM 내부에 모니터링 에이전트가 설치된 경우에만 데이터가 있는
    # system.* 키로, 참고용 문서화만 하고 이번 구현은 호출하지 않는다(에이전트 미설치
    # 고객사에서는 totalCount: 0으로 항상 빈 응답 - 실측 확인). 새 지표를 추가하려면
    # 이 딕셔너리에 항목만 추가하면 된다.
    _METRIC_KEY_MAP: Dict[str, Dict[str, str]] = {
        "cpu": {
            "basic": "libvirt.domain.cpu.scpm.usage",     # "CPU Usage [Basic]", 단위 %
            "agent_fallback": "system.cpu.total.pct",     # 에이전트 설치 VM 전용 (미사용)
        },
        "memory": {
            "basic": "libvirt.domain.memory.scpm.usage",  # "Memory Usage [Basic]", 단위 %
            "agent_fallback": "system.mem.used.pct",      # 에이전트 설치 VM 전용 (미검증, 미사용)
        },
    }

    def __init__(
        self,
        tenant_id: str,
        access_key: str = None,
        secret_key: str = None,
        project_id: str = None,
        endpoint_url: str = None,
        monitoring_endpoint_url: str = None,
        logging_endpoint_url: str = None,
    ):
        self.tenant_id = tenant_id
        self.access_key = access_key
        self.secret_key = secret_key
        self.project_id = project_id
        self.endpoint_url = endpoint_url or "https://openapi.samsungsdscloud.com"
        # Cloud Monitoring 엔드포인트 - 호출측(monitor.py)이 credential_service에서 파생한
        # region/env 기반 실호스트를 넘겨주는 것이 정상 경로다. settings.SCP_MONITORING_ENDPOINT는
        # 그 값이 없을 때만 쓰이는 레거시 폴백(2026-07-20 P0 실측 상세는 fetch_metrics_real 참조).
        self.monitoring_endpoint_url = monitoring_endpoint_url or settings.SCP_MONITORING_ENDPOINT
        # Cloud Logging 엔드포인트 - 2026-07-20 P0 실측으로도 host/path 미확정(fetch_logs_real
        # 참조) - settings.SCP_LOGGING_ENDPOINT 고정 폴백만 사용한다.
        self.logging_endpoint_url = logging_endpoint_url or settings.SCP_LOGGING_ENDPOINT
        # 마지막 실 API 호출 결과 - 호출측(monitor.py)이 tenant_service_setting.last_status에
        # 정직하게 반영하기 위해 참조한다. unknown(아직 시도 안 함)|ok|forbidden(403)|error
        self.last_call_status: str = "unknown"

    def _generate_signature(self, method: str, path: str, query_string: str, timestamp: str, base_url: str = None) -> str:
        """
        삼성 SDS SCP V2 OpenAPI 규격 서명 생성기 (HmacSHA256 Base64 인코딩)
        공식 문서 기준: message = method + url + timestamp + accessKey + clientType
        여기서 url = 전체 URL (https://virtualserver.{region}.{env}.samsungsdscloud.com/v1/servers)

        base_url을 생략하면 self.endpoint_url(가상서버 API 베이스)을 그대로 사용한다.
        Cloud Monitoring/Logging처럼 호스트가 다른 API를 서명할 때만 명시적으로 넘긴다
        (서명 알고리즘 자체는 100% 동일 - 검증된 Scp-* HMAC 패턴 재사용).
        """
        if not self.secret_key:
            return ""

        # 공식 JS 샘플: var url = "{full_url}"; url = encodeURI(url);
        # url은 path가 아닌 전체 URL (host 포함)
        full_url = f"{base_url or self.endpoint_url}{path}"
        if query_string:
            full_url = f"{full_url}?{query_string}"

        message = f"{method.upper()}{full_url}{timestamp}{self.access_key}Openapi"
        logger.debug(f"[SCP 서명 생성] message prefix: {method.upper()}{full_url[:60]}...")
        signature = hmac.new(
            self.secret_key.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).digest()
        return base64.b64encode(signature).decode('utf-8')


    def test_connection(self) -> Dict[str, Any]:
        """
        고객사 삼성클라우드플랫폼(SCP) 계정 연동 테스트 API
        실제 연동 자격증명이 더미이거나 수집되지 않은 경우 우아하게 통과 시뮬레이션
        """
        if not self.access_key or not self.secret_key or not self.project_id:
            logger.info(f"[SCP 연동 시뮬레이션] 테넌트 {self.tenant_id}: 가상 크레덴셜 연결 성공")
            return {
                "status": "SUCCESS",
                "mode": "SIMULATED",
                "message": "삼성클라우드플랫폼(SCP) V2 모의 API 계정 연동 성공 (시뮬레이터 활성)",
                "connected_project": self.project_id or "mds-proj-9901"
            }
            
        timestamp = str(int(time.time() * 1000))
        path = "/v1/servers"
        url = f"{self.endpoint_url}{path}"
        
        headers = {
            "Content-Type": "application/json",
            "Scp-Accesskey": self.access_key,
            "Scp-Timestamp": timestamp,
            "Scp-Signature": self._generate_signature("GET", path, "", timestamp),
            "Scp-ClientType": "Openapi",
            "Scp-Api-Version": "virtualserver 1.3",
            "Accept-Language": "ko-KR"
        }
        
        try:
            req = urllib.request.Request(url, headers=headers, method="GET")
            with urllib.request.urlopen(req, timeout=10) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                return {
                    "status": "SUCCESS",
                    "mode": "REAL_CLOUD",
                    "message": "삼성클라우드플랫폼(SCP) V2 OpenAPI 실서버 연동 검증 완료",
                    "connected_project": self.project_id,
                    "servers_count": len(res_data.get("servers", []))
                }
        except urllib.error.HTTPError as e:
            # 응답 본문에서 SCP 서버의 상세 오류 메시지 추출
            try:
                body = e.read().decode('utf-8')
                logger.error(f"[SCP 연동 실패] HTTP {e.code}: {e.reason} | 응답 본문: {body}")
                return {
                    "status": "FAILED",
                    "mode": "REAL_CLOUD",
                    "message": f"SCP OpenAPI 연동 실패: HTTP {e.code} {e.reason} | 상세: {body[:300]}",
                    "connected_project": self.project_id
                }
            except Exception:
                logger.error(f"[SCP 연동 실패] HTTP {e.code}: {e.reason}")
                return {
                    "status": "FAILED",
                    "mode": "REAL_CLOUD",
                    "message": f"SCP OpenAPI 연동 실패: HTTP Error {e.code}: {e.reason}",
                    "connected_project": self.project_id
                }
        except Exception as e:
            logger.error(f"[SCP 연동 실패] 사유: {str(e)}")
            return {
                "status": "FAILED",
                "mode": "REAL_CLOUD",
                "message": f"SCP OpenAPI 연동 실패: {str(e)} (네트워크 오류 또는 연결 불가)",
                "connected_project": self.project_id
            }


    def fetch_real_vms(self) -> List[Dict[str, Any]]:
        """
        SCP OpenAPI 실서버로부터 가상 서버(Virtual Servers) 목록을 조회합니다.
        """
        if not self.access_key or not self.secret_key or not self.project_id:
            return []
            
        timestamp = str(int(time.time() * 1000))
        path = "/v1/servers"
        url = f"{self.endpoint_url}{path}"
        
        headers = {
            "Content-Type": "application/json",
            "Scp-Accesskey": self.access_key,
            "Scp-Timestamp": timestamp,
            "Scp-Signature": self._generate_signature("GET", path, "", timestamp),
            "Scp-ClientType": "Openapi",
            "Scp-Api-Version": "virtualserver 1.3",
            "Accept-Language": "ko-KR"
        }
        
        try:
            req = urllib.request.Request(url, headers=headers, method="GET")
            with urllib.request.urlopen(req, timeout=10) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                servers = res_data.get("servers", [])
                logger.info(f"[SCP 실서버 조회 성공] 총 {len(servers)}개 VM 수집")
                return servers
        except urllib.error.HTTPError as e:
            try:
                body = e.read().decode('utf-8')
                logger.error(f"[SCP 실서버 조회 실패] HTTP {e.code}: {e.reason} | 본문: {body[:500]}")
            except Exception:
                logger.error(f"[SCP 실서버 조회 실패] HTTP {e.code}: {e.reason}")
            return []
        except Exception as e:
            logger.error(f"[SCP 실서버 조회 실패]: {str(e)}")
            return []

    def fetch_metrics_real(self, node_id: str, metric_name: str, minutes: int) -> Optional[List[Dict[str, Any]]]:
        """
        SCP Cloud Monitoring 실 API에서 노드의 시계열 메트릭을 조회합니다.

        자격증명(access_key/secret_key/project_id)이 없거나 metric_name이 _METRIC_KEY_MAP에
        없으면 실 호출을 시도하지 않고 즉시 None을 반환합니다. 실패/응답없음/예외 시에도
        None을 반환해 호출측(라우터, MonitoringService)이 시뮬레이터로 안전하게
        폴백하도록 합니다.

        # 2026-07-20 P0 실측 확정 (모노스(monos) 실 테넌트 자격증명, 라이브 200 OK 확인):
        # POST {monitoring_endpoint_url}/v1/cloudmonitorings/product/v2/metric-data
        # - Scp-Api-Version 헤더는 "cloudmonitoring 1.0" 고정(다른 값은 406), X-ResourceType:
        #   VM 헤더 필요. 서명은 GET과 동일한 _generate_signature("POST", path, "", ts,
        #   base_url=...) - 쿼리스트링 없이 URL 전체(호스트+경로)만 서명한다.
        # - productResourceId = virtualserver /v1/servers의 VM id(=node_id)를 그대로 재사용
        #   (실측: 카탈로그 조회 결과 1:1 일치 확인).
        # - system.cpu.* 등 에이전트 기반 키는 에이전트 미설치 VM에서 totalCount: 0(빈 응답)
        #   이라 libvirt.domain.* Basic(에이전트리스, 하이퍼바이저 수집) 키만 사용한다 -
        #   매핑은 _METRIC_KEY_MAP 참조.
        # - 응답: {"totalCount", "contents": [{"perfData": [{"value": "<str>", "ts": <epoch ms>}, ...]}]}.
        #   value는 문자열이라 float() 변환 필요, ts는 epoch ms라 UTC로 변환 후 시뮬레이터/
        #   데모엔진과 동일한 "%Y-%m-%dT%H:%M:%SZ" 포맷 문자열로 맞춘다(차트 무변경 호환).
        """
        if not self.access_key or not self.secret_key or not self.project_id:
            return None

        metric_key = self._METRIC_KEY_MAP.get(metric_name, {}).get("basic")
        if not metric_key:
            logger.warning(f"[SCP Cloud Monitoring 실측] 미지원 지표명 - 노드: {node_id}, 지표: {metric_name}")
            return None

        path = "/v1/cloudmonitorings/product/v2/metric-data"
        timestamp = str(int(time.time() * 1000))
        signature = self._generate_signature(
            "POST", path, "", timestamp, base_url=self.monitoring_endpoint_url
        )
        url = f"{self.monitoring_endpoint_url}{path}"

        headers = {
            "Content-Type": "application/json",
            "Scp-Accesskey": self.access_key,
            "Scp-Timestamp": timestamp,
            "Scp-Signature": signature,
            "Scp-ClientType": "Openapi",
            "Scp-Api-Version": "cloudmonitoring 1.0",
            "Accept-Language": "ko-KR",
            "X-ResourceType": "VM",
        }

        query_end_dt = datetime.now(timezone.utc)
        query_start_dt = query_end_dt - timedelta(minutes=minutes)
        body = {
            "ignoreInvalid": "Y",
            "queryStartDt": _to_scp_iso_ms(query_start_dt),
            "queryEndDt": _to_scp_iso_ms(query_end_dt),
            "metricDataConditions": [
                {
                    "metricKey": metric_key,
                    "productResourceInfos": [{"productResourceId": node_id}],
                    "statisticsTypeList": ["AVG"],
                    "statisticsPeriod": 300,
                }
            ],
        }

        try:
            with httpx.Client(timeout=10) as client:
                response = client.post(url, headers=headers, json=body)
                response.raise_for_status()
                res_data = response.json()
        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code if e.response is not None else None
            # last_call_status - 호출측(monitor.py)이 tenant_service_setting.last_status에
            # 정직하게 반영한다(IAM 스코프 미부여로 인한 403 forbidden과 그 외 error를 구분).
            self.last_call_status = "forbidden" if status_code == 403 else "error"
            logger.error(f"[SCP Cloud Monitoring 실측 실패] 노드: {node_id}, 지표: {metric_name}, HTTP {status_code}: {str(e)}")
            return None
        except Exception as e:
            self.last_call_status = "error"
            logger.error(f"[SCP Cloud Monitoring 실측 실패] 노드: {node_id}, 지표: {metric_name}, 사유: {str(e)}")
            return None

        contents = res_data.get("contents") or []
        points: List[Dict[str, Any]] = []
        for entry in contents:
            for p in (entry.get("perfData") or []):
                raw_value = p.get("value")
                raw_ts = p.get("ts")
                if raw_value is None or raw_ts is None:
                    continue
                try:
                    value = float(raw_value)
                    ts_dt = datetime.fromtimestamp(int(raw_ts) / 1000, tz=timezone.utc)
                except (TypeError, ValueError):
                    continue
                points.append({
                    "timestamp": ts_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "value": value,
                })

        if not points:
            self.last_call_status = "error"
            logger.warning(f"[SCP Cloud Monitoring 실측] 응답에 유효 포인트가 없음 - 노드: {node_id}, 지표: {metric_name}")
            return None

        self.last_call_status = "ok"

        logger.info(f"[SCP Cloud Monitoring 실측 성공] 노드: {node_id}, 지표: {metric_name}, 포인트 {len(points)}개")
        return points

    def fetch_logs_real(self, limit: int) -> Optional[List[Dict[str, Any]]]:
        """
        SCP Cloud Logging 실 API에서 최근 로그 스트림을 조회합니다.

        자격증명이 없으면 즉시 None(실 호출 시도 안 함). 실패/응답없음/예외 시에도 None을
        반환해 호출측이 시뮬레이터로 안전하게 폴백하도록 합니다.

        # 2026-07-20 P0 실측 결과 (모노스(monos) 실 테넌트 자격증명으로 GET 전용 조사):
        # Cloud Monitoring과 달리 로그 쪽은 host/path 둘 다 확정하지 못했다. DNS 조사로
        # 후보 호스트 2개가 실제로 존재함은 확인했다(virtualserver/cloudmonitoring과 동일
        # API 게이트웨이 IP 112.107.105.24로 응답):
        #   - servicewatch.{region}.{env}.samsungsdscloud.com (ServiceWatch - 로그그룹/
        #     로그스트림 개념, AWS CloudWatch Logs 유사)
        #   - loggingaudit.{region}.{env}.samsungsdscloud.com (Logging & Audit - S3형
        #     버킷 기반 감사추적(Trail), AWS CloudTrail 유사)
        # 두 호스트 모두 추정 경로(/v1/servicewatches/log-groups, /v1/loggingaudits/trails)에
        # GET 요청 시 404가 아니라 403 Forbidden("사용자의 권한이 부여되지 않아 수행할 수
        # 없습니다")을 반환했다 - 이는 경로 자체가 존재를 인식하는(권한 검사 단계까지
        # 도달하는) 게이트웨이 응답이라, 이 access_key(모노스 자격증명)에 ServiceWatch/
        # LoggingAudit API 권한(IAM 스코프)이 아예 부여되지 않았을 가능성이 높다는 뜻이다.
        # 정확한 경로/파라미터/응답 스키마는 여전히 미확정이며, 설령 확정해도 이 계정
        # 권한으로는 403이 계속될 수 있다. 다음 조치 필요: (1) 삼성SDS에 이 access_key의
        # ServiceWatch/LoggingAudit 권한 스코프 확인 요청, (2) 고객사가 실제로 로그그룹/
        # Trail을 프로비저닝했는지 확인(둘 다 사전 생성이 필요한 리소스라 미생성이면 권한이
        # 있어도 로그가 비어있을 수 있음). 아래 경로(settings.SCP_LOGGING_PATH)와 쿼리
        # 파라미터명은 여전히 잠정값이며, 서명 방식만 검증된 Scp-* HMAC 패턴
        # (_generate_signature)을 그대로 재사용한다.
        """
        if not self.access_key or not self.secret_key or not self.project_id:
            return None

        path = settings.SCP_LOGGING_PATH
        timestamp = str(int(time.time() * 1000))
        query_params = {"projectId": self.project_id, "limit": str(limit)}
        query_string = urllib.parse.urlencode(query_params)
        signature = self._generate_signature(
            "GET", path, query_string, timestamp, base_url=self.logging_endpoint_url
        )
        url = f"{self.logging_endpoint_url}{path}?{query_string}"

        headers = {
            "Content-Type": "application/json",
            "Scp-Accesskey": self.access_key,
            "Scp-Timestamp": timestamp,
            "Scp-Signature": signature,
            "Scp-ClientType": "Openapi",
            "Scp-Api-Version": "cloudlogging 1.0",
            "Accept-Language": "ko-KR",
        }

        try:
            with httpx.Client(timeout=10) as client:
                response = client.get(url, headers=headers)
                response.raise_for_status()
                res_data = response.json()
        except Exception as e:
            logger.error(f"[SCP Cloud Logging 실측 실패] 사유: {str(e)}")
            return None

        # TODO(P0 실측): 응답 필드명(logs)은 잠정값이다.
        raw_logs = res_data.get("logs") or []
        if not raw_logs:
            return None

        logger.info(f"[SCP Cloud Logging 실측 성공] 로그 {len(raw_logs)}건 수집")
        return raw_logs

    def fetch_metrics(self, node_id: str, metric_name: str, minutes: int) -> List[Dict[str, Any]]:
        logger.debug(f"[SCP Cloud Monitoring 수집] 프로젝트 노드: {node_id}, 지표: {metric_name}")
        return simulator.get_metrics(self.tenant_id, node_id, metric_name, minutes)

    def fetch_logs(self, limit: int) -> List[Dict[str, Any]]:
        logger.debug("[SCP Cloud Logging 수집] 로그 수집 중...")
        return simulator.get_logs(self.tenant_id, limit, provider="scp")

    def fetch_costs(self) -> Dict[str, Any]:
        logger.debug("[SCP Billing API 비용 수집] 호출 중...")
        return simulator.get_costs(self.tenant_id, provider="scp")

    def get_metadata(self) -> Dict[str, Any]:
        """
        SCP Provider Registry 메타데이터를 반환합니다. (REAL_CAPABLE - HMAC 실연동 가능)
        """
        return get_provider("scp")
