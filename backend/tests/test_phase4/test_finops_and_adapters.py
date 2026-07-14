import pytest
from unittest.mock import MagicMock
from backend.app.services.finops_service import FinOpsService
from backend.app.services.cloud_adapter import AWSAdapter, SCPAdapter

def test_cost_anomaly_detection_stable():
    """
    요금 변화 추세가 균등하고 안정적인 경우 이상치로 감지하지 않는지 검증합니다.
    """
    stable_trends = [
        {"date": "2026-07-01", "amount": 100.0},
        {"date": "2026-07-02", "amount": 102.0},
        {"date": "2026-07-03", "amount": 98.0},
        {"date": "2026-07-04", "amount": 101.0},
        {"date": "2026-07-05", "amount": 100.0}
    ]
    anomalies = FinOpsService.detect_cost_anomalies(stable_trends)
    assert len(anomalies) == 0

def test_cost_anomaly_detection_surge():
    """
    마지막 날 요금이 이전 평균 대비 폭증하였을 때 비용 이상 감지 및 심각도를 파악합니다.
    """
    surge_trends = [
        {"date": "2026-07-01", "amount": 10.0},
        {"date": "2026-07-02", "amount": 10.0},
        {"date": "2026-07-03", "amount": 10.0},
        {"date": "2026-07-04", "amount": 10.0},
        # 이전 평균 $10.0 대비 3배인 $30.0 발생 (차액 $20.0)
        {"date": "2026-07-05", "amount": 30.0}
    ]
    anomalies = FinOpsService.detect_cost_anomalies(surge_trends)
    assert len(anomalies) == 1
    assert anomalies[0]["difference"] == 20.0
    assert anomalies[0]["severity"] == "WARNING"

    critical_trends = [
        {"date": "2026-07-01", "amount": 20.0},
        {"date": "2026-07-02", "amount": 20.0},
        # 이전 평균 $20.0 대비 $80.0 발생 (차액 $60.0, 임계치인 50.0달러 초과)
        {"date": "2026-07-03", "amount": 80.0}
    ]
    anomalies_critical = FinOpsService.detect_cost_anomalies(critical_trends)
    assert len(anomalies_critical) == 1
    assert anomalies_critical[0]["severity"] == "CRITICAL"

def test_dynamic_rightsizing_recommendations():
    """
    인스턴스 부하 수준에 따라 최적화 권고안이 타당하게 발급되는지 검증합니다.
    """
    mock_nodes = [
        {"id": "vm-idle", "label": "유휴 웹서버", "type": "vm", "provider": "aws"},
        {"id": "vm-busy", "label": "과부하 앱서버", "type": "vm", "provider": "scp"},
        {"id": "s3-bucket", "label": "스토리지", "type": "storage", "provider": "aws"} # 대상 외
    ]

    # CPU 메트릭 시뮬레이터 가상 모킹
    mock_simulator = MagicMock()
    
    # vm-idle은 평균 CPU 2% 반환하도록 설정
    mock_simulator.get_metrics.side_effect = lambda tenant_id, node_id, metric_name, minutes: (
        [{"timestamp": "1", "value": 2.0}, {"timestamp": "2", "value": 2.0}]
        if node_id == "vm-idle"
        # vm-busy는 평균 CPU 90% 반환하도록 설정
        else [{"timestamp": "1", "value": 90.0}, {"timestamp": "2", "value": 90.0}]
    )

    recs = FinOpsService.get_dynamic_rightsizing(mock_nodes, mock_simulator)
    
    # vm-idle, vm-busy 두 건이 잡혀야 함
    assert len(recs) == 2
    
    idle_rec = next(r for r in recs if r["node_id"] == "vm-idle")
    assert idle_rec["action"] == "Downgrade (Scale-Down)"
    assert idle_rec["savings"] == 48.0 # AWS 기준: 64.0 -> 16.0 절감액

    busy_rec = next(r for r in recs if r["node_id"] == "vm-busy")
    assert busy_rec["action"] == "Upgrade (Scale-Up)"
    assert busy_rec["savings"] == 0.0

def test_cloud_provider_adapters():
    """
    포트&어댑터 패턴에 따라 AWS 및 SCP 어댑터가 공통 수집 계약을 올바르게 구현하는지 검증합니다.
    """
    aws = AWSAdapter(tenant_id="tenant-aws")
    scp = SCPAdapter(tenant_id="tenant-scp")

    # 상속 관계 타입 체크
    assert isinstance(aws, AWSAdapter)
    assert isinstance(scp, SCPAdapter)

    # 시뮬레이터 결과 조회 연동 테스트
    aws_costs = aws.fetch_costs()
    scp_costs = scp.fetch_costs()
    
    assert aws_costs is not None
    assert scp_costs is not None
    assert "monthly_total" in aws_costs
    assert "monthly_total" in scp_costs
