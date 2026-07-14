import pytest
import time
from backend.app.services.anomaly_detector import AnomalyDetector
from backend.app.services.noise_suppressor import NoiseSuppressor

def test_anomaly_detection_logic():
    """
    동적 윈도우 슬라이딩 Z-Score 이상탐지 기능을 테스트합니다.
    """
    # 1. 완만하게 변화하는 정상 데이터셋
    normal_data = [50.0, 52.0, 48.0, 51.0, 50.0, 49.0, 53.0]
    is_anomaly_normal = AnomalyDetector.detect_anomaly(normal_data, z_threshold=2.5)
    assert is_anomaly_normal is False

    # 2. 마지막에 임계치를 아득히 넘는 급격한 이상 데이터셋
    anomaly_data = [50.0, 51.0, 49.0, 50.0, 52.0, 50.0, 98.0] # 98.0은 기존 평균/편차 대비 이상치
    is_anomaly_spike = AnomalyDetector.detect_anomaly(anomaly_data, z_threshold=2.5)
    assert is_anomaly_spike is True

def test_noise_suppression_and_deduplication():
    """
    알림 중복 차단(Deduplication) 엔진을 테스트합니다.
    """
    # 중복 감지 윈도우를 3초로 세팅하는 로컬 suppressor 인스턴스 생성
    suppressor = NoiseSuppressor(dedup_window_seconds=3, storm_threshold_per_minute=5)
    
    tenant = "tenant-scp"
    node = "scp-vm-web-01"
    metric = "cpu"
    
    # 1. 첫 번째 이벤트: 중복 차단되지 않음 (is_suppressed=False)
    is_suppressed, is_storm = suppressor.process_event(tenant, node, metric)
    assert is_suppressed is False
    assert is_storm is False
    
    # 2. 1초 뒤 두 번째 이벤트: 동일 키이므로 중복 차단됨 (is_suppressed=True)
    time.sleep(0.5)
    is_suppressed, is_storm = suppressor.process_event(tenant, node, metric)
    assert is_suppressed is True
    assert is_storm is False
    
    # 3. 4초 대기 후 세 번째 이벤트: 윈도우 만료로 중복 해제 (is_suppressed=False)
    time.sleep(3.0)
    is_suppressed, is_storm = suppressor.process_event(tenant, node, metric)
    assert is_suppressed is False
    assert is_storm is False

def test_alert_storm_suppression():
    """
    1분 내 다량의 경보 폭증 시 폭풍 제어(Storm Mode) 가동을 검증합니다.
    """
    # 10초 내 3회 이상 알람 시 폭풍 감지하는 로컬 suppressor
    suppressor = NoiseSuppressor(dedup_window_seconds=300, storm_threshold_per_minute=3)
    
    tenant = "tenant-aws"
    
    # 1회차 발생 (정상 처리)
    s1, storm1 = suppressor.process_event(tenant, "vm-1", "cpu")
    assert s1 is False
    assert storm1 is False
    
    # 2회차 발생 (정상 처리)
    s2, storm2 = suppressor.process_event(tenant, "vm-2", "cpu")
    assert s2 is False
    assert storm2 is False
    
    # 3회차 발생 -> 임계치(3) 도달하여 폭풍(Storm) 활성화
    s3, storm3 = suppressor.process_event(tenant, "vm-3", "cpu")
    assert s3 is True  # 세부 이벤트 알림은 차단
    assert storm3 is True # 대신 알람 폭풍 활성화 보고
