import math
from typing import List
from loguru import logger

class AnomalyDetector:
    """
    L2 통계적 이상탐지 서비스
    슬라이딩 윈도우 기반 동적 베이스라인 및 Z-Score 알고리즘 적용
    """
    
    @staticmethod
    def detect_anomaly(values: List[float], z_threshold: float = 2.5) -> bool:
        """
        주어진 메트릭 시계열 데이터를 분석하여 마지막 값이 이상치인지 판정합니다.
        
        values: 최근 메트릭 값들의 리스트 (최소 5개 이상 권장, 마지막 값이 현재 판정 대상)
        z_threshold: Z-Score 임계값 (기본 2.5: 대략 상하위 1.2% 바깥 영역)
        """
        if not values or len(values) < 5:
            # 데이터 수집 초기 단계이거나 충분한 윈도우 크기가 아니면 정상으로 판단
            logger.debug(f"데이터 개수 부족으로 이상탐지 스킵 (개수: {len(values)})")
            return False
            
        history = values[:-1]
        current_value = values[-1]
        
        # 1. 평균(Mean) 계산
        n = len(history)
        mean = sum(history) / n
        
        # 2. 표준편차(Standard Deviation) 계산
        variance = sum((x - mean) ** 2 for x in history) / n
        std_dev = math.sqrt(variance)
        
        logger.debug(f"이상탐지 모니터링 - 평균: {mean:.2f}, 표준편차: {std_dev:.2f}, 현재값: {current_value:.2f}")
        
        # 표준편차가 거의 0인 경우 (동일한 데이터가 계속 반복될 때)
        if std_dev < 1e-4:
            # 현재 값이 평균과 일치하면 정상, 다르면 이상치로 판정
            is_anomaly = abs(current_value - mean) > 1.0
            if is_anomaly:
                logger.info(f"표준편차 제로 환경 내 급격한 수치 변동 감지 (평균: {mean}, 현재값: {current_value})")
            return is_anomaly
            
        # 3. Z-Score 계산
        z_score = (current_value - mean) / std_dev
        
        is_anomaly = abs(z_score) > z_threshold
        if is_anomaly:
            logger.warning(
                f"[이상탐지 감지] 현재 수치 Z-Score({z_score:.2f})가 임계값({z_threshold})을 초과했습니다. "
                f"(평균: {mean:.2f}, 현재값: {current_value:.2f})"
            )
            
        return is_anomaly
