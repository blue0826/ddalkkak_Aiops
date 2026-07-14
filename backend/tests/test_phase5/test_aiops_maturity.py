import pytest
from backend.app.services.prediction_service import PredictionService
from backend.app.services.network_service import NetworkAIOpsService
from backend.app.services.secops_service import SecOpsService
from backend.app.services.simulator import simulator

def test_prediction_service_linear_sat():
    """
    일정 비율로 증가하는 디스크 기록을 통해 포화 임계 예측 및 조기 경보 감지 여부를 테스트합니다.
    """
    # 7일간 매일 5%씩 증가하는 시계열
    growing_history = [70.0, 75.0, 80.0, 85.0, 90.0]
    result = PredictionService.predict_disk_saturation(growing_history)
    
    assert result["growth_rate_pct_day"] == 5.0
    assert result["days_to_saturation"] == 2.0  # (100 - 90) / 5 = 2일
    assert result["saturates_soon"] is True

    # 유지되거나 감소하는 시계열 (포화 없음)
    flat_history = [50.0, 50.0, 50.0]
    result_flat = PredictionService.predict_disk_saturation(flat_history)
    assert result_flat["days_to_saturation"] == -999.0
    assert result_flat["saturates_soon"] is False

def test_network_bypass_automation():
    """
    회선 품질 저하 발생 시 VPN으로 자동 우회 트리거 상태 전이를 테스트합니다.
    """
    dedicated_ok = {"status": "ACTIVE", "packet_loss": 0.01, "bandwidth_mbps": 850.0}
    vpn_standby = {"status": "STANDBY", "packet_loss": 0.0, "bandwidth_mbps": 0.0}
    
    # 1. 정상 상황
    res_ok = NetworkAIOpsService.check_network_bypass("tenant-scp", dedicated_ok, vpn_standby)
    assert res_ok["bypass_triggered"] is False
    assert res_ok["active_path"] == "dedicated"
    
    # 2. 패킷 손실 65% 발생으로 장애 우회 상황
    dedicated_bad = {"status": "ACTIVE", "packet_loss": 0.65, "bandwidth_mbps": 850.0}
    res_bad = NetworkAIOpsService.check_network_bypass("tenant-scp", dedicated_bad, vpn_standby)
    assert res_bad["bypass_triggered"] is True
    assert res_bad["active_path"] == "vpn"
    assert res_bad["dedicated_path"]["status"] == "FAILED"
    assert res_bad["vpn_path"]["status"] == "ACTIVE"

def test_secops_soar_containment():
    """
    공격 임계 임계치(5회) 도달 시 SOAR 블랙리스트 자동 등록 및 격리 룰 생성 여부를 테스트합니다.
    """
    clean_logs = [
        {"source_ip": "198.51.100.42", "event_type": "waf_sqli"},
        {"source_ip": "198.51.100.42", "event_type": "waf_sqli"}
    ]
    # 임계치 5회 미만이므로 통과
    res_clean = SecOpsService.analyze_security_threats("tenant-scp", clean_logs, request_threshold=5)
    assert res_clean["threat_detected"] is False
    
    attack_logs = [
        {"source_ip": "198.51.100.42", "event_type": "waf_sqli"},
        {"source_ip": "198.51.100.42", "event_type": "waf_sqli"},
        {"source_ip": "198.51.100.42", "event_type": "waf_sqli"},
        {"source_ip": "198.51.100.42", "event_type": "waf_sqli"},
        {"source_ip": "198.51.100.42", "event_type": "waf_sqli"}
    ]
    # 임계치 5회 충족으로 격리 차단 실행
    res_attack = SecOpsService.analyze_security_threats("tenant-scp", attack_logs, request_threshold=5)
    assert res_attack["threat_detected"] is True
    assert res_attack["attacker_ip"] == "198.51.100.42"
    assert res_attack["soar_action"]["action"] == "BLOCK_INBOUND_IP"

def test_simulator_integrated_api_state():
    """
    시뮬레이터와 비즈니스 레이어 간 연동 데이터 변경 유효성을 검증합니다.
    """
    # 1. IP 차단 시뮬레이터 연동
    ip = "192.0.2.55"
    assert ip not in simulator.get_blocked_ips("tenant-scp")
    simulator.block_ip_address("tenant-scp", ip)
    assert ip in simulator.get_blocked_ips("tenant-scp")
    
    # 2. 전용선 강제 장애 주입
    paths = simulator.get_network_paths("tenant-scp")
    assert paths["dedicated"]["status"] == "ACTIVE"
    
    # 장애 주입
    simulator.trigger_network_incident("tenant-scp")
    assert paths["dedicated"]["status"] == "FAILED"
    assert paths["vpn"]["status"] == "ACTIVE"
    
    # 복구
    simulator.recover_network("tenant-scp")
    assert paths["dedicated"]["status"] == "ACTIVE"
    assert paths["vpn"]["status"] == "STANDBY"
