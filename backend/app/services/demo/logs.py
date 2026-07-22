"""
데모 워크스페이스 로그 스트림 생성기 - 고객사 콘솔의 세로 로그 티커용 라인을 만든다.

실 Cloud Logging/CloudWatch Logs 연동 전까지 실 고객사(cloud_adapter.py 경로)는 항상
빈 배열을 정직하게 반환하는 기존 동작을 그대로 유지한다. 데모 워크스페이스만 토폴로지
노드를 순회하며 결정론적으로 회전하는 로그 메시지를 제공해 "관제 중" 느낌을 살린다 -
이상치가 심어진 노드는 주기적으로 WARN/ERROR 로그도 함께 섞여 나온다.
"""
from datetime import datetime, timedelta
from typing import List, Optional

from backend.app.services.demo.topology_data import ANOMALY_REGISTRY, get_topology

_LOG_TEMPLATES = {
    "vm": [("INFO", "헬스체크 정상 응답 (200 OK)"), ("INFO", "요청 처리 완료")],
    "database": [("INFO", "쿼리 처리 완료 (평균 응답 <10ms)"), ("INFO", "커넥션 풀 정상 (사용률 <60%)")],
    "cache": [("INFO", "캐시 히트율 정상 범위 유지")],
    "loadbalancer": [("INFO", "헬스체크 대상 전체 정상 (healthy targets 100%)")],
    "gateway": [("INFO", "아웃바운드 트래픽 정상 처리")],
    "firewall": [("INFO", "룰셋 매칭 - 이상 트래픽 없음")],
    "storage": [("INFO", "백업 스냅샷 정상 완료")],
}

_ANOMALY_TEMPLATES = {
    "cpu_spike": ("WARN", "CPU 사용률 임계치 근접 - 부하 분산 검토 필요"),
    "error_spike": ("ERROR", "5xx 응답 비율 급증 감지"),
    "latency_spike": ("WARN", "응답 지연(latency) 임계치 초과 감지"),
}


def get_logs(tenant_id: str, limit: int = 50, provider: Optional[str] = None) -> List[dict]:
    """데모 테넌트의 최근 로그 라인(limit개, 최신순)을 반환한다."""
    topo = get_topology(tenant_id, provider=provider)
    loggable_nodes = [n for n in topo["nodes"] if n["type"] not in ("vpc", "subnet")]
    if not loggable_nodes:
        return []

    now = datetime.now()
    logs: List[dict] = []
    for i in range(limit):
        node = loggable_nodes[i % len(loggable_nodes)]
        anomaly_kind = ANOMALY_REGISTRY.get(node["id"])

        if anomaly_kind and i % 4 == 0:
            level, message = _ANOMALY_TEMPLATES[anomaly_kind]
        else:
            templates = _LOG_TEMPLATES.get(node["type"], [("INFO", "정상 동작 중")])
            level, message = templates[i % len(templates)]

        logs.append({
            "timestamp": (now - timedelta(seconds=i * 7)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "node_id": node["id"],
            "node_label": node["label"],
            "provider": node["provider"],
            "message": message,
            "level": level,
            "data_source": "DEMO",
        })
    return logs
