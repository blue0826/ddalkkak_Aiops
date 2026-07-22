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
    본 플랫폼은 원화(KRW)만 취급하므로 테스트 데이터도 KRW 스케일(만원~수십만원 단위)을 사용한다.
    """
    surge_trends = [
        {"date": "2026-07-01", "amount": 100000.0},
        {"date": "2026-07-02", "amount": 100000.0},
        {"date": "2026-07-03", "amount": 100000.0},
        {"date": "2026-07-04", "amount": 100000.0},
        # 이전 평균 ₩100,000 대비 1.3배인 ₩130,000 발생 (차액 ₩30,000 - CRITICAL 임계치인 50,000 미만)
        {"date": "2026-07-05", "amount": 130000.0}
    ]
    anomalies = FinOpsService.detect_cost_anomalies(surge_trends)
    assert len(anomalies) == 1
    assert anomalies[0]["difference"] == 30000.0
    assert anomalies[0]["severity"] == "WARNING"
    assert "₩" in anomalies[0]["reason"]
    assert "$" not in anomalies[0]["reason"]
    # KRW 표기는 소수점을 포함하지 않는다
    assert "." not in anomalies[0]["reason"].split("₩")[1].split(")")[0]

    critical_trends = [
        {"date": "2026-07-01", "amount": 200000.0},
        {"date": "2026-07-02", "amount": 200000.0},
        # 이전 평균 ₩200,000 대비 ₩800,000 발생 (차액 ₩600,000, CRITICAL 임계치인 50,000 초과)
        {"date": "2026-07-03", "amount": 800000.0}
    ]
    anomalies_critical = FinOpsService.detect_cost_anomalies(critical_trends)
    assert len(anomalies_critical) == 1
    assert anomalies_critical[0]["severity"] == "CRITICAL"


def test_cost_anomaly_absolute_deviation_floor_is_krw_scaled():
    """
    비율(30%) 조건은 충족하더라도 절대 편차가 ₩10,000 미만이면 이상치로 잡히지 않아야 한다.
    (구 버전은 $15.0 = 15원 수준의 하한이라 KRW 데이터에서는 사실상 항상 통과하는 버그였음)
    """
    small_deviation_trends = [
        {"date": "2026-07-01", "amount": 10000.0},
        {"date": "2026-07-02", "amount": 10000.0},
        {"date": "2026-07-03", "amount": 10000.0},
        # 30% 급증(비율 조건 충족)이지만 차액은 ₩3,000으로 ₩10,000 하한 미달
        {"date": "2026-07-04", "amount": 13000.0}
    ]
    anomalies = FinOpsService.detect_cost_anomalies(small_deviation_trends)
    assert len(anomalies) == 0


def test_cost_anomaly_severity_boundary_at_50000_krw():
    """
    절대 편차가 정확히 ₩50,000 이상이면 CRITICAL로 분류되어야 한다.
    """
    boundary_trends = [
        {"date": "2026-07-01", "amount": 100000.0},
        {"date": "2026-07-02", "amount": 100000.0},
        # 차액 정확히 ₩50,000 (>= 50000 이므로 CRITICAL)
        {"date": "2026-07-03", "amount": 150000.0}
    ]
    anomalies = FinOpsService.detect_cost_anomalies(boundary_trends)
    assert len(anomalies) == 1
    assert anomalies[0]["difference"] == 50000.0
    assert anomalies[0]["severity"] == "CRITICAL"

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
    # AWS 기준 월간 인스턴스 요금은 KRW 스케일(₩87,750 -> ₩43,875)이어야 하며,
    # USD 매그니튜드(예: 64.0, 16.0) 잔재가 남아있으면 안 된다.
    assert idle_rec["current_monthly_cost"] == 87750.0
    assert idle_rec["target_monthly_cost"] == 43875.0
    assert idle_rec["savings"] == 43875.0  # AWS 기준: ₩87,750 -> ₩43,875 절감액
    assert idle_rec["savings"] == idle_rec["current_monthly_cost"] - idle_rec["target_monthly_cost"]
    assert idle_rec["savings"] >= 10000  # KRW 스케일(수만원 단위) 확인 - USD 잔재 방지
    assert "₩" in idle_rec["recommendation_text"]
    assert "$" not in idle_rec["recommendation_text"]

    busy_rec = next(r for r in recs if r["node_id"] == "vm-busy")
    assert busy_rec["action"] == "Upgrade (Scale-Up)"
    # SCP 기준 월간 인스턴스 요금도 KRW 스케일(₩178,200 -> ₩356,400)이어야 한다.
    assert busy_rec["current_monthly_cost"] == 178200.0
    assert busy_rec["target_monthly_cost"] == 356400.0
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
