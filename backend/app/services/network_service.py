from typing import Dict, Any
from loguru import logger

class NetworkAIOpsService:
    """
    Phase 5 네트워크 AIOps: Flow Log 분석 및 이중화 회선(전용선/VPN) 자동 우회(Bypass) 서비스
    """
    
    @staticmethod
    def check_network_bypass(
        tenant_id: str,
        dedicated_path: Dict[str, Any],
        vpn_path: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        전용회선(Dedicated Line)의 헬스 지표를 검사하여 장애 유발 시 VPN으로 액티브 라우팅 경로를 스위칭합니다.
        
        dedicated_path: {"status": "ACTIVE"|"FAILED", "packet_loss": 0.05, "bandwidth_mbps": 850.0}
        vpn_path: {"status": "STANDBY"|"ACTIVE", "packet_loss": 0.0, "bandwidth_mbps": 0.0}
        """
        packet_loss = dedicated_path.get("packet_loss", 0.0)
        status = dedicated_path.get("status", "ACTIVE")
        
        # 전용선의 패킷 손실률이 40%(0.40)를 초과하거나 강제 FAILED 상태인 경우
        if packet_loss >= 0.40 or status == "FAILED":
            logger.warning(
                f"[네트워크 AIOps 장애 경보] 테넌트: {tenant_id}, "
                f"전용회선 패킷 드랍 감지: {packet_loss * 100:.1f}%. 즉각적인 VPN 우회(Bypass) 실행"
            )
            
            # VPN 회선 액티브 활성화, 전용선은 대기(STANDBY)/장애 상태로 락다운
            updated_dedicated = {
                "status": "FAILED",
                "packet_loss": packet_loss,
                "bandwidth_mbps": 0.0
            }
            updated_vpn = {
                "status": "ACTIVE",
                "packet_loss": vpn_path.get("packet_loss", 0.0),
                "bandwidth_mbps": 450.0 # 백업 VPN 대역폭 가동
            }
            
            return {
                "bypass_triggered": True,
                "active_path": "vpn",
                "dedicated_path": updated_dedicated,
                "vpn_path": updated_vpn,
                "remediation_action": "회선 장애 발생에 따른 전용선 → VPN 라우팅 테이블 변경 및 자동 우회 명령 송출",
                "log_message": f"[Network Auto-Bypass] Dedicated line packet loss ({packet_loss*100:.1f}%) exceeded SLA. Session failed. Switched active traffic flow to VPN tunnel."
            }
            
        # 전용회선이 건강할 때는 전용선 활성화, VPN은 STANDBY로 유지
        return {
            "bypass_triggered": False,
            "active_path": "dedicated",
            "dedicated_path": dedicated_path,
            "vpn_path": vpn_path,
            "remediation_action": "기본 전용회선 라우팅 경로 활성 상태 유지",
            "log_message": "Dedicated line connection is fully optimized and stable."
        }
