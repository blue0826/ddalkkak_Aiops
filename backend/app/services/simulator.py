import random
import math
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from loguru import logger
from decimal import Decimal

class InfrastructureSimulator:
    def __init__(self):
        # AIOps 4단계 고도화 가상 상태 보존
        self.active_real_vms = {}  # 실 SCP OpenAPI 연동 시 수집된 실제 VM 정보 캐시
        self.blocked_ips = ["103.95.220.12", "185.220.101.5"]  # 침해 자동 차단 리스트
        self.network_status = {
            "dedicated": {"status": "ACTIVE", "packet_loss": 0.02, "bandwidth_mbps": 850.0},
            "vpn": {"status": "STANDBY", "packet_loss": 0.0, "bandwidth_mbps": 0.0}
        }
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

    def get_topology(self, tenant_id: str, provider: Optional[str] = None) -> dict:
        """
        테넌트 ID 및 CSP(provider)에 해당하는 토폴로지 노드 및 링크 정보를 반환합니다.
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
        특정 노드의 시계열 메트릭(CPU, Memory, Network) 데이터를 자연스러운 사인파 곡선 + 노이즈로 생성하여 반환합니다.
        실서버 연동 시 가상 ID 요청을 수집된 실제 VM의 지표로 100% 융합(Sync) 매핑합니다.
        """
        logger.info(f"Metrics 조회 - tenant_id: {tenant_id}, node_id: {node_id}, metric_name: {metric_name}")
        
        real_vms = self.active_real_vms.get(tenant_id, [])
        all_nodes = self.nodes + real_vms
        
        # 만약 클라이언트가 옛날 가짜 ID(scp-vm- 등)로 메트릭을 요청했고 실서버 연동 중이라면,
        # 실서버 VM 중 하나에 매칭되게 치환 처리
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

        # 실제 수집된 VM의 상태에 비례한 베이스 값 갱신
        base_value = float(target_node.get(metric_name, 45.0))
        if target_node["status"] == "warning":
            base_value = 85.0
        points = []
        now = datetime.now()
        
        for i in range(minutes, 0, -1):
            time_point = now - timedelta(minutes=i)
            # 사인파를 활용하여 시간대별 자연스러운 부하 변동 시뮬레이션
            sine_wave = math.sin(time_point.timestamp() / 600) * 10
            noise = random.uniform(-3, 3)
            value = max(0.0, min(100.0, base_value + sine_wave + noise))
            
            # warning 상태의 노드인 경우 높은 CPU 유지 시뮬레이션
            if target_node["status"] == "warning" and metric_name == "cpu":
                value = max(85.0, min(99.0, value + 35.0))
                
            points.append({
                "timestamp": time_point.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "value": round(value, 2)
            })
        return points

    def get_logs(self, tenant_id: str, limit: int = 50, provider: Optional[str] = None) -> List[dict]:
        """
        테넌트 소유 자원들의 가상 로그 스트림을 생성하여 반환합니다.
        """
        logger.info(f"Logs 조회 요청 - tenant_id: {tenant_id}, provider: {provider}")
        
        real_vms = self.active_real_vms.get(tenant_id, [])
        if real_vms and (provider == "scp" or tenant_id == "tenant-scp"):
            # 기존 가짜 vm 노드들은 로그 생성 풀에서 전량 제외하고 실제 SCP VM 노드만 포함시킴
            base_nodes = [node for node in self.nodes if node["tenant_id"] == tenant_id and node["type"] != "vm" and "scp-vm-" not in node["id"]]
            tenant_nodes = base_nodes + real_vms
        else:
            tenant_nodes = [node for node in self.nodes if tenant_id == "system" or node["tenant_id"] == tenant_id]
            if provider:
                tenant_nodes = [node for node in tenant_nodes if node["provider"] == provider]
            
        if not tenant_nodes:
            return []

        log_templates = {
            "vm": [
                ("[INFO] SCP WebServer Access Log: 200 OK GET /api/v1/health", "info"),
                ("[INFO] Connection established from gateway", "info"),
                ("[WARNING] High CPU usage detected on web worker", "warning"),
                ("[ERROR] Disk space low on partition /dev/xvda1 (88% used)", "error")
            ],
            "database": [
                ("[INFO] Database connection pool initialized", "info"),
                ("[INFO] Slow query detected: SELECT * FROM audit_logs WHERE...", "warning"),
                ("[ERROR] Connection timeout waiting for client lock", "error")
            ],
            "loadbalancer": [
                ("[INFO] SCP LoadBalancer health check passed for target group", "info"),
                ("[WARNING] Transient 502 Bad Gateway observed for client IP", "warning")
            ]
        }

        logs = []
        now = datetime.now()
        
        for i in range(limit):
            node = random.choice(tenant_nodes)
            node_type = node["type"]
            templates = log_templates.get(node_type, [("[INFO] System maintenance check completed", "info")])
            message, level = random.choice(templates)
            
            # warning 상태의 노드는 더 자주 경고/에러 로그 노출
            if node["status"] == "warning":
                level = random.choice(["warning", "error"])
                message = f"[{level.upper()}] Node health check degraded: high CPU state persisting."

            log_time = now - timedelta(seconds=i * 15 + random.randint(1, 10))
            logs.append({
                "timestamp": log_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "node_id": node["id"],
                "node_label": node["label"],
                "provider": node["provider"],
                "message": f"{node['label']} - {message}",
                "level": level
            })
            
        return sorted(logs, key=lambda x: x["timestamp"], reverse=True)

    def get_events(self, tenant_id: str, provider: Optional[str] = None) -> List[dict]:
        """
        테넌트 소유 자원 및 CSP(provider)에 해당하는 알람 이상 탐지 이벤트 목록을 반환합니다.
        """
        logger.info(f"Events 조회 요청 - tenant_id: {tenant_id}, provider: {provider}")
        
        events = []
        now = datetime.now()
        
        real_vms = self.active_real_vms.get("tenant-scp", [])
        if not real_vms:
            real_vms = self.active_real_vms.get(tenant_id, [])
            
        active_target_node_id = "scp-vm-app-01"
        active_target_node_label = "VM-App-01"
        
        if real_vms:
            # 실서버 연동 시 수집된 warning 상태의 노드 또는 1번째 노드를 장애 노드로 매핑
            warn_vm = next((v for v in real_vms if v.get("status") == "warning"), real_vms[0])
            active_target_node_id = warn_vm["id"]
            active_target_node_label = warn_vm["label"].split('\n')[0]
            
        # SCP 테넌트 경보 시뮬레이션
        if (tenant_id == "tenant-scp" or tenant_id == "system") and (not provider or provider == "scp"):
            events.append({
                "id": "evt-scp-01",
                "title": f"SCP {active_target_node_label} 임계치 초과 (CPU)",
                "description": f"{active_target_node_label} 노드의 CPU 사용률이 5분 이상 90%를 초과하였습니다.",
                "severity": "CRITICAL",
                "status": "active",
                "node_id": active_target_node_id,
                "provider": "scp",
                "tenant_id": "tenant-scp",
                "created_at": (now - timedelta(minutes=15)).strftime("%Y-%m-%dT%H:%M:%SZ")
            })
            events.append({
                "id": "evt-scp-02",
                "title": "DB MariaDB Slow Query 탐지",
                "description": "MariaDB-Prod 슬로우 쿼리가 지속적으로 인입되고 있습니다. (처리 시간 > 2.5s)",
                "severity": "WARNING",
                "status": "active",
                "node_id": "scp-db-maria-01",
                "provider": "scp",
                "tenant_id": "tenant-scp",
                "created_at": (now - timedelta(hours=1, minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
            })

        # AWS 테넌트 경보 시뮬레이션
        if (tenant_id == "tenant-aws" or tenant_id == "system") and (not provider or provider == "aws"):
            events.append({
                "id": "evt-aws-01",
                "title": "SCP VM 메모리 상승 경보",
                "description": "scp-external-app-01 노드의 메모리 사용량이 70%에 진입하였습니다.",
                "severity": "WARNING",
                "status": "resolved",
                "node_id": "aws-ec2-app-01",
                "provider": "aws",
                "tenant_id": "tenant-aws",
                "created_at": (now - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
            })
            
        return events

    def get_costs(self, tenant_id: str, provider: Optional[str] = None) -> dict:
        """
        테넌트 및 CSP(provider)별 FinOps 비용 분석 데이터를 반환합니다.
        """
        logger.info(f"FinOps Costs 조회 요청 - tenant_id: {tenant_id}, provider: {provider}")
        
        now = datetime.now()
        
        # CSP 선택이 들어오면 해당 CSP용 가상 테넌트 비용 데이터로 치환
        effective_tenant = tenant_id
        if provider == "scp":
            effective_tenant = "tenant-scp"
        elif provider == "aws":
            effective_tenant = "tenant-aws"
            
        if effective_tenant == "tenant-scp":
            # 실제 tenant-scp 키로 캐싱된 VM 조회
            real_vms = self.active_real_vms.get("tenant-scp", [])
            if not real_vms:
                real_vms = self.active_real_vms.get(tenant_id, [])
                
            # [SCP Billing 표준 원화(KRW) 다이렉트 과금 단가 적용]
            # SCP 가상서버 기본 단가: vCPU 코어당 ₩33,750 / RAM GB당 ₩5,400 기준
            monthly_total = Decimal("0.0")
            recommend_node = "scp-vm-app-02"
            recommend_label = "VM-App-02"
            vcpus_val = 4
            ram_val = 8
            
            if real_vms:
                for vm in real_vms:
                    server_type = vm.get("metadata", {}).get("scp_compute_class_type", "Standard-2")
                    vcpus = 2
                    ram = 4
                    if "8" in server_type or "Standard-8" in server_type:
                        vcpus = 8
                        ram = 16
                    elif "4" in server_type or "Standard-4" in server_type:
                        vcpus = 4
                        ram = 8
                    
                    # 순수 원화 요금 직접 계산 누적
                    monthly_total += Decimal(str(vcpus * 33750 + ram * 5400))
                
                target_rec = real_vms[2] if len(real_vms) > 2 else real_vms[0]
                recommend_node = target_rec["id"]
                recommend_label = target_rec["label"].split('\n')[0]
                
                server_type = target_rec.get("metadata", {}).get("scp_compute_class_type", "Standard-2")
                if "8" in server_type or "Standard-8" in server_type:
                    vcpus_val = 8
                    ram_val = 16
                elif "4" in server_type or "Standard-4" in server_type:
                    vcpus_val = 4
                    ram_val = 8
            else:
                # 가상 노드 시뮬레이션 기본 요금 (₩1,831,275)
                monthly_total = Decimal("1831275.0")
                
            current_monthly_krw = Decimal(str(vcpus_val * 33750 + ram_val * 5400))
            target_monthly_krw = Decimal(str((vcpus_val // 2) * 33750 + (ram_val // 2) * 5400))
            savings_val_krw = current_monthly_krw - target_monthly_krw
            
            cost_recommendations = [
                {
                    "node_id": recommend_node,
                    "node_label": recommend_label,
                    "reason": f"최근 14일간 CPU 평균 사용률 3.2% 미만으로 유휴 자원 낭비 중입니다. ({recommend_label})",
                    "action": f"VM 유형 축소 (Standard-{vcpus_val} -> Standard-{vcpus_val//2})",
                    "current_monthly_cost": float(current_monthly_krw),
                    "target_monthly_cost": float(target_monthly_krw),
                    "savings": float(savings_val_krw)
                }
            ]
            daily_base = monthly_total / Decimal("30.0")
            
        elif tenant_id == "tenant-aws":
            cost_recommendations = [
                {
                    "node_id": "aws-ec2-web-02",
                    "reason": "최근 30일간 자원 유휴 상태가 지속됨.",
                    "action": "EC2 인스턴스 중단 또는 라이트사이징(t3.medium -> t3.micro)",
                    "current_monthly_cost": 87750.0,
                    "target_monthly_cost": 21937.5,
                    "savings": 65812.5
                }
            ]
            daily_base = Decimal("119812.5")
            monthly_total = Decimal("3594375.0")
            
        else: # system (전체 취합)
            cost_recommendations = [
                {
                    "node_id": "scp-vm-app-02",
                    "reason": "오버 프로비저닝 상태 (CPU < 5%)",
                    "action": "VM Downsizing (Standard-D4s v3 -> Standard-D2s v3)",
                    "current_monthly_cost": 202500.0,
                    "target_monthly_cost": 101250.0,
                    "savings": 101250.0
                },
                {
                    "node_id": "aws-ec2-web-02",
                    "reason": "최근 30일간 자원 유휴 상태 지속",
                    "action": "EC2 인스턴스 중단 또는 라이트사이징",
                    "current_monthly_cost": 87750.0,
                    "target_monthly_cost": 21937.5,
                    "savings": 65812.5
                }
            ]
            daily_base = Decimal("180832.5")
            monthly_total = Decimal("5425650.0")

        # 최근 7일간의 비용 트렌드 생성
        daily_trends = []
        for i in range(7, 0, -1):
            date_str = (now - timedelta(days=i)).strftime("%Y-%m-%d")
            # 주말에는 비용 소폭 감소 패턴 적용
            day_multiplier = Decimal("0.85") if (now - timedelta(days=i)).weekday() >= 5 else Decimal("1.0")
            cost_value = daily_base * day_multiplier + Decimal(str(random.uniform(-3.0, 3.0)))
            daily_trends.append({
                "date": date_str,
                "amount": float(round(cost_value, 2))
            })

        return {
            "currency": "KRW",
            "monthly_total": float(monthly_total),
            "daily_average": float(round(daily_base, 2)),
            "daily_trends": daily_trends,
            "recommendations": cost_recommendations
        }

    def get_network_paths(self, tenant_id: str) -> dict:
        """
        네트워크 회선 이중화 경로 상태 조회
        """
        logger.info(f"Network paths 조회 - 테넌트: {tenant_id}")
        return self.network_status

    def trigger_network_incident(self, tenant_id: str) -> dict:
        """
        전용회선 장애 강제 모의 시뮬레이션
        """
        logger.warning(f"전용회선 장애 주입 - 테넌트: {tenant_id}")
        self.network_status["dedicated"]["status"] = "FAILED"
        self.network_status["dedicated"]["packet_loss"] = 0.65  # 65% 패킷 손실
        self.network_status["vpn"]["status"] = "ACTIVE"
        self.network_status["vpn"]["bandwidth_mbps"] = 450.0
        return self.network_status

    def recover_network(self, tenant_id: str) -> dict:
        """
        네트워크 회선 정상화 복구 시뮬레이션
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
        인프라 용량 예측을 위한 디스크 시계열 추세 분석 데이터
        """
        real_vms = self.active_real_vms.get(tenant_id, [])
        is_real_vm = any(v["id"] == node_id for v in real_vms)
        
        if is_real_vm:
            # 실시간 수집된 실제 가상서버에 대한 디스크 포화 위험 경보(15일 내 임계) 시뮬레이션
            history = [70.5, 72.8, 75.2, 77.8, 80.5, 83.1, 85.8]
        else:
            history = self.disk_histories.get(node_id, [30.0, 30.5, 31.0, 31.5, 32.0, 32.5, 33.0])
            
        from backend.app.services.prediction_service import PredictionService
        result = PredictionService.predict_disk_saturation(history)
        result["history"] = history
        result["node_id"] = node_id
        return result

# 시뮬레이터 싱글톤 인스턴스 생성
simulator = InfrastructureSimulator()
