from typing import List, Dict, Any
from loguru import logger

class FinOpsService:
    """
    Phase 4 FinOps 비용 최적화 및 비용 이상탐지 비즈니스 서비스
    """
    
    @staticmethod
    def detect_cost_anomalies(daily_trends: List[Dict[str, Any]], surge_threshold_ratio: float = 1.30) -> List[Dict[str, Any]]:
        """
        일별 요금 추세를 분석하여 최근 평균 대비 급격하게 비용이 치솟은 이상 지점을 감지합니다.
        
        daily_trends: [{"date": "2026-07-01", "amount": 120.0}, ...] 형태의 목록
        """
        anomalies = []
        if len(daily_trends) < 3:
            return anomalies  # 데이터 표본이 부족하면 스킵
            
        # 이전일들의 요금 평균 계산 (마지막 날이 당일 검사 대상)
        history = [d["amount"] for d in daily_trends[:-1]]
        current = daily_trends[-1]
        
        avg_amount = sum(history) / len(history)
        
        # 최근 평균 대비 지정된 비율(기본 30% 증가)을 초과하고 절대 비용 편차가 $15.0 이상인 경우 이상치 판정
        if avg_amount > 0 and (current["amount"] / avg_amount) >= surge_threshold_ratio:
            diff = current["amount"] - avg_amount
            if diff >= 10.0:
                logger.warning(
                    f"[FinOps 비용 이상 감지] 날짜: {current['date']}, "
                    f"이전 평균: ${avg_amount:.2f}, 당일 요금: ${current['amount']:.2f} (차액: +${diff:.2f})"
                )
                anomalies.append({
                    "date": current["date"],
                    "average_amount": avg_amount,
                    "anomaly_amount": current["amount"],
                    "difference": diff,
                    "severity": "CRITICAL" if diff >= 50.0 else "WARNING",
                    "reason": f"최근 평균 일일 비용(${avg_amount:.2f}) 대비 당일 요금이 {(current['amount']/avg_amount*100 - 100):.1f}% 급증하였습니다."
                })
                
        return anomalies

    @staticmethod
    def get_dynamic_rightsizing(nodes: List[Dict[str, Any]], cpu_metrics_simulator: Any) -> List[Dict[str, Any]]:
        """
        가상 리소스의 실시간 평균 성능 부하(CPU Utilization)를 조회하여 
        사양 조정(Rightsizing) 제안 목록을 동적으로 구성합니다.
        """
        recommendations = []
        
        for node in nodes:
            if node.get("type") not in ["vm", "database"]:
                continue
                
            node_id = node["id"]
            node_label = node["label"]
            provider = node.get("provider", "aws")
            
            # 시뮬레이터로부터 해당 노드의 실시간 메트릭 획득
            metrics_points = cpu_metrics_simulator.get_metrics(
                tenant_id="system", # 어드민 통계 관점의 조회
                node_id=node_id,
                metric_name="cpu",
                minutes=60
            )
            
            if not metrics_points:
                continue
                
            avg_cpu = sum(p["value"] for p in metrics_points) / len(metrics_points)
            
            # A. 유휴 상태(Idle) 인스턴스: 스케일다운 추천
            if avg_cpu < 5.0:
                current_cost = 80.0 if provider == "scp" else 64.0
                target_cost = 40.0 if provider == "scp" else 16.0
                savings = current_cost - target_cost
                
                recommendations.append({
                    "node_id": node_id,
                    "node_label": node_label,
                    "avg_cpu": avg_cpu,
                    "action": "Downgrade (Scale-Down)",
                    "reason": f"최근 60분 평균 CPU 사용률이 {avg_cpu:.2f}%로 극히 저조하여 자원이 낭비되고 있습니다.",
                    "current_monthly_cost": current_cost,
                    "target_monthly_cost": target_cost,
                    "savings": savings,
                    "recommendation_text": f"인스턴스 타입을 1단계 축소하여 월간 ${savings:.2f} 비용을 최적화하십시오."
                })
                
            # B. 과부하 상태(Overloaded) 인스턴스: 장애 방지용 스케일업 추천
            elif avg_cpu > 80.0:
                current_cost = 80.0 if provider == "scp" else 64.0
                target_cost = 160.0 if provider == "scp" else 128.0
                
                recommendations.append({
                    "node_id": node_id,
                    "node_label": node_label,
                    "avg_cpu": avg_cpu,
                    "action": "Upgrade (Scale-Up)",
                    "reason": f"최근 60분 평균 CPU 사용률이 {avg_cpu:.2f}%에 달하여 장애 유발 포화 상태입니다.",
                    "current_monthly_cost": current_cost,
                    "target_monthly_cost": target_cost,
                    "savings": 0.0, # 증설로 인한 비용 증가는 savings = 0
                    "recommendation_text": "인스턴스 성능 병목 현상을 해결하기 위해 CPU 코어 증설 또는 스케일업을 즉시 권고합니다."
                })
                
        return recommendations

    @staticmethod
    def simulate_rightsizing(current_metrics: List[Dict[str, Any]], scale_ratio: float = 2.0) -> List[Dict[str, Any]]:
        """
        비용 최적화(Rightsizing) 제안을 적용했을 때의 예상 CPU 사용률 시뮬레이션을 수행합니다.
        
        current_metrics: [{"timestamp": "...", "value": 15.0}, ...]
        scale_ratio: 인스턴스 축소 비율 (예: 4vCPU -> 2vCPU로 다운사이징 시 2.0배 증가)
        """
        simulated_points = []
        for point in current_metrics:
            val = point["value"]
            # 리소스 축소 시 CPU 부하 비례 증가 + 노이즈 오차 변동폭 확대 적용
            import random
            simulated_val = val * scale_ratio + random.uniform(-1.5, 3.5)
            # 100% 임계 클램핑
            simulated_val = max(0.0, min(100.0, simulated_val))
            
            simulated_points.append({
                "timestamp": point["timestamp"],
                "original_value": val,
                "simulated_value": round(simulated_val, 2)
            })
        return simulated_points

