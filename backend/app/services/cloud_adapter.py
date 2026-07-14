from abc import ABC, abstractmethod
from typing import List, Dict, Any
from backend.app.services.simulator import simulator
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
    """
    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id

    def fetch_metrics(self, node_id: str, metric_name: str, minutes: int) -> List[Dict[str, Any]]:
        logger.debug(f"[AWS CloudWatch Metrics 수집] 노드: {node_id}, 지표: {metric_name}")
        return simulator.get_metrics(self.tenant_id, node_id, metric_name, minutes)

    def fetch_logs(self, limit: int) -> List[Dict[str, Any]]:
        logger.debug("[AWS CloudWatch Logs 수집] 로그 폴링 중...")
        all_logs = simulator.get_logs(self.tenant_id, limit)
        # AWS 관련 로그 필터링 시뮬레이션
        return [log for log in all_logs if "aws" in log.get("node_id", "").lower() or "aws" in log.get("message", "").lower()]

    def fetch_costs(self) -> Dict[str, Any]:
        logger.debug("[AWS Cost Explorer 비용 수집] 호출 중...")
        return simulator.get_costs(self.tenant_id)

import hmac
import hashlib
import time
import urllib.request
import urllib.error
import urllib.parse
import json
import base64

class SCPAdapter(BaseCloudAdapter):
    """
    삼성클라우드플랫폼(SCP) V2 OpenAPI 및 Cloud Monitoring / Billing 수집 어댑터 (Adapter)
    """
    def __init__(
        self, 
        tenant_id: str, 
        access_key: str = None, 
        secret_key: str = None, 
        project_id: str = None, 
        endpoint_url: str = None
    ):
        self.tenant_id = tenant_id
        self.access_key = access_key
        self.secret_key = secret_key
        self.project_id = project_id
        self.endpoint_url = endpoint_url or "https://openapi.samsungsdscloud.com"

    def _generate_signature(self, method: str, path: str, query_string: str, timestamp: str) -> str:
        """
        삼성 SDS SCP V2 OpenAPI 규격 서명 생성기 (HmacSHA256 Base64 인코딩)
        공식 문서 기준: message = method + url + timestamp + accessKey + clientType
        여기서 url = 전체 URL (https://virtualserver.{region}.{env}.samsungsdscloud.com/v1/servers)
        """
        if not self.secret_key:
            return ""

        # 공식 JS 샘플: var url = "{full_url}"; url = encodeURI(url);
        # url은 path가 아닌 전체 URL (host 포함)
        full_url = f"{self.endpoint_url}{path}"
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

    def fetch_metrics(self, node_id: str, metric_name: str, minutes: int) -> List[Dict[str, Any]]:
        logger.debug(f"[SCP Cloud Monitoring 수집] 프로젝트 노드: {node_id}, 지표: {metric_name}")
        return simulator.get_metrics(self.tenant_id, node_id, metric_name, minutes)

    def fetch_logs(self, limit: int) -> List[Dict[str, Any]]:
        logger.debug("[SCP Cloud Logging 수집] 로그 수집 중...")
        return simulator.get_logs(self.tenant_id, limit, provider="scp")

    def fetch_costs(self) -> Dict[str, Any]:
        logger.debug("[SCP Billing API 비용 수집] 호출 중...")
        return simulator.get_costs(self.tenant_id, provider="scp")
