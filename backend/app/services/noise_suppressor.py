from typing import Dict, List, Tuple
import time
from collections import defaultdict
from threading import Lock
from loguru import logger

class NoiseSuppressor:
    """
    L3 알림 노이즈 억제 및 중복 제어 서비스
    - 중복 알림 필터링 (Deduplication)
    - 알림 폭풍 억제 (Alert Storm Suppression)
    """
    def __init__(self, dedup_window_seconds: int = 300, storm_threshold_per_minute: int = 10):
        self.dedup_window_seconds = dedup_window_seconds
        self.storm_threshold = storm_threshold_per_minute
        
        # 중복 방지용 알림 캐시 (key: tenant_id:node_id:metric_name -> timestamp)
        self._last_alert_time: Dict[str, float] = {}
        
        # 알림 폭풍 감지용 타임스탬프 리스트 (key: tenant_id -> [timestamp, ...])
        self._tenant_alert_history: Dict[str, List[float]] = defaultdict(list)
        
        # 멀티스레드 세이프 Lock
        self._lock = Lock()

    def process_event(self, tenant_id: str, node_id: str, metric_name: str) -> Tuple[bool, bool]:
        """
        수집된 경보 이벤트를 노이즈 억제 룰 엔진에 통과시킵니다.
        
        리턴값: (is_suppressed, is_storm_active)
        - is_suppressed: 중복 혹은 알람 폭풍 억제에 의해 Operator 대상 전송을 무시해야 하는지 여부
        - is_storm_active: 해당 테넌트에 알람 폭풍 모드가 가동 중인지 여부
        """
        current_time = time.time()
        dedup_key = f"{tenant_id}:{node_id}:{metric_name}"
        
        with self._lock:
            # 1. 알림 폭풍 판정 (최근 60초간 해당 테넌트에 발생한 알림 수 집계)
            history = self._tenant_alert_history[tenant_id]
            # 60초 이전 기록 제거
            history = [t for t in history if current_time - t <= 60.0]
            history.append(current_time)
            self._tenant_alert_history[tenant_id] = history
            
            is_storm_active = len(history) >= self.storm_threshold
            
            if is_storm_active:
                logger.warning(
                    f"[알림 폭풍 감지] 테넌트 '{tenant_id}'의 최근 60초간 알림 발생 수({len(history)})가 "
                    f"임계치({self.storm_threshold})를 초과했습니다. 알림 폭풍 모드를 활성화하고 이벤트를 단일 인시던트로 통합합니다."
                )
                
            # 2. 중복 알림 판정
            last_time = self._last_alert_time.get(dedup_key)
            self._last_alert_time[dedup_key] = current_time
            
            # 알람 폭풍 상태이면 중복 필터를 생략하고 모두 폭풍 처리 그룹으로 인계
            if is_storm_active:
                # 폭풍이 활성화되면 세부 알람은 노이즈 억제(참값 반환)하되 폭풍 상태임을 알려 관리 센터에 요약 인시던트 1개만 발행하도록 함
                return True, True
                
            # 일반 상황에서의 중복 제거 적용
            if last_time and (current_time - last_time < self.dedup_window_seconds):
                logger.info(f"[중복 알림 억제] 동일 리소스 중복 알림 무시 처리 (키: {dedup_key})")
                return True, False
                
            return False, False

    def reset_storm(self, tenant_id: str):
        """
        지정된 테넌트의 알림 폭풍 상태를 강제 초기화합니다 (복구 시 호출).
        """
        with self._lock:
            if tenant_id in self._tenant_alert_history:
                self._tenant_alert_history[tenant_id].clear()
                logger.info(f"테넌트 '{tenant_id}'의 알림 폭풍 상태가 초기화되었습니다.")

# 싱글톤 인스턴스 제공
noise_suppressor = NoiseSuppressor()
