from typing import List, Dict, Any
from loguru import logger

class PredictionService:
    """
    Phase 5 인프라 AIOps: 스토리지/디스크 용량 증가 추세 예측 및 포화 시점 분석 서비스
    """
    
    @staticmethod
    def predict_disk_saturation(historical_usage: List[float], threshold: float = 100.0) -> Dict[str, Any]:
        """
        일별 스토리지 사용률 추이(historical_usage)를 기반으로 선형 경향성(Trend)을 파악하여,
        임계치(threshold, 기본 100%) 도달까지 남은 일수(Days to Saturation)를 예측합니다.
        
        historical_usage: [40.5, 41.2, 41.8, 42.5, 43.1, 43.8, 44.5] 형태의 사용률(%) 목록
        """
        n = len(historical_usage)
        if n < 3:
            return {
                "current_usage_pct": historical_usage[-1] if historical_usage else 0.0,
                "growth_rate_pct_day": 0.0,
                "days_to_saturation": -1.0,
                "saturates_soon": False,
                "reason": "시계열 예측을 위한 데이터 표본(최소 3일)이 부족합니다."
            }
            
        current_val = historical_usage[-1]
        
        # 1. 선형 회귀 경사도(Slope) 계산 (일일 증가량)
        # x: [0, 1, 2, ..., n-1] (일수 간격)
        mean_x = sum(range(n)) / n
        mean_y = sum(historical_usage) / n
        
        numerator = 0.0
        denominator = 0.0
        for i in range(n):
            dx = i - mean_x
            dy = historical_usage[i] - mean_y
            numerator += dx * dy
            denominator += dx * dx
            
        # 일별 사용량 증가율(%)
        slope = numerator / denominator if denominator > 0 else 0.0
        
        # 2. 잔여 일수(Days to Saturation) 예측 산출
        if slope <= 0.0:
            return {
                "current_usage_pct": current_val,
                "growth_rate_pct_day": slope,
                "days_to_saturation": -999.0, # 영구 포화 없음
                "saturates_soon": False,
                "reason": f"사용량이 유지 또는 감소 상태(일일 평균 {slope:.3f}% 변동)로 포화 위험이 없습니다."
            }
            
        # 잔여 목표 용량
        remaining_capacity = threshold - current_val
        if remaining_capacity <= 0.0:
            return {
                "current_usage_pct": current_val,
                "growth_rate_pct_day": slope,
                "days_to_saturation": 0.0, # 이미 포화
                "saturates_soon": True,
                "reason": "스토리지 사용률이 이미 임계치(100%)에 도달하여 장애가 유발되었습니다."
            }
            
        days_left = remaining_capacity / slope
        saturates_soon = days_left < 15.0 # 15일 이내 포화 시 선행 장애 알림 대상
        
        logger.info(
            f"[AIOps 용량 예측] 현재 사용량: {current_val:.1f}%, 일일 증가율: +{slope:.2f}%, "
            f"포화 예측 시점: {days_left:.1f}일 후 (saturates_soon={saturates_soon})"
        )
        
        return {
            "current_usage_pct": current_val,
            "growth_rate_pct_day": slope,
            "days_to_saturation": round(days_left, 1),
            "saturates_soon": saturates_soon,
            "reason": f"현재 일일 평균 {slope:.2f}%씩 스토리지 용량이 증가하고 있으며, 약 {days_left:.1f}일 후 임계 포화에 도달합니다."
        }
