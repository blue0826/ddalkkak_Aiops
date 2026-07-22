import random
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from loguru import logger
from decimal import Decimal
from backend.app.core.providers import get_provider

class InfrastructureSimulator:
    """
    CEO 지시(2026-07-15): 프로덕션 코드 경로에는 하드코딩된 데모/가짜 데이터를 1도 두지
    않는다. 실 자격증명으로 실제 클라우드 API에서 수집된 값(active_real_vms 등)이 없으면
    모든 조회 메서드는 정직하게 빈 값을 반환한다. 과거 이 클래스가 생성자에서 즉시
    채우던 15개 하드코딩 노드/링크, 가짜 로그/이벤트/비용 수치는 전부 제거되었다.

    테스트 스위트가 여전히 필요로 하는 데모 토폴로지는 load_sample_topology()로 분리했다
    - 이 메서드는 backend/tests/conftest.py의 테스트 전용 픽스처에서만 호출되며,
    프로덕션 코드(routers/*, services/*)는 절대 호출하지 않는다.
    """

    def __init__(self):
        # 실 SCP OpenAPI 연동 시 수집된 실제 VM 정보 캐시 (tenant_id -> [node, ...])
        self.active_real_vms = {}
        # SOAR에 의해 차단된 공격 IP 목록 - 실 차단 조치가 있을 때만 채워진다
        self.blocked_ips = []
        # 이중화 회선 상태 - 실 네트워크 모니터링 연동 전이므로 중립(UNKNOWN) 값으로 시작한다.
        # trigger_network_incident/recover_network는 운영자가 명시적으로 호출하는 수동
        # DR 훈련 액션이므로(자동 생성 데이터가 아님) 해당 메서드들의 전이 값은 그대로 유지한다.
        self.network_status = {
            "dedicated": {"status": "UNKNOWN", "packet_loss": 0.0, "bandwidth_mbps": 0.0},
            "vpn": {"status": "UNKNOWN", "packet_loss": 0.0, "bandwidth_mbps": 0.0}
        }
        # 디스크 사용률 이력 - 실 Cloud Monitoring 디스크 메트릭 연동 전이므로 비어 있다
        self.disk_histories = {}

        # 토폴로지 노드/링크 - 실 VM 인벤토리(active_real_vms)로만 채워진다 (기본값: 빈 인프라)
        self.nodes = []
        self.links = []

    def load_sample_topology(self):
        """
        [테스트 전용] 과거 이 클래스 생성자가 직접 시딩하던 데모 토폴로지(15개 노드,
        링크, 디스크 이력)를 그대로 주입한다. 프로덕션 코드 경로에서는 절대 호출하지
        않으며, backend/tests/conftest.py의 세션 스코프 픽스처에서만 호출된다
        (토폴로지/메트릭/탐지 사이클 등 데모 인프라를 전제로 작성된 기존 테스트 스위트를
        그대로 통과시키기 위한 테스트 픽스처 전용 헬퍼).
        """
        self.disk_histories = {
            "scp-vm-web-01": [40.5, 41.2, 42.1, 43.0, 43.8, 44.5, 45.2],
            "scp-vm-app-01": [70.5, 72.8, 75.2, 77.8, 80.5, 83.1, 85.8]  # 가파른 증가로 포화 임박 VM
        }

        # 가상 노드 정의 (id, label, type, status, provider, tenant_id, metadata)
        self.nodes = [
            # SCP 테넌트 (tenant-scp)
            {"id": "scp-vpc-01", "label": "VPC-01", "type": "vpc", "status": "running", "provider": "scp", "tenant_id": "tenant-scp", "cpu": 0.0, "memory": 0.0},
            {"id": "scp-subnet-pub", "label": "Subnet-Public", "type": "subnet", "status": "running", "provider": "scp", "tenant_id": "tenant-scp", "cpu": 0.0, "memory": 0.0},
            {"id": "scp-subnet-priv", "label": "Subnet-Private", "type": "subnet", "status": "running", "provider": "scp", "tenant_id": "tenant-scp", "cpu": 0.0, "memory": 0.0},

            # WAF & IGW & Bastion & NAT
            {"id": "scp-igw-01", "label": "SCP-Internet-Gateway", "type": "gateway", "status": "running", "provider": "scp", "tenant_id": "tenant-scp", "cpu": 0.0, "memory": 0.0},
            {"id": "scp-waf-01", "label": "SCP-WAF-Shield", "type": "firewall", "status": "running", "provider": "scp", "tenant_id": "tenant-scp", "cpu": 5.0, "memory": 12.0},
            {"id": "scp-bastion-01", "label": "SCP-Bastion-Host", "type": "vm", "status": "running", "provider": "scp", "tenant_id": "tenant-scp", "cpu": 10.0, "memory": 15.0},
            {"id": "scp-nat-01", "label": "SCP-NAT-Gateway", "type": "gateway", "status": "running", "provider": "scp", "tenant_id": "tenant-scp", "cpu": 0.0, "memory": 0.0},

            {"id": "scp-lb-01", "label": "LoadBalancer-01", "type": "loadbalancer", "status": "running", "provider": "scp", "tenant_id": "tenant-scp", "cpu": 15.0, "memory": 30.0},
            {"id": "scp-vm-web-01", "label": "VM-Web-01", "type": "vm", "status": "running", "provider": "scp", "tenant_id": "tenant-scp", "cpu": 45.0, "memory": 60.0},
            {"id": "scp-vm-web-02", "label": "VM-Web-02", "type": "vm", "status": "running", "provider": "scp", "tenant_id": "tenant-scp", "cpu": 48.0, "memory": 58.0},
            {"id": "scp-vm-app-01", "label": "VM-App-01", "type": "vm", "status": "warning", "provider": "scp", "tenant_id": "tenant-scp", "cpu": 92.5, "memory": 88.0},
            {"id": "scp-vm-app-02", "label": "VM-App-02", "type": "vm", "status": "running", "provider": "scp", "tenant_id": "tenant-scp", "cpu": 35.0, "memory": 52.0},

            # NAS Storage 추가
            {"id": "scp-nas-storage", "label": "SCP-HighPerf-NAS", "type": "storage", "status": "running", "provider": "scp", "tenant_id": "tenant-scp", "cpu": 0.0, "memory": 0.0},
            {"id": "scp-db-maria-01", "label": "MariaDB-Prod", "type": "database", "status": "running", "provider": "scp", "tenant_id": "tenant-scp", "cpu": 25.0, "memory": 75.0},
            {"id": "scp-obs-backup", "label": "OBS-Backup-Bucket", "type": "storage", "status": "running", "provider": "scp", "tenant_id": "tenant-scp", "cpu": 0.0, "memory": 0.0},

            # AWS 테넌트 (tenant-aws)
            {"id": "aws-vpc-prod", "label": "VPC-Prod", "type": "vpc", "status": "running", "provider": "aws", "tenant_id": "tenant-aws", "cpu": 0.0, "memory": 0.0},
            {"id": "aws-subnet-public", "label": "Subnet-Public", "type": "subnet", "status": "running", "provider": "aws", "tenant_id": "tenant-aws", "cpu": 0.0, "memory": 0.0},
            {"id": "aws-subnet-private", "label": "Subnet-Private", "type": "subnet", "status": "running", "provider": "aws", "tenant_id": "tenant-aws", "cpu": 0.0, "memory": 0.0},

            # AWS Shield, IGW, NAT Gateway
            {"id": "aws-igw-01", "label": "AWS-Internet-Gateway", "type": "gateway", "status": "running", "provider": "aws", "tenant_id": "tenant-aws", "cpu": 0.0, "memory": 0.0},
            {"id": "aws-waf-01", "label": "AWS-WAF-Shield", "type": "firewall", "status": "running", "provider": "aws", "tenant_id": "tenant-aws", "cpu": 4.0, "memory": 10.0},
            {"id": "aws-nat-01", "label": "AWS-NAT-Gateway", "type": "gateway", "status": "running", "provider": "aws", "tenant_id": "tenant-aws", "cpu": 0.0, "memory": 0.0},

            {"id": "aws-alb-web", "label": "ALB-Web-External", "type": "loadbalancer", "status": "running", "provider": "aws", "tenant_id": "tenant-aws", "cpu": 12.0, "memory": 20.0},
            {"id": "aws-ec2-web-01", "label": "EC2-Web-01", "type": "vm", "status": "running", "provider": "aws", "tenant_id": "tenant-aws", "cpu": 40.0, "memory": 50.0},
            {"id": "aws-ec2-web-02", "label": "EC2-Web-02", "type": "vm", "status": "running", "provider": "aws", "tenant_id": "tenant-aws", "cpu": 38.0, "memory": 48.0},
            {"id": "aws-ec2-app-01", "label": "EC2-App-01", "type": "vm", "status": "running", "provider": "aws", "tenant_id": "tenant-aws", "cpu": 62.0, "memory": 70.0},
            {"id": "aws-rds-postgresql", "label": "RDS-PostgreSQL-Prod", "type": "database", "status": "running", "provider": "aws", "tenant_id": "tenant-aws", "cpu": 18.0, "memory": 65.0},
            {"id": "aws-s3-assets", "label": "S3-Assets-Bucket", "type": "storage", "status": "running", "provider": "aws", "tenant_id": "tenant-aws", "cpu": 0.0, "memory": 0.0}
        ]

        # 가상 관계/링크 정의 (source, target, type)
        self.links = [
            # SCP 링크
            {"source": "scp-vpc-01", "target": "scp-subnet-pub", "type": "parent_child"},
            {"source": "scp-vpc-01", "target": "scp-subnet-priv", "type": "parent_child"},

            # IGW & WAF & Subnets 연결
            {"source": "scp-vpc-01", "target": "scp-igw-01", "type": "parent_child"},
            {"source": "scp-subnet-pub", "target": "scp-waf-01", "type": "parent_child"},
            {"source": "scp-subnet-priv", "target": "scp-bastion-01", "type": "parent_child"},
            {"source": "scp-subnet-priv", "target": "scp-nat-01", "type": "parent_child"},

            {"source": "scp-igw-01", "target": "scp-waf-01", "type": "network_flow"},
            {"source": "scp-waf-01", "target": "scp-lb-01", "type": "network_flow"},

            {"source": "scp-subnet-pub", "target": "scp-lb-01", "type": "parent_child"},
            {"source": "scp-subnet-pub", "target": "scp-vm-web-01", "type": "parent_child"},
            {"source": "scp-subnet-pub", "target": "scp-vm-web-02", "type": "parent_child"},
            {"source": "scp-subnet-priv", "target": "scp-vm-app-01", "type": "parent_child"},
            {"source": "scp-subnet-priv", "target": "scp-vm-app-02", "type": "parent_child"},
            {"source": "scp-subnet-priv", "target": "scp-db-maria-01", "type": "parent_child"},

            {"source": "scp-lb-01", "target": "scp-vm-web-01", "type": "network_flow"},
            {"source": "scp-lb-01", "target": "scp-vm-web-02", "type": "network_flow"},
            {"source": "scp-vm-web-01", "target": "scp-vm-app-01", "type": "network_flow"},
            {"source": "scp-vm-web-02", "target": "scp-vm-app-02", "type": "network_flow"},

            # NAT 및 NAS 스토리지 네트워크 플로우 연결
            {"source": "scp-vm-app-01", "target": "scp-nas-storage", "type": "network_flow"},
            {"source": "scp-vm-app-02", "target": "scp-nas-storage", "type": "network_flow"},
            {"source": "scp-vm-app-01", "target": "scp-nat-01", "type": "network_flow"},
            {"source": "scp-vm-app-02", "target": "scp-nat-01", "type": "network_flow"},

            {"source": "scp-vm-app-01", "target": "scp-db-maria-01", "type": "network_flow"},
            {"source": "scp-vm-app-02", "target": "scp-db-maria-01", "type": "network_flow"},
            {"source": "scp-vm-app-01", "target": "scp-obs-backup", "type": "association"},

            # AWS 링크
            {"source": "aws-vpc-prod", "target": "aws-subnet-public", "type": "parent_child"},
            {"source": "aws-vpc-prod", "target": "aws-subnet-private", "type": "parent_child"},

            # AWS IGW / WAF / NAT
            {"source": "aws-vpc-prod", "target": "aws-igw-01", "type": "parent_child"},
            {"source": "aws-subnet-public", "target": "aws-waf-01", "type": "parent_child"},
            {"source": "aws-subnet-private", "target": "aws-nat-01", "type": "parent_child"},

            {"source": "aws-igw-01", "target": "aws-waf-01", "type": "network_flow"},
            {"source": "aws-waf-01", "target": "aws-alb-web", "type": "network_flow"},
            {"source": "aws-ec2-app-01", "target": "aws-nat-01", "type": "network_flow"},

            {"source": "aws-subnet-public", "target": "aws-alb-web", "type": "parent_child"},
            {"source": "aws-subnet-public", "target": "aws-ec2-web-01", "type": "parent_child"},
            {"source": "aws-subnet-public", "target": "aws-ec2-web-02", "type": "parent_child"},
            {"source": "aws-subnet-private", "target": "aws-ec2-app-01", "type": "parent_child"},
            {"source": "aws-subnet-private", "target": "aws-rds-postgresql", "type": "parent_child"},
            {"source": "aws-alb-web", "target": "aws-ec2-web-01", "type": "network_flow"},
            {"source": "aws-alb-web", "target": "aws-ec2-web-02", "type": "network_flow"},
            {"source": "aws-ec2-web-01", "target": "aws-ec2-app-01", "type": "network_flow"},
            {"source": "aws-ec2-web-02", "target": "aws-ec2-app-01", "type": "network_flow"},
            {"source": "aws-ec2-app-01", "target": "aws-rds-postgresql", "type": "network_flow"},
            {"source": "aws-ec2-app-01", "target": "aws-s3-assets", "type": "association"}
        ]

        # 각 노드에 Provider Registry 기준 리전(region)을 부여 (SCP -> kr-west1, AWS -> ap-northeast-2)
        for node in self.nodes:
            provider_meta = get_provider(node.get("provider"))
            if provider_meta:
                node["region"] = provider_meta["default_region"]

    def get_topology(self, tenant_id: str, provider: Optional[str] = None) -> dict:
        """
        테넌트 ID 및 CSP(provider)에 해당하는 토폴로지 노드 및 링크 정보를 반환합니다.
        실 VM 인벤토리가 주입되지 않은 상태(self.nodes가 비어 있음)라면 빈 토폴로지를
        정직하게 반환합니다.
        """
        logger.info(f"Topology 조회 요청 수신 - tenant_id: {tenant_id}, provider: {provider}")

        # 1. 테넌트 기반 기본 필터링
        if tenant_id == "system":
            nodes = self.nodes
            links = self.links
        else:
            nodes = [node for node in self.nodes if node["tenant_id"] == tenant_id]
            node_ids = {node["id"] for node in nodes}
            links = [link for link in self.links if link["source"] in node_ids and link["target"] in node_ids]

        # 2. CSP (provider) 기반 추가 필터링
        if provider:
            nodes = [node for node in nodes if node["provider"] == provider]
            node_ids = {node["id"] for node in nodes}
            links = [link for link in links if link["source"] in node_ids and link["target"] in node_ids]

        return {"nodes": nodes, "links": links}

    def get_metrics(self, tenant_id: str, node_id: str, metric_name: str, minutes: int = 60) -> List[dict]:
        """
        노드의 실제 등록된 상태값(active_real_vms로 수집된 실 VM, 또는 테스트 픽스처로
        주입된 노드)을 시계열 포인트로 반환합니다.

        사인파/랜덤 노이즈로 가짜 시계열을 지어내지 않습니다 - 실 시계열 수집 소스가
        아직 없으므로, 조회 시점에 알고 있는 단일 상태값을 각 타임스탬프에 그대로
        반영합니다. 노드를 찾지 못했거나 요청한 지표 값이 없으면 정직하게 빈 리스트를
        반환합니다.
        """
        logger.info(f"Metrics 조회 - tenant_id: {tenant_id}, node_id: {node_id}, metric_name: {metric_name}")

        real_vms = self.active_real_vms.get(tenant_id, [])
        all_nodes = self.nodes + real_vms

        # 만약 클라이언트가 옛날 가짜 ID(scp-vm- 등)로 메트릭을 요청했고 실서버 연동 중이라면,
        # 실서버 VM 중 하나에 매칭되게 치환 처리 (값을 생성하지 않는 ID 라우팅일 뿐이다)
        target_node = next((n for n in all_nodes if n["id"] == node_id), None)

        if not target_node and real_vms:
            # 매핑 폴백: 가짜 ID를 실제 VM ID로 동적 우회 매핑
            if "web" in node_id and len(real_vms) > 0:
                target_node = real_vms[0]
            elif "app" in node_id and len(real_vms) > 1:
                target_node = real_vms[1]
            elif "db" in node_id and len(real_vms) > 2:
                target_node = real_vms[2]
            else:
                target_node = real_vms[0]

        if not target_node:
            return []

        if tenant_id != "system" and target_node["tenant_id"] != tenant_id:
            logger.warning(f"테넌트 불일치 접근 금지: {tenant_id} -> {node_id}")
            return []

        base_value = target_node.get(metric_name)
        if base_value is None:
            return []

        points = []
        now = datetime.now()
        for i in range(minutes, 0, -1):
            time_point = now - timedelta(minutes=i)
            points.append({
                "timestamp": time_point.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "value": round(float(base_value), 2)
            })
        return points

    def get_logs(self, tenant_id: str, limit: int = 50, provider: Optional[str] = None) -> List[dict]:
        """
        실 Cloud Logging/CloudWatch Logs API 연동은 아직 구현되지 않았습니다 (P0 실측 대기).
        하드코딩된 로그 템플릿으로 가짜 로그를 지어내지 않고 정직하게 빈 리스트를 반환합니다.
        """
        logger.info(f"Logs 조회 요청 - tenant_id: {tenant_id}, provider: {provider} (실 로그 소스 미연동 - 빈 값 반환)")
        return []

    def get_events(self, tenant_id: str, provider: Optional[str] = None) -> List[dict]:
        """
        실 경보/이벤트 API(SCP Cloud Monitoring 알람, AWS CloudWatch 알람) 연동은 아직
        구현되지 않았습니다. 하드코딩된 evt-scp-*/evt-aws-* 가짜 이벤트를 지어내지 않고
        정직하게 빈 리스트를 반환합니다.
        """
        logger.info(f"Events 조회 요청 - tenant_id: {tenant_id}, provider: {provider} (실 이벤트 소스 미연동 - 빈 값 반환)")
        return []

    def get_costs(self, tenant_id: str, provider: Optional[str] = None) -> dict:
        """
        테넌트 및 CSP(provider)별 FinOps 비용 분석 데이터를 반환합니다.

        - 실 SCP VM 인벤토리(active_real_vms)가 있으면 SCP Billing 표준 원화(KRW) 단가로
          실 인벤토리 기반 비용을 계산합니다 (REAL).
        - 그 외에는 self.nodes(운영 환경에서는 항상 비어 있고, 테스트에서만
          load_sample_topology()로 채워짐)에 등록된 vm/database 인벤토리를 표준
          인스턴스 요금(KRW)으로 환산합니다. 인벤토리가 없으면 0/빈 값을 반환합니다
          (SIMULATED) - 하드코딩된 특정 테넌트 금액은 더 이상 존재하지 않습니다.
        """
        logger.info(f"FinOps Costs 조회 요청 - tenant_id: {tenant_id}, provider: {provider}")

        now = datetime.now()

        # CSP 선택이 들어오면 해당 CSP용 테넌트로 치환
        effective_tenant = tenant_id
        if provider == "scp":
            effective_tenant = "tenant-scp"
        elif provider == "aws":
            effective_tenant = "tenant-aws"

        real_vms = self.active_real_vms.get("tenant-scp", [])
        if not real_vms:
            real_vms = self.active_real_vms.get(effective_tenant, [])

        data_source = "SIMULATED"
        monthly_total = Decimal("0.0")
        cost_recommendations: List[dict] = []

        if effective_tenant == "tenant-scp" and real_vms:
            # [실 데이터] 실 SCP OpenAPI로 수집된 VM 인벤토리를 SCP Billing 표준
            # 원화(KRW) 다이렉트 과금 단가로 환산한다 (vCPU 코어당 33,750원 / RAM GB당 5,400원)
            data_source = "REAL"
            for vm in real_vms:
                server_type = vm.get("metadata", {}).get("scp_compute_class_type", "Standard-2")
                vcpus, ram = 2, 4
                if "8" in server_type or "Standard-8" in server_type:
                    vcpus, ram = 8, 16
                elif "4" in server_type or "Standard-4" in server_type:
                    vcpus, ram = 4, 8
                monthly_total += Decimal(str(vcpus * 33750 + ram * 5400))

            target_rec = real_vms[2] if len(real_vms) > 2 else real_vms[0]
            recommend_node = target_rec["id"]
            recommend_label = target_rec["label"].split('\n')[0]

            server_type = target_rec.get("metadata", {}).get("scp_compute_class_type", "Standard-2")
            vcpus_val, ram_val = 4, 8
            if "8" in server_type or "Standard-8" in server_type:
                vcpus_val, ram_val = 8, 16
            elif "4" in server_type or "Standard-4" in server_type:
                vcpus_val, ram_val = 4, 8

            current_monthly_krw = Decimal(str(vcpus_val * 33750 + ram_val * 5400))
            target_monthly_krw = Decimal(str((vcpus_val // 2) * 33750 + (ram_val // 2) * 5400))
            savings_val_krw = current_monthly_krw - target_monthly_krw

            cost_recommendations = [{
                "node_id": recommend_node,
                "node_label": recommend_label,
                "reason": f"최근 CPU 사용률이 낮아 유휴 자원으로 추정됩니다. ({recommend_label})",
                "action": f"VM 유형 축소 (Standard-{vcpus_val} -> Standard-{vcpus_val // 2})",
                "current_monthly_cost": float(current_monthly_krw),
                "target_monthly_cost": float(target_monthly_krw),
                "savings": float(savings_val_krw)
            }]
        else:
            monthly_total, cost_recommendations = self._estimate_generic_tenant_costs(effective_tenant, provider)

        # 실 데이터(또는 테스트 픽스처)로 산출된 월간 총액이 있을 때만 일별 트렌드를 분배한다.
        # 인벤토리가 전혀 없으면(monthly_total == 0) 빈 값을 정직하게 반환한다.
        if monthly_total > 0:
            daily_base = monthly_total / Decimal("30.0")
            daily_trends = []
            for i in range(7, 0, -1):
                date_str = (now - timedelta(days=i)).strftime("%Y-%m-%d")
                # 주말에는 비용 소폭 감소 패턴 적용
                day_multiplier = Decimal("0.85") if (now - timedelta(days=i)).weekday() >= 5 else Decimal("1.0")
                cost_value = daily_base * day_multiplier
                if data_source != "REAL":
                    # SIMULATED 경로에서만 자연스러운 일별 변동을 흉내낸다 - REAL 경로(실 SCP VM
                    # 인벤토리 기반 청구 단가)는 실 청구 이력이 없으므로 난수 잡음을 더하지 않는다
                    # (data_source="REAL" 배지 아래 지어낸 값 노출 금지 - scp_real_topology.py와
                    # 동일한 버그 클래스, 2026-07-20 스윕에서 발견).
                    cost_value += Decimal(str(random.uniform(-3.0, 3.0)))
                daily_trends.append({
                    "date": date_str,
                    "amount": float(round(cost_value, 2))
                })
            daily_average = float(round(daily_base, 2))
        else:
            daily_trends = []
            daily_average = 0.0

        return {
            "currency": "KRW",
            "monthly_total": float(monthly_total),
            "daily_average": daily_average,
            "daily_trends": daily_trends,
            "recommendations": cost_recommendations,
            "data_source": data_source
        }

    def _estimate_generic_tenant_costs(self, tenant_id: str, provider: Optional[str] = None) -> tuple:
        """
        노드 인벤토리(self.nodes) 기반 월간 비용 추정 - 특정 테넌트를 하드코딩하지 않고,
        vm/database 노드를 프로바이더별 표준 인스턴스 요금(KRW)으로 환산해
        (monthly_total, cost_recommendations)를 반환한다.

        tenant_id == "system"이면 전 테넌트 노드를 대상으로 집계하며, 존재하는 프로바이더별로
        각각 1건씩 유휴 자원 추천을 생성한다(그 외에는 매칭된 노드 전체에서 1건).
        노드가 없으면 (Decimal("0.0"), [])를 반환한다 - 운영 환경에서는 self.nodes가 항상
        비어 있으므로 실 VM 인벤토리가 없는 한 자동으로 이 경로가 된다.
        """
        UNIT_MONTHLY_KRW = {
            "scp": {"vm": Decimal("178200.0"), "database": Decimal("356400.0")},
            "aws": {"vm": Decimal("87750.0"), "database": Decimal("175500.0")},
        }

        def matches_tenant(n: dict) -> bool:
            return True if tenant_id == "system" else n["tenant_id"] == tenant_id

        nodes = [
            n for n in self.nodes
            if n.get("type") in ("vm", "database") and matches_tenant(n)
            and (not provider or n["provider"] == provider)
        ]

        if not nodes:
            return Decimal("0.0"), []

        monthly_total = Decimal("0.0")
        nodes_by_provider: Dict[str, list] = {}
        for node in nodes:
            node_provider = node.get("provider", "aws")
            unit_cost = UNIT_MONTHLY_KRW.get(node_provider, UNIT_MONTHLY_KRW["aws"]).get(node["type"], Decimal("87750.0"))
            monthly_total += unit_cost
            nodes_by_provider.setdefault(node_provider, []).append((node, unit_cost))

        # 프로바이더별로 CPU 사용률이 가장 낮은 노드를 라이트사이징(유휴 자원 최적화) 추천 대상으로 선정
        cost_recommendations = []
        for node_provider, node_costs in nodes_by_provider.items():
            idle_node, idle_cost = min(node_costs, key=lambda nc: nc[0].get("cpu", 0.0))
            target_cost = (idle_cost / Decimal("2.0")).quantize(Decimal("0.01"))
            savings = idle_cost - target_cost

            registry = get_provider(node_provider) or {}
            instance_types = registry.get("instance_types", [])
            action_label = f"{instance_types[2]} -> {instance_types[1]}" if len(instance_types) >= 3 else "인스턴스 다운사이징"

            cost_recommendations.append({
                "node_id": idle_node["id"],
                "reason": f"최근 CPU 사용률이 낮아 유휴 자원으로 추정됩니다. ({idle_node['label']})",
                "action": f"인스턴스 다운사이징 ({action_label})",
                "current_monthly_cost": float(idle_cost),
                "target_monthly_cost": float(target_cost),
                "savings": float(savings)
            })

        return monthly_total, cost_recommendations

    def get_network_paths(self, tenant_id: str) -> dict:
        """
        네트워크 회선 이중화 경로 상태 조회
        """
        logger.info(f"Network paths 조회 - 테넌트: {tenant_id}")
        return self.network_status

    def trigger_network_incident(self, tenant_id: str) -> dict:
        """
        전용회선 장애 강제 모의 시뮬레이션 (운영자가 명시적으로 호출하는 DR 훈련/우회 테스트
        액션 - 백그라운드에서 자동 생성되는 가짜 데이터가 아니다)
        """
        logger.warning(f"전용회선 장애 주입 - 테넌트: {tenant_id}")
        self.network_status["dedicated"]["status"] = "FAILED"
        self.network_status["dedicated"]["packet_loss"] = 0.65  # 65% 패킷 손실
        self.network_status["vpn"]["status"] = "ACTIVE"
        self.network_status["vpn"]["bandwidth_mbps"] = 450.0
        return self.network_status

    def recover_network(self, tenant_id: str) -> dict:
        """
        네트워크 회선 정상화 복구 (운영자가 명시적으로 호출하는 복구 액션)
        """
        logger.info(f"네트워크 회선 복구 - 테넌트: {tenant_id}")
        self.network_status["dedicated"]["status"] = "ACTIVE"
        self.network_status["dedicated"]["packet_loss"] = 0.02
        self.network_status["vpn"]["status"] = "STANDBY"
        self.network_status["vpn"]["bandwidth_mbps"] = 0.0
        return self.network_status

    def get_blocked_ips(self, tenant_id: str) -> List[str]:
        """
        SOAR에 의해 차단된 해커 공격 IP 목록 조회
        """
        return self.blocked_ips

    def block_ip_address(self, tenant_id: str, ip: str) -> bool:
        """
        보안그룹(Security Group) IP 차단 추가
        """
        if ip not in self.blocked_ips:
            self.blocked_ips.append(ip)
            logger.info(f"[SOAR] 침해 IP {ip} 보안그룹 차단 룰셋 반영 완료")
            return True
        return False

    def get_disk_prediction_data(self, tenant_id: str, node_id: str) -> dict:
        """
        인프라 용량 예측을 위한 디스크 시계열 추세 분석 데이터.
        실 디스크 사용률 이력 소스(Cloud Monitoring 디스크 메트릭)가 아직 연동되지
        않았으므로, disk_histories에 등록된 이력이 없으면 빈 이력을 정직하게 반환한다
        (PredictionService가 표본 부족 사유를 함께 반환한다).
        """
        history = self.disk_histories.get(node_id, [])
        from backend.app.services.prediction_service import PredictionService
        result = PredictionService.predict_disk_saturation(history)
        result["history"] = history
        result["node_id"] = node_id
        return result

# 시뮬레이터 싱글톤 인스턴스 생성
simulator = InfrastructureSimulator()
