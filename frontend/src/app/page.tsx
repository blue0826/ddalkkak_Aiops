'use client';

import { useState, useEffect, useRef } from 'react';

// API 연동 기본 주소
const BACKEND_URL = 'http://127.0.0.1:8000/api/v1';

// ----------------------------------------------------
// [물리엔진 토폴로지 컴포넌트 - Obsidian 스타일 Force-Directed Graph]
// ----------------------------------------------------

// 🌲 계층형 자원 트리 뷰 (Hierarchical Asset Tree View) 컴포넌트
function HierarchicalTreeView({ topology, activeCsp, selectedNode, onSelectNode }: { topology: any; activeCsp: string; selectedNode: string; onSelectNode: (id: string) => void }) {
  if (!topology || !topology.nodes || topology.nodes.length === 0) {
    return (
      <div className="h-[500px] flex items-center justify-center text-slate-500 font-mono text-xs">
        [INFO] No topology resource data to display.
      </div>
    );
  }

  // 1. 해당 CSP의 노드와 링크 추출
  const vms = topology.nodes.filter((n: any) => n.type === 'vm' && n.provider === activeCsp);
  
  // 2. 서브넷별 자원 그룹화
  const subnetGroups: Record<string, any[]> = {};
  vms.forEach((vm: any) => {
    const subName = vm.subnet || 'Unknown Subnet';
    if (!subnetGroups[subName]) subnetGroups[subName] = [];
    subnetGroups[subName].push(vm);
  });

  const regionName = activeCsp === 'scp' ? 'Seoul Region [kr-west1]' : 'Seoul Region [ap-northeast-2]';
  const vpcName = activeCsp === 'scp' ? 'VPC: vpc-01 (a491cecd-e55a-45dc-921c-cb6edb016e53)' : 'VPC: vpc-aws-main (10.0.0.0/16)';

  return (
    <div className="h-[500px] overflow-y-auto bg-slate-950/60 border border-slate-800 rounded p-6 font-mono text-xs text-slate-300 space-y-4">
      {/* 🗺️ Region Level */}
      <div className="border-l-2 border-sky-500/30 pl-4 space-y-3">
        <div className="flex items-center gap-2 text-sky-400 font-bold text-[13px]">
          <span>🗺️</span> Region: {regionName}
        </div>

        {/* 🔌 VPC Level */}
        <div className="border-l-2 border-emerald-500/30 pl-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-[12px]">
            <span>🔌</span> {vpcName}
          </div>

          {/* 📂 Subnets Level */}
          {Object.keys(subnetGroups).length === 0 ? (
            <div className="text-slate-500 pl-4">[No subnets and VMs registered]</div>
          ) : (
            Object.entries(subnetGroups).map(([subName, list]) => {
              const isPublic = subName.toLowerCase().includes('public');
              return (
                <div key={subName} className="border-l-2 border-slate-700/50 pl-4 space-y-2">
                  <div className="flex items-center gap-2 text-slate-200 font-semibold">
                    <span>{isPublic ? '🟢' : '🔒'}</span> 
                    Subnet: {subName} 
                    <span className="text-[10px] text-slate-500">({list.length} VMs)</span>
                  </div>

                  {/* 🖥️ VMs Level */}
                  <div className="grid grid-cols-2 gap-3 pl-4">
                    {list.map((vm: any) => {
                      const isSelected = selectedNode === vm.id;
                      const isWarning = vm.status === 'warning';
                      const ipMatch = vm.label ? vm.label.match(/\(([^)]+)\)/) : null;
                      const ip = ipMatch ? ipMatch[1] : 'N/A';

                      return (
                        <div
                          key={vm.id}
                          onClick={() => onSelectNode(vm.id)}
                          className={`p-3 rounded border transition-all cursor-pointer flex justify-between items-center ${
                            isSelected 
                              ? 'bg-amber-950/20 border-amber-500' 
                              : isWarning 
                                ? 'bg-red-950/10 border-red-500/40 hover:bg-red-950/20' 
                                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="font-bold flex items-center gap-1.5 text-slate-100">
                              <span>🖥️</span> {vm.label.split('\n')[0]}
                            </div>
                            <div className="text-[10px] text-slate-500">IP: {ip}</div>
                          </div>
                          
                          <div className="text-right space-y-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              isWarning ? 'bg-red-600/20 text-red-400' : 'bg-green-600/20 text-green-400'
                            }`}>
                              {vm.status === 'warning' ? 'WARN' : 'ACTIVE'}
                            </span>
                            <div className="text-[9px] text-slate-400">
                              CPU: {vm.cpu}% | MEM: {vm.memory}%
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function ForceTopology({ topology, selectedNode, onSelectNode, activeCsp }: { topology: any; selectedNode: string; onSelectNode: (id: string) => void; activeCsp: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // 물리 시뮬레이션용 로컬 노드/링크 상태 복제본
  const nodesRef = useRef<any[]>([]);
  const linksRef = useRef<any[]>([]);
  
  // 마우스 조작 관련 상태
  const draggingNode = useRef<any>(null);
  const zoom = useRef<number>(1.0);
  const offset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPanning = useRef<boolean>(false);
  const startPan = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const mousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 1. 브라우저 크기 변경 시 캔버스 너비를 부모 요소의 100%로 동적 확장
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleResize = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = 500; // 높이도 500px로 시원하게 확대
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 2. 백엔드에서 받아온 토폴로지 노드가 변경될 때 물리 시뮬레이션 노드 위치 초기화
  useEffect(() => {
    if (!topology || !topology.nodes || topology.nodes.length === 0) return;
    
    const canvas = canvasRef.current;
    const canvasW = canvas ? canvas.width : 940;
    const canvasH = canvas ? canvas.height : 500;
    const zoneW = (canvasW / 2) - 60;
    const awsX = (canvasW / 2) + 20;

    // 이전 위치 정보를 유지하기 위해 매핑 처리
    const prevNodesMap = new Map(nodesRef.current.map(n => [n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }]));
    
    // 계층형 레이아웃: 노드 타입에 따라 Y 레이어 고정 (인터넷→방화벽→LB→Public→Private→DB)
    const LAYER_Y: Record<string, number> = {
      internet:   0.06,
      igw:        0.14,
      waf:        0.14,
      firewall:   0.14,
      nat:        0.24,
      lb:         0.24,
      loadbalancer: 0.24,
      subnet_pub: 0.36,
      subnet:     0.36,
      public:     0.36,
      vm:         0.52,
      instance:   0.52,
      nas:        0.52,
      object_storage: 0.68,
      backup:     0.68,
      db:         0.82,
      database:   0.82,
    };

    // 같은 레이어의 노드들을 수평으로 균등 분배
    const layerCounts: Record<number, number> = {};
    const layerIndices: Record<number, number> = {};
    const nodeLayerY = topology.nodes.map((node: any) => {
      const typeKey = (node.type || '').toLowerCase();
      const tierKey = (node.tier || '').toLowerCase();
      let ly = 0.50;
      // tier 필드로 vm 계층 세분화: web→Public층, app→App층, db→DB층
      if (typeKey === 'vm' || typeKey === 'instance') {
        if (tierKey === 'web') ly = 0.44;
        else if (tierKey === 'db') ly = 0.82;
        else ly = 0.60;  // app (기본)
      } else {
        for (const [k, v] of Object.entries(LAYER_Y)) {
          if (typeKey.includes(k)) { ly = v; break; }
        }
      }
      const layerKey = Math.round(ly * 100);
      layerCounts[layerKey] = (layerCounts[layerKey] || 0) + 1;
      return ly;
    });

    nodesRef.current = topology.nodes.map((node: any, idx: number) => {
      const prev = prevNodesMap.get(node.id);
      const ly = nodeLayerY[idx];
      const layerKey = Math.round(ly * 100);
      if (layerIndices[layerKey] === undefined) layerIndices[layerKey] = 0;
      const posInLayer = layerIndices[layerKey]++;
      const totalInLayer = layerCounts[layerKey] || 1;

      // activeCsp 단독 뷰일 경우 화면 가로 영역 전체 활용
      const isAws = node.provider === 'aws';
      const isScpOnly = activeCsp === 'scp';
      const isAwsOnly = activeCsp === 'aws';
      
      let startX = 30;
      let widthForLayer = canvasW - 80;
      
      if (!isScpOnly && !isAwsOnly) {
        // 복합 뷰 (반반 분할)
        const halfW = canvasW / 2 - 40;
        startX = isAws ? canvasW / 2 + 20 : 30;
        widthForLayer = halfW;
      }
      
      const spacing = Math.min(widthForLayer / (totalInLayer + 1), 180);
      const defaultX = startX + (posInLayer + 1) * spacing;
      const defaultY = ly * canvasH;

      return {
        ...node,
        x: prev ? prev.x : defaultX,
        y: prev ? prev.y : defaultY,
        vx: prev ? prev.vx : 0,
        vy: prev ? prev.vy : 0,
        _layerY: ly,  // 레이어 Y 고정값 (물리 연산에서 Y축 인력에 활용)
      };
    });
    
    linksRef.current = topology.links;
  }, [topology, activeCsp]);

  // 2. Canvas 마우스 이벤트 핸들러 조립
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    // 캔버스 내 마우스 좌표 (Offset 및 Zoom 보정치 반영)
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    const worldX = (clientX - offset.current.x) / zoom.current;
    const worldY = (clientY - offset.current.y) / zoom.current;
    
    // 마우스 클릭 위치에 노드가 있는지 검사 (반지름 14px 한도)
    const clickedNode = nodesRef.current.find(n => {
      const dx = n.x - worldX;
      const dy = n.y - worldY;
      return Math.sqrt(dx * dx + dy * dy) < 16;
    });

    if (clickedNode) {
      // 노드 드래그 시작
      draggingNode.current = clickedNode;
      onSelectNode(clickedNode.id);
    } else {
      // 화면 드래그 이동 (Pan) 시작
      isPanning.current = true;
      startPan.current = { x: clientX - offset.current.x, y: clientY - offset.current.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    mousePos.current = { x: clientX, y: clientY };

    if (draggingNode.current) {
      // 드래그 중인 노드 좌표 강제 갱신
      draggingNode.current.x = (clientX - offset.current.x) / zoom.current;
      draggingNode.current.y = (clientY - offset.current.y) / zoom.current;
      draggingNode.current.vx = 0;
      draggingNode.current.vy = 0;
    } else if (isPanning.current) {
      // 화면 전체 패닝 적용
      offset.current = {
        x: clientX - startPan.current.x,
        y: clientY - startPan.current.y
      };
    }
  };

  const handleMouseUp = () => {
    draggingNode.current = null;
    isPanning.current = false;
  };

  // 3. 60FPS 애니메이션 루프 (물리 엔진 연산 & 캔버스 드로잉) + Passive가 아닌 마우스 휠 이벤트 강제 바인딩
  useEffect(() => {
    let animId: number;
    const canvasEl = canvasRef.current;

    const onWheelRaw = (e: WheelEvent) => {
      e.preventDefault();
      const scaleFactor = 1.08;
      if (!canvasEl) return;
      
      const rect = canvasEl.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const clientY = e.clientY - rect.top;
      
      const mouseWorldX = (clientX - offset.current.x) / zoom.current;
      const mouseWorldY = (clientY - offset.current.y) / zoom.current;
      
      if (e.deltaY < 0) {
        zoom.current = Math.min(zoom.current * scaleFactor, 3.0);
      } else {
        zoom.current = Math.max(zoom.current / scaleFactor, 0.4);
      }
      
      offset.current = {
        x: clientX - mouseWorldX * zoom.current,
        y: clientY - mouseWorldY * zoom.current
      };
    };

    if (canvasEl) {
      canvasEl.addEventListener('wheel', onWheelRaw, { passive: false });
    }
    
    const runPhysicsAndDraw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animId = requestAnimationFrame(runPhysicsAndDraw);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animId = requestAnimationFrame(runPhysicsAndDraw);
        return;
      }

      const nodes = nodesRef.current;
      const links = linksRef.current;

      // ------------------------------------------------
      // [정적 아키텍처 격자형 레이아웃 정렬 - 물리엔진 제거]
      // ------------------------------------------------
      
      // ------------------------------------------------
      // [계층 구속형 탄성 물리 연산 - 유연한 배치 & 있어보이는 무브먼트]
      // ------------------------------------------------
      
      const canvasW = canvas.width;
      const canvasH = canvas.height;

      // A. 노드 간 척력 복원 & 강력한 수평 충돌 회피 (글자 겹침 방지)
      for (let i = 0; i < nodes.length; i++) {
        const n1 = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 1) dist = 1;
          
          // 척력을 6500으로 대폭 늘려 가로 간격 확보
          let force = 6500 / (dist * dist);
          
          // 두 노드가 가로로 90px 이하로 너무 가까우면 강력한 밀어내기 강제 적용 (Anti-Overlap)
          if (Math.abs(dx) < 95 && Math.abs(dy) < 50) {
            force += (95 - Math.abs(dx)) * 0.25;
          }

          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force * 0.3; // Y축은 계층 고정을 위해 밀어내기 힘을 억제
          
          if (n1 !== draggingNode.current) {
            n1.vx -= fx;
            n1.vy -= fy;
          }
          if (n2 !== draggingNode.current) {
            n2.vx += fx;
            n2.vy += fy;
          }
        }
      }

      // B. 흐름 링크 장력 복원 (Parent-Child 링크는 제외하고 논리 흐름만 장력 부여)
      links.forEach(link => {
        if (link.type === 'parent_child') return;
        const n1 = nodes.find(n => n.id === link.source);
        const n2 = nodes.find(n => n.id === link.target);
        if (n1 && n2) {
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 1) return;
          
          const restLength = 110;
          const k = 0.035;
          const force = k * (dist - restLength);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          
          if (n1 !== draggingNode.current) {
            n1.vx += fx;
            n1.vy += fy;
          }
          if (n2 !== draggingNode.current) {
            n2.vx -= fx;
            n2.vy -= fy;
          }
        }
      });

      // C. Y축 계층 구속력 및 X축 센터링 강제 주입
      nodes.forEach(n => {
        if (n === draggingNode.current) return;

        const typeKey = (n.type || '').toLowerCase();
        let targetY = canvasH / 2;
        let targetX = canvasW / 2;

        // 1) Y축 타겟 설정 (계층 구조)
        if (typeKey === 'vm' || typeKey === 'instance') {
          const tier = (n.tier || 'app').toLowerCase();
          if (tier === 'web') targetY = 155;
          else if (tier === 'db') targetY = 410;
          else targetY = 290;
        } else {
          if (n.id.includes('subnet-pub')) targetY = 105;
          else if (n.id.includes('subnet-priv')) targetY = 245;
          else if (n.id.includes('vpc')) targetY = 65;
          else targetY = 45;
        }

        // 2) X축 타겟 설정
        if (n.id.includes('subnet-pub') || n.id.includes('subnet-priv') || n.id.includes('vpc')) {
          targetX = 65; // 기저 컨테이너 노드들은 좌측 구석에 고정 배치
        } else if (n.id.includes('internet')) {
          targetX = canvasW / 2;
        } else if (n.id.includes('igw') || n.id.includes('waf') || n.id.includes('firewall')) {
          targetX = canvasW / 2 - 120;
        } else if (n.id.includes('nat') || n.id.includes('lb')) {
          targetX = canvasW / 2 + 120;
        } else {
          targetX = canvasW / 2;
        }

        // Y축 복원 가속 (고무줄 탄성 효과)
        n.vy += (targetY - n.y) * 0.045;
        // X축 완만한 중심 수렴력
        n.vx += (targetX - n.x) * 0.005;
      });

      // D. 물리 상태 적용 및 Damping 감쇠 연산 (부드러운 잔진동 정지)
      nodes.forEach(n => {
        if (n !== draggingNode.current) {
          n.x += n.vx;
          n.y += n.vy;
          n.vx *= 0.72; // 빠른 복원 감쇠율 적용
          n.vy *= 0.72;

          // 바운더리 탈출 클램핑
          const margin = 20;
          if (n.x < margin) { n.x = margin; n.vx = 0; }
          if (n.x > canvasW - margin) { n.x = canvasW - margin; n.vx = 0; }
          if (n.y < margin) { n.y = margin; n.vy = 0; }
          if (n.y > canvasH - margin) { n.y = canvasH - margin; n.vy = 0; }
        }
      });

      // ------------------------------------------------
      // [렌더링 드로잉 - Obsidian / AWS 테마 그래픽스]
      // ------------------------------------------------
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      
      // 줌 및 화면 이동 매트릭스 적용
      ctx.translate(offset.current.x, offset.current.y);
      ctx.scale(zoom.current, zoom.current);

      // 모눈 격자선 드로잉 (Obsidian 관계 맵 느낌 부여)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = -1000; x < 2000; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, -1000); ctx.lineTo(x, 1500); ctx.stroke();
      }
      for (let y = -1000; y < 1500; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(-1000, y); ctx.lineTo(2000, y); ctx.stroke();
      }

      // 클라우드 아키텍처 논리 다이어그램 구역 배경 드로잉 (박스 구조화)
      const cW = canvas.width;
      const cH = canvas.height;

      if (activeCsp === 'scp') {
        // --- 1. [SCP 전용 뷰] 아키텍처 박스 모델 ---
        // A. Region Box
        ctx.strokeStyle = 'rgba(56, 139, 253, 0.25)';
        ctx.fillStyle = 'rgba(13, 17, 23, 0.2)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(20, 20, cW - 40, cH - 40);
        ctx.fillRect(20, 20, cW - 40, cH - 40);
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(88, 166, 255, 0.6)';
        ctx.font = 'bold 10px "Fira Code", monospace';
        ctx.fillText("Region: Samsung SCP [kr-west1] (Seoul)", 35, 38);

        // B. VPC Box (중간 영역)
        ctx.strokeStyle = 'rgba(88, 166, 255, 0.15)';
        ctx.fillStyle = 'rgba(30, 41, 59, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(35, 55, cW - 70, cH - 90);
        ctx.fillRect(35, 55, cW - 70, cH - 90);

        ctx.fillStyle = 'rgba(142, 152, 182, 0.5)';
        ctx.fillText("VPC: vpc-01 (a491cecd-e55a-45dc-921c-cb6edb016e53)", 50, 72);

        // C. Subnets (수직/수평 계층화)
        // Public Subnet Box (DMZ / Web)
        const subH = (cH - 160) / 2;
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.12)';
        ctx.fillStyle = 'rgba(34, 197, 94, 0.02)';
        ctx.strokeRect(50, 95, cW - 100, subH);
        ctx.fillRect(50, 95, cW - 100, subH);
        ctx.fillStyle = 'rgba(34, 197, 94, 0.45)';
        ctx.fillText("Public Subnet: tfPublicmonos [192.168.0.0/24] (Web Tier / Bastion)", 65, 112);

        // Private Subnet Box (App / DB)
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.12)';
        ctx.fillStyle = 'rgba(239, 68, 68, 0.02)';
        ctx.strokeRect(50, 115 + subH, cW - 100, subH);
        ctx.fillRect(50, 115 + subH, cW - 100, subH);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
        ctx.fillText("Private Subnet: tfPrivatemonos [192.168.100.0/24] (App & DB Tier)", 65, 132 + subH);

      } else if (activeCsp === 'aws') {
        // --- 2. [AWS 전용 뷰] 아키텍처 박스 모델 ---
        ctx.strokeStyle = 'rgba(255, 153, 0, 0.25)';
        ctx.fillStyle = 'rgba(13, 17, 23, 0.2)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(20, 20, cW - 40, cH - 40);
        ctx.fillRect(20, 20, cW - 40, cH - 40);
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(255, 153, 0, 0.6)';
        ctx.font = 'bold 10px "Fira Code", monospace';
        ctx.fillText("Region: AWS Asia-Pacific [ap-northeast-2] (Seoul)", 35, 38);

        // VPC Box
        ctx.strokeStyle = 'rgba(255, 153, 0, 0.15)';
        ctx.fillStyle = 'rgba(30, 41, 59, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(35, 55, cW - 70, cH - 90);
        ctx.fillRect(35, 55, cW - 70, cH - 90);

        ctx.fillStyle = 'rgba(142, 152, 182, 0.5)';
        ctx.fillText("VPC: vpc-aws-main (10.0.0.0/16)", 50, 72);

        // Subnets
        const subH = (cH - 160) / 2;
        // Public Subnet
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.12)';
        ctx.fillStyle = 'rgba(34, 197, 94, 0.02)';
        ctx.strokeRect(50, 95, cW - 100, subH);
        ctx.fillRect(50, 95, cW - 100, subH);
        ctx.fillStyle = 'rgba(34, 197, 94, 0.45)';
        ctx.fillText("AWS Public Subnet [10.0.1.0/24]", 65, 112);

        // Private Subnet
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.12)';
        ctx.fillStyle = 'rgba(239, 68, 68, 0.02)';
        ctx.strokeRect(50, 115 + subH, cW - 100, subH);
        ctx.fillRect(50, 115 + subH, cW - 100, subH);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
        ctx.fillText("AWS Private Subnet [10.0.2.0/24]", 65, 132 + subH);

      } else {
        // --- 3. 복합 뷰 (양쪽 반반 분산 - 기존 레거시 호환용) ---
        const zoneW = (cW / 2) - 60;
        const zoneH = cH - 80;
        const awsX = (cW / 2) + 20;

        ctx.strokeStyle = 'rgba(88, 166, 255, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(40, 40, zoneW, zoneH);
        ctx.fillStyle = 'rgba(88, 166, 255, 0.02)';
        ctx.fillRect(40, 40, zoneW, zoneH);

        ctx.strokeStyle = 'rgba(236, 114, 17, 0.2)';
        ctx.strokeRect(awsX, 40, zoneW, zoneH);
        ctx.fillStyle = 'rgba(236, 114, 17, 0.02)';
        ctx.fillRect(awsX, 40, zoneW, zoneH);
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(43, 108, 176, 0.7)';
        ctx.font = 'bold 9px "Plus Jakarta Sans", sans-serif';
        ctx.fillText("SAMSUNG SCP SUBNET ZONE", 55, 60);
        ctx.fillStyle = 'rgba(192, 86, 33, 0.7)';
        ctx.fillText("AWS VPC PUBLIC/PRIVATE ZONE", awsX + 15, 60);
      }

      // A. 링크 드로잉 (Spring Lines)
      links.forEach(link => {
        const n1 = nodes.find(n => n.id === link.source);
        const n2 = nodes.find(n => n.id === link.target);
        if (n1 && n2) {
          const isWarning = n1.status === 'warning' || n2.status === 'warning';
          
          if (link.type === 'parent_child') {
            // 부모 자식 점선은 얇고 은은하게 배경 가이드 느낌으로 출력
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1.0;
            ctx.setLineDash([4, 4]);
          } else {
            // 실제 네트워크 트래픽 흐름선은 네온 청록색 실선으로 뚜렷하게
            ctx.strokeStyle = isWarning ? 'rgba(239, 68, 68, 0.7)' : 'rgba(6, 182, 212, 0.4)';
            ctx.lineWidth = isWarning ? 2.2 : 1.5;
          }
          
          ctx.beginPath();
          ctx.moveTo(n1.x, n1.y);
          ctx.lineTo(n2.x, n2.y);
          ctx.stroke();
          ctx.setLineDash([]);
          
          // parent_child 가 아닌 실제 흐름 링크에만 트래픽 파티클이 흘러가게 제한
          if (link.type !== 'parent_child') {
            const flowSpeed = 0.0022;
            const progress = ((Date.now() * flowSpeed) % 1.0);
            const px = n1.x + (n2.x - n1.x) * progress;
            const py = n1.y + (n2.y - n1.y) * progress;
            
            // 흐르는 입자 드로잉 (빛나는 형광 네온 그린/아쿠아)
            ctx.fillStyle = isWarning ? '#ef4444' : '#06b6d4';
            ctx.shadowColor = isWarning ? '#ef4444' : '#06b6d4';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(px, py, 3.2, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      });

      // B. 노드 드로잉 (Glowing Orb Nodes)
      nodes.forEach(node => {
        const isWarning = node.status === 'warning';
        const isSelected = selectedNode === node.id;
        
        // 경보 발생 시 방사되는 붉은색 파티클 코로나 효과 (Pulsing Glow Corona)
        if (isWarning) {
          const glowPulse = 16 + Math.sin(Date.now() * 0.007) * 4.5;
          ctx.fillStyle = 'rgba(209, 50, 18, 0.16)';
          ctx.beginPath();
          ctx.arc(node.x, node.y, glowPulse, 0, 2 * Math.PI);
          ctx.fill();
          
          ctx.strokeStyle = 'rgba(209, 50, 18, 0.45)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // 마우스 선택 시 주황색 테두리 하이라이트
        if (isSelected) {
          ctx.strokeStyle = '#ec7211';
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 14.5, 0, 2 * Math.PI);
          ctx.stroke();
        }

        // 메인 몸체 원형 백그라운드
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = isWarning ? '#d13212' : '#8c95a5';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 11, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // 노드 내 내부 그래픽 아이콘 드로잉
        ctx.strokeStyle = isWarning ? '#d13212' : '#232f3e';
        ctx.lineWidth = 1.5;
        if (node.type === 'database') {
          // 데이터베이스 원통 실루엣
          ctx.beginPath();
          ctx.ellipse(node.x, node.y - 3, 5, 2, 0, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(node.x - 5, node.y - 3);
          ctx.lineTo(node.x - 5, node.y + 3);
          ctx.arc(node.x, node.y + 3, 5, 0, Math.PI, false);
          ctx.lineTo(node.x + 5, node.y - 3);
          ctx.stroke();
        } else if (node.type === 'vm') {
          // VM 인스턴스 사각형
          ctx.strokeRect(node.x - 5, node.y - 5, 10, 10);
          ctx.beginPath();
          ctx.moveTo(node.x - 3, node.y - 1);
          ctx.lineTo(node.x + 3, node.y - 1);
          ctx.moveTo(node.x - 3, node.y + 2);
          ctx.lineTo(node.x + 3, node.y + 2);
          ctx.stroke();
        } else if (node.type === 'loadbalancer') {
          // 로드밸런서
          ctx.beginPath();
          ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(node.x - 5, node.y); ctx.lineTo(node.x + 5, node.y);
          ctx.moveTo(node.x, node.y - 5); ctx.lineTo(node.x, node.y + 5);
          ctx.stroke();
        } else {
          // 일반 게이트웨이 / 버킷
          ctx.fillStyle = '#8c95a5';
          ctx.beginPath();
          ctx.arc(node.x, node.y, 3, 0, 2 * Math.PI);
          ctx.fill();
        }

        // 라벨 텍스트 드로잉 (노드 우측에 2단 계층형으로 예쁘게 렌더링)
        const labelText = node.label || '';
        const lines = labelText.split('\n');
        
        ctx.textAlign = 'left';
        if (lines.length > 1) {
          // 1. 서버 이름 (위)
          ctx.fillStyle = isSelected ? '#ffffff' : '#f1f5f9';
          ctx.font = 'bold 9.5px "Plus Jakarta Sans", sans-serif';
          ctx.fillText(lines[0], node.x + 16, node.y - 2);

          // 2. IP 주소 (아래)
          ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
          ctx.font = 'normal 8.5px "Plus Jakarta Sans", sans-serif';
          ctx.fillText(lines[1], node.x + 16, node.y + 8);
        } else {
          ctx.fillStyle = isSelected ? '#ffffff' : '#e2e8f0';
          ctx.font = 'bold 9.5px "Plus Jakarta Sans", sans-serif';
          ctx.fillText(labelText, node.x + 16, node.y + 3);
        }

      });

      ctx.restore();
      animId = requestAnimationFrame(runPhysicsAndDraw);
    };

    animId = requestAnimationFrame(runPhysicsAndDraw);
    return () => {
      cancelAnimationFrame(animId);
      if (canvasEl) {
        canvasEl.removeEventListener('wheel', onWheelRaw);
      }
    };
  }, [selectedNode]);

  return (
    <div className="relative border border-slate-800/60 bg-[#0d121f] border border-slate-800/80 rounded  overflow-hidden select-none">
      {/* 인터랙티브 마우스 가이드 뱃지 */}
      <div className="absolute top-3 left-3 bg-[#19222d] text-white text-[9px] uppercase px-2 py-1 rounded font-bold pointer-events-none z-10 opacity-80 tracking-wider">
        🖱️ Drag nodes to toss // Scroll to Zoom // Drag canvas to Pan
      </div>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="cursor-grab active:cursor-grabbing block bg-slate-950 w-full h-[500px]"
      />
    </div>
  );
}

// ----------------------------------------------------
// [메인 대시보드 뷰 페이지 컴포넌트]
// ----------------------------------------------------
export default function Home() {
  // 인증 세션 상태
  const [token, setToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('');
  const [userTenant, setUserTenant] = useState<string>('');

  // UI 조작 상태
  const [activeMenu, setActiveMenu] = useState<string>('dashboard');
  const [selectedTenant, setSelectedTenant] = useState<string>('system');
  const [tenantsList, setTenantsList] = useState<any[]>([]);

  // 로그인 폼 상태
  const [loginEmail, setLoginEmail] = useState<string>('op_scp@client.com');
  const [loginPassword, setLoginPassword] = useState<string>('op123!');
  const [loginError, setLoginError] = useState<string>('');

  // 모니터링 데이터 상태
  const [topology, setTopology] = useState<any>({ nodes: [], links: [] });
  const [metrics, setMetrics] = useState<any[]>([]);
  const [selectedNode, setSelectedNode] = useState<string>('');
  const [selectedMetric, setSelectedMetric] = useState<string>('cpu');
  const [metricsDuration, setMetricsDuration] = useState<number>(60);
  const [logs, setLogs] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [costs, setCosts] = useState<any>(null);
  
  // 경보 룰 및 감사로그 상태
  const [rules, setRules] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [newRuleName, setNewRuleName] = useState<string>('High CPU Warning');
  const [newRuleMetric, setNewRuleMetric] = useState<string>('cpu');
  const [newRuleOperator, setNewRuleOperator] = useState<string>('gt');
  const [newRuleThreshold, setNewRuleThreshold] = useState<number>(85.0);
  const [newRuleDuration, setNewRuleDuration] = useState<number>(5);

  // Phase 2 ~ 3: 인시던트 / AI / 라이선스 상태
  const [incidents, setIncidents] = useState<any[]>([]);
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const [incidentDetail, setIncidentDetail] = useState<any>(null);
  const [aiRca, setAiRca] = useState<any>(null);
  const [isRcaLoading, setIsRcaLoading] = useState<boolean>(false);
  const [monthlyReport, setMonthlyReport] = useState<string>('');
  const [isReportLoading, setIsReportLoading] = useState<boolean>(false);
  
  // L5 자동조치 실행 관련 상태
  const [isRemediating, setIsRemediating] = useState<boolean>(false);
  
  // Ed25519 라이선스 뱃지 상태
  const [license, setLicense] = useState<any>({ edition: 'Checking...', expire_date: '', is_valid: true, is_expired: false, is_evaluation: false });

  // Phase 4: FinOps 상태
  const [costAnomalies, setCostAnomalies] = useState<any[]>([]);
  const [rightsizingRecommendations, setRightsizingRecommendations] = useState<any[]>([]);

  // Phase 5: AIOps 성숙도 및 네트워크/보안/예측 상태
  const [maturityLevel, setMaturityLevel] = useState<number>(4);
  const [networkPaths, setNetworkPaths] = useState<any>({
    dedicated: { status: "ACTIVE", packet_loss: 0.02, bandwidth_mbps: 850.0 },
    vpn: { status: "STANDBY", packet_loss: 0.0, bandwidth_mbps: 0.0 }
  });
  const [blockedIps, setBlockedIps] = useState<string[]>([]);
  const [diskPrediction, setDiskPrediction] = useState<any>(null);
  const [newBlockIp, setNewBlockIp] = useState<string>('');
  const [activeCsp, setActiveCsp] = useState<string>('scp');
  const [topoViewMode, setTopoViewMode] = useState<string>('graph'); // 'graph' or 'tree'
  const [activeDetailTab, setActiveDetailTab] = useState<string>('rca'); // 'rca' or 'timeline'
  const [timelineCards, setTimelineCards] = useState<any[]>([]);
  const [terminalLog, setTerminalLog] = useState<string>('');
  const [isExecutingScript, setIsExecutingScript] = useState<boolean>(false);
  const [rightsizingSimulation, setRightsizingSimulation] = useState<any[]>([]);
  const [selectedSimNode, setSelectedSimNode] = useState<string>('');

  // 로컬 스토리지 자동 토큰 복원
  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedEmail = localStorage.getItem('email');
    const savedRole = localStorage.getItem('role');
    const savedTenant = localStorage.getItem('tenant_id');
    if (savedToken && savedEmail && savedRole && savedTenant) {
      setToken(savedToken);
      setUserEmail(savedEmail);
      setUserRole(savedRole);
      setUserTenant(savedTenant);
      setSelectedTenant(savedTenant);
    }
  }, []);

  // 로그인 API 연동
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginEmail, password: loginPassword })
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.access_token);
        setUserEmail(data.email);
        setUserRole(data.role);
        setUserTenant(data.tenant_id);
        setSelectedTenant(data.tenant_id);
        
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('email', data.email);
        localStorage.setItem('role', data.role);
        localStorage.setItem('tenant_id', data.tenant_id);
      } else {
        const errData = await res.json();
        setLoginError(errData.detail || '로그인에 실패했습니다.');
      }
    } catch (err) {
      setLoginError('백엔드 서버와 통신할 수 없습니다.');
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.clear();
  };

  // 공통 API Fetch 헬퍼
  const fetchFromBackend = async (endpoint: string, options: any = {}) => {
    if (!token) return null;
    try {
      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: options.method || 'GET',
        headers: { 
          'Authorization': `Bearer ${token}`,
          ...options.headers
        },
        body: options.body
      });
      if (res.status === 401) {
        console.warn("401 Unauthorized 감지. 세션이 만료되어 로그아웃 처리합니다.");
        handleLogout();
        return null;
      }
      if (res.ok) return await res.json();
      return null;
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  // 어드민 전용 테넌트 리스트 조회
  useEffect(() => {
    if (token && userRole === 'SYSTEM_ADMIN') {
      fetchFromBackend('/tenants').then(data => {
        if (data) setTenantsList(data);
      });
    }
  }, [token, userRole]);

  // 대시보드 및 페이지별 데이터 로드 트리거
  const loadData = async (targetCsp = activeCsp) => {
    if (!token) return;
    
    // 라이선스 정보 조회
    const licData = await fetchFromBackend('/license');
    if (licData) setLicense(licData);
    
    let activeTargetNodeId = 'scp-vm-app-01'; // 기본 폴백
    const topoData = await fetchFromBackend(`/monitor/topology?tenant_id=${selectedTenant}&provider=${targetCsp}`);
    if (topoData) {
      setTopology(topoData);
      const monitored = topoData.nodes.filter((n: any) => ['vm', 'database', 'loadbalancer'].includes(n.type));
      if (monitored.length > 0) {
        // warning 상태인 VM 우선 선택하여 AI Assistant 및 이상지표 분석 흐름 동기화
        const warnNode = monitored.find((n: any) => n.status === 'warning');
        activeTargetNodeId = warnNode ? warnNode.id : monitored[0].id;
        setSelectedNode(activeTargetNodeId);
      }
    }

    const evData = await fetchFromBackend(`/monitor/events?tenant_id=${selectedTenant}&provider=${targetCsp}`);
    if (evData) setEvents(evData);

    const logData = await fetchFromBackend(`/monitor/logs?limit=40&tenant_id=${selectedTenant}&provider=${targetCsp}`);
    if (logData) setLogs(logData);

    const costData = await fetchFromBackend(`/monitor/costs?tenant_id=${selectedTenant}&provider=${targetCsp}`);
    if (costData) setCosts(costData);

    const ruleData = await fetchFromBackend('/alerts/rules');
    if (ruleData) setRules(ruleData);

    const auditData = await fetchFromBackend('/alerts/audit-logs?limit=50');
    if (auditData) setAuditLogs(auditData);

    const incidentData = await fetchFromBackend('/incidents');
    if (incidentData) setIncidents(incidentData);

    // Phase 4: FinOps 실시간 데이터 로드
    const anomalyCosts = await fetchFromBackend(`/monitor/costs/anomalies?tenant_id=${selectedTenant}&provider=${targetCsp}`);
    if (anomalyCosts) setCostAnomalies(anomalyCosts);

    const rightsizingData = await fetchFromBackend(`/monitor/costs/rightsizing?tenant_id=${selectedTenant}&provider=${targetCsp}`);
    if (rightsizingData) setRightsizingRecommendations(rightsizingData);

    // Phase 5: 신규 AIOps 데이터 수집
    const predData = await fetchFromBackend(`/monitor/predictions?node_id=${activeTargetNodeId}&tenant_id=${selectedTenant}&provider=${targetCsp}`);
    if (predData) setDiskPrediction(predData);

    const netPaths = await fetchFromBackend(`/monitor/network/paths?tenant_id=${selectedTenant}&provider=${targetCsp}`);
    if (netPaths) setNetworkPaths(netPaths);

    const blocked = await fetchFromBackend(`/monitor/security/blocked?tenant_id=${selectedTenant}&provider=${targetCsp}`);
    if (blocked) setBlockedIps(blocked);

    // 실서버 자격증명 조회 및 설정 입력필드 자동 로딩
    if (activeMenu === 'alerts') {
      try {
        const credentials = await fetchFromBackend('/credentials');
        if (credentials && Array.isArray(credentials)) {
          const scpCred = credentials.find((c: any) => c.provider === 'scp');
          if (scpCred) {
            const decCred = await fetchFromBackend(`/credentials/${scpCred.id}/decrypted`);
            if (decCred) {
              const akInput = document.getElementById('scp_access_key_settings') as HTMLInputElement;
              const skInput = document.getElementById('scp_secret_key_settings') as HTMLInputElement;
              const prjInput = document.getElementById('scp_project_id_settings') as HTMLInputElement;
              if (akInput) akInput.value = decCred.access_key || '';
              if (skInput) skInput.value = decCred.secret_key || '';
              if (prjInput) prjInput.value = decCred.project_id || '';
            }
          }
        }
      } catch (credErr) {
        console.error("자격증명 로드 중 에러:", credErr);
      }
    }
  };

  useEffect(() => {
    loadData(activeCsp);
  }, [token, selectedTenant, activeMenu, activeCsp]);

  // 실시간 성능 메트릭 조회
  useEffect(() => {
    if (token && selectedNode) {
      fetchFromBackend(`/monitor/metrics?node_id=${selectedNode}&metric_name=${selectedMetric}&minutes=${metricsDuration}`).then(data => {
        if (data) setMetrics(data);
      });
    }
  }, [token, selectedNode, selectedMetric, metricsDuration]);

  // 특정 인시던트 상세 및 타임라인 로드
  const loadIncidentDetail = async (id: number) => {
    setSelectedIncidentId(id);
    setAiRca(null);
    setTimelineCards([]);
    setTerminalLog('');
    setActiveDetailTab('rca');
    const detail = await fetchFromBackend(`/incidents/${id}`);
    if (detail) {
      setIncidentDetail(detail);
      await loadTimelineCards(id);
    }
  };

  // 인시던트 조치 상태 변경 API 호출
  const handleUpdateIncidentStatus = async (id: number, status: string, assignToSelf: boolean = false) => {
    if (!token) return;
    try {
      const payload = {
        status: status,
        assigned_to: assignToSelf ? userEmail : (incidentDetail?.incident?.assigned_to || null)
      };
      
      const res = await fetch(`${BACKEND_URL}/incidents/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert(`인시던트 상태가 [${status}]로 변경되었습니다.`);
        loadIncidentDetail(id);
        loadData();
      } else {
        const err = await res.json();
        alert(err.detail || '상태 변경 중 오류가 발생했습니다.');
      }
    } catch (err) {
      alert('상태 변경 중 오류 발생');
    }
  };

  // L5 자동조치 실행 승인 API 호출
  const handleExecuteRemediation = async (id: number) => {
    if (!token) return;
    setIsRemediating(true);
    try {
      const res = await fetch(`${BACKEND_URL}/incidents/${id}/remediate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert('자동조치 명령이 인스턴스에 성공적으로 송출 및 확인되었습니다.');
        loadIncidentDetail(id);
        loadData();
      } else {
        const err = await res.json();
        alert(err.detail || '자동조치 실행 권한이 없거나 만료되었습니다.');
      }
    } catch (err) {
      alert('자동조치 서버 통신 실패');
    } finally {
      setIsRemediating(false);
    }
  };

  // AI RCA 분석 실행 API 호출
  const handleRunAiRca = async (id: number) => {
    if (!token) return;
    setIsRcaLoading(true);
    setAiRca(null);
    setTerminalLog('');
    try {
      const res = await fetch(`${BACKEND_URL}/incidents/${id}/analyze`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAiRca(data);
        // 타임라인 카드 및 라이트사이징 시뮬레이터도 함께 로딩
        await loadTimelineCards(id);
      }
    } catch (err) {
      alert('AI 분석 중 오류 발생');
    } finally {
      setIsRcaLoading(false);
    }
  };

  // RCA 타임라인 카드 페치
  const loadTimelineCards = async (incidentId: number) => {
    const cards = await fetchFromBackend(`/aiops/incidents/${incidentId}/timeline-cards`);
    if (cards) {
      setTimelineCards(cards);
    }
  };

  // AI Copilot 런북 스크립트 실행
  const handleRunActionScript = async (incidentId: number, scriptText: string) => {
    if (!token) return;
    setIsExecutingScript(true);
    setTerminalLog("[AIOps Copilot] Connecting to target node sandbox environment...\n");
    try {
      const res = await fetch(`${BACKEND_URL}/aiops/incidents/${incidentId}/run-action-script`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ script: scriptText })
      });
      if (res.ok) {
        const data = await res.json();
        // 실행 로그 시뮬레이션 출력
        setTerminalLog(data.stdout);
        alert(data.message);
        loadIncidentDetail(incidentId);
        loadData();
      } else {
        const err = await res.json();
        setTerminalLog(`[ERROR] Playbook execution failed: ${err.detail}\n`);
      }
    } catch (err) {
      setTerminalLog("[ERROR] Failed to communicate with sandbox shell.\n");
    } finally {
      setIsExecutingScript(false);
    }
  };

  // 라이트사이징 비용 시뮬레이션 페치
  const handleSimulateRightsizing = async (nodeId: string) => {
    setSelectedSimNode(nodeId);
    const simData = await fetchFromBackend(`/aiops/costs/simulate-rightsizing?node_id=${nodeId}&scale_ratio=1.8`);
    if (simData) {
      setRightsizingSimulation(simData);
    }
  };

  // 월간 보고서 자동 생성 API 호출
  const handleGenerateMonthlyReport = async () => {
    if (!token) return;
    setIsReportLoading(true);
    setMonthlyReport('');
    try {
      const res = await fetch(`${BACKEND_URL}/incidents/report/monthly`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMonthlyReport(data.report_markdown);
      }
    } catch (err) {
      alert('보고서 생성 중 오류 발생');
    } finally {
      setIsReportLoading(false);
    }
  };

  // 경보 룰 추가 API
  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/alerts/rules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newRuleName,
          metric_name: newRuleMetric,
          operator: newRuleOperator,
          threshold: newRuleThreshold,
          duration_minutes: newRuleDuration
        })
      });
      if (res.ok) {
        alert('경보 규칙이 데이터베이스에 등록되었습니다.');
        loadData();
      } else {
        const err = await res.json();
        alert(err.detail || '규칙 등록 권한이 없거나 만료되었습니다.');
      }
    } catch (err) {
      alert('규칙 등록 실패');
    }
  };

  // 경보 룰 삭제 API
  const handleDeleteRule = async (id: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/alerts/rules/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        alert('경보 규칙이 삭제되었습니다.');
        loadData();
      }
    } catch (err) {
      alert('규칙 삭제 실패');
    }
  };

  // ---------------------------------
  // 미인증 상태: 로그인 화면 (50:50 좌우)
  // ---------------------------------
  if (!token) {
    return (
      <div className="min-h-screen bg-[#eaeded] text-[#2c3e50] flex font-sans antialiased">
        {/* 좌측: 안내 영역 */}
        <div className="w-7/12 bg-[#232f3e] p-16 flex flex-col justify-between text-white relative">
          <div>
            <div className="flex items-center gap-3.5 mb-14">
              <span className="text-[#ff9900] text-3xl font-extrabold">aws</span>
              <span className="text-xl font-bold tracking-tight text-white border-l border-gray-500 pl-3">
                ddalkkak AIOps console
              </span>
            </div>

            <h2 className="text-3xl font-bold text-white mb-6 leading-tight">
              AWS & Samsung SCP <br />
              <span className="text-[#ff9900]">Multi-Tenant Management Console</span>
            </h2>
            
            <p className="text-sm text-gray-300 mb-12 max-w-lg leading-relaxed">
              본 시스템은 멀티클라우드 리소스를 안전하게 제어하고 모니터링하기 위한 정식 콘솔입니다. 
              봉투 암호화(Envelope Encryption) 정책과 DB Row-Level Security(RLS) 격리 시스템이 내장되어 있습니다.
            </p>

            <div className="space-y-6 max-w-lg">
              <div className="flex gap-4 items-start p-4.5 bg-[#19222d] border border-gray-700/40 rounded">
                <span className="text-xl">🔐</span>
                <div>
                  <h4 className="font-bold text-sm text-white">데이터 이중 봉투 암호화 정책</h4>
                  <p className="text-xs text-gray-400 mt-1">자격증명 수집 키를 암호화 키 래핑 기법을 적용하여 외부 유출을 원천 예방합니다.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start p-4.5 bg-[#19222d] border border-gray-700/40 rounded">
                <span className="text-xl">🛡️</span>
                <div>
                  <h4 className="font-bold text-sm text-white">테넌트 데이터 접근 격리 (RLS)</h4>
                  <p className="text-xs text-gray-400 mt-1">PostgreSQL RLS 세션을 통해 로그인 사용자가 속한 고객사 이외의 정보를 절대 조회할 수 없도록 강제 격리합니다.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-400 font-mono">
            AWS COMPATIBLE AIOPS PORTAL // SECURE TRANSMISSION ENABLED
          </div>
        </div>

        {/* 우측: 로그인 폼 */}
        <div className="w-5/12 p-16 flex flex-col justify-center bg-white ">
          <div className="max-w-md mx-auto w-full">
            <div className="border border-[#eaeded] rounded p-8 bg-white ">
              <h3 className="text-2xl font-semibold text-[#1a202c] mb-6">콘솔에 로그인</h3>
              
              {loginError && (
                <div className="p-3.5 mb-5 bg-red-50 border border-red-200 rounded text-red-600 text-xs font-mono">
                  [Error] {loginError}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase">이메일 주소</label>
                  <input
                    type="email"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0073bb] focus:ring-1 focus:ring-[#0073bb]"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase">비밀번호</label>
                  <input
                    type="password"
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-[#0073bb] focus:ring-1 focus:ring-[#0073bb]"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                </div>
                
                <button
                  type="submit"
                  className="w-full bg-[#ec7211] hover:bg-[#d85d00] text-white font-bold py-2 rounded transition-all duration-150 text-sm  cursor-pointer"
                >
                  로그인
                </button>
              </form>
            </div>
            
            <div className="mt-8 text-center text-xs text-gray-500">
              계정이 없거나 분실한 경우 테넌트 관리자에게 문의바랍니다.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------
  // 인증 후 상태: 정식 AWS 콘솔 레이아웃
  // ---------------------------------
  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col font-sans antialiased">
      {/* 1. AWS 상단 내비게이션 바 (Top Header) */}
      <header className="h-12 bg-[#19222d] text-white px-6 flex items-center justify-between z-20 sticky top-0 shadow">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1">
            <span className="text-[#ff9900] font-black text-xl tracking-tighter">aws</span>
            <span className="font-extrabold text-xs text-white uppercase ml-1.5 tracking-wider border-l border-gray-600 pl-3">
              ddalkkak AIOps
            </span>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="서비스, 리소스, 문서 검색"
              className="bg-[#2c3743] border-none text-xs text-gray-200 placeholder-gray-400 pl-8 pr-4 py-1.5 rounded w-96 focus:outline-none focus:bg-white focus:text-[#19222d] transition-colors"
            />
            <span className="absolute left-2.5 top-2 text-gray-400 text-xs">🔍</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5 bg-[#2c3743] px-2.5 py-1 rounded cursor-default">
            <span className="h-2 w-2 rounded-full bg-[#00E676]" />
            <span>Seoul (ap-northeast-2)</span>
          </div>

          {userRole === 'SYSTEM_ADMIN' && (
            <div className="bg-[#2c3743] px-3 py-1 rounded flex items-center gap-2">
              <span className="text-[10px] text-gray-400 uppercase font-bold">Scope:</span>
              <select
                className="bg-transparent border-none text-xs text-white focus:outline-none cursor-pointer font-bold"
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
              >
                <option value="system" className="bg-[#19222d]">MSP Total Aggregation</option>
                {tenantsList.map(t => (
                  <option key={t.id} value={t.id} className="bg-[#19222d]">{t.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="border-l border-gray-600 pl-4 py-1 flex items-center gap-2 cursor-pointer">
            <span className="font-bold text-[#ff9900]">👤 {userEmail.split('@')[0]}</span>
            <span className="text-[10px] text-gray-400">({userRole})</span>
          </div>
        </div>
      </header>

      {/* 2. 바디 영역 */}
      <div className="flex-1 flex min-h-0">
        
        {/* 좌측 서비스 목록 */}
        <aside className="w-64 bg-[#060913] border-r border-[#1e293b] p-4 flex flex-col justify-between z-10">
          <div>
            <div className="text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2 px-3">
              AIOps Services
            </div>

            {/* CSP 모드 선택 스위치 */}
            <div className="px-3 mb-5">
              <div className="flex gap-1 bg-[#0d121f] border border-slate-800/80 p-1 rounded border border-slate-800/60">
                <button
                  onClick={() => { setActiveCsp('scp'); loadData('scp'); }}
                  className={`flex-1 text-center py-1 rounded text-[10px] font-extrabold transition-all cursor-pointer ${activeCsp === 'scp' ? 'bg-slate-700 text-white ' : 'text-slate-400 hover:text-slate-100'}`}
                >
                  Samsung SCP
                </button>
                <button
                  onClick={() => { setActiveCsp('aws'); loadData('aws'); }}
                  className={`flex-1 text-center py-1 rounded text-[10px] font-extrabold transition-all cursor-pointer ${activeCsp === 'aws' ? 'bg-slate-700 text-white ' : 'text-slate-400 hover:text-slate-100'}`}
                >
                  AWS Cloud
                </button>
              </div>
            </div>
            
            <nav className="space-y-1">
              {[
                { id: 'dashboard', label: 'Console Dashboard', icon: '📊' },
                { id: 'incidents', label: 'Incidents Hub 🚨', icon: '🚨' },
                { id: 'topology', label: 'Topology Map 🌐', icon: '🌐' },
                { id: 'metrics', label: activeCsp === 'scp' ? 'SCP Cloud Monitoring' : 'CloudWatch Metrics', icon: '📈' },
                { id: 'logs', label: activeCsp === 'scp' ? 'SCP Cloud Logging' : 'CloudWatch Logs', icon: '📰' },
                { id: 'costs', label: activeCsp === 'scp' ? 'SCP Billing API' : 'SCP Billing & Cost Manager', icon: '💵' },
                { id: 'alerts', label: 'Settings & Config Policies', icon: '⚙️' },
              ].map(menu => (
                <button
                  key={menu.id}
                  onClick={() => setActiveMenu(menu.id)}
                  className={`w-full text-left py-2.5 px-3 rounded text-xs font-bold transition-all flex items-center gap-3.5 cursor-pointer ${activeMenu === menu.id ? 'bg-slate-800 text-[#ff9900] border-l-4 border-[#ff9900]' : 'text-slate-400 hover:text-white hover:bg-slate-800/40'}`}
                >
                  <span>{menu.icon}</span>
                  <span>{menu.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 p-4 rounded text-xs space-y-3">
            {/* Ed25519 라이선스 상태 감지 카드 */}
            <div>
              <div className="font-bold text-slate-300 mb-1.5 uppercase text-[9px] tracking-wider">Ed25519 License Shield</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`h-2.5 w-2.5 rounded-full ${license.is_expired ? 'bg-[#d13212]' : (license.is_evaluation ? 'bg-[#ec7211]' : 'bg-[#1d8102]')}`} />
                <span className="font-extrabold text-[10px] text-slate-200 uppercase">
                  {license.edition} {license.is_expired && '(Expired)'}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-1">Limit: {license.max_nodes} Nodes // Exp: {license.expire_date}</div>
            </div>

            <div className="border-t border-slate-700 pt-3 text-slate-400">
              <div>Tenant ID: <span className="text-slate-200 font-bold font-mono">{userTenant}</span></div>
              <div>RDBMS Sec: <span className="text-[#10b981] font-semibold">Enforced</span></div>
            </div>
            
            <button
              onClick={handleLogout}
              className="w-full mt-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold py-1.5 rounded transition-all text-xs cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* 우측 메인 패널 */}
        <main className="flex-1 p-8 overflow-y-auto">
          
          {/* A. 대시보드 화면 */}
          {activeMenu === 'dashboard' && (
            <div className="space-y-6">
              
              {/* 대시보드 헤더 */}
              <div className="flex justify-between items-center bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 p-6 rounded ">
                <div>
                  <h2 className="text-xl font-bold text-slate-100 tracking-tight">ddalkkak AIOps 통합 관제 콘솔 ({activeCsp === 'scp' ? 'Samsung SCP' : 'AWS Cloud'})</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">실시간 이상 감지, 인프라 용량 포화 예측 및 네트워크/보안 자율 제어 통제 센터입니다.</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setActiveMenu('costs'); handleGenerateMonthlyReport(); }}
                    className="bg-[#ec7211] hover:bg-[#d85d00] text-white font-bold px-4 py-2 rounded text-xs transition-all  cursor-pointer flex items-center gap-1.5"
                  >
                    📋 AI 월간 보고서 초안 작성
                  </button>
                </div>
              </div>

              {/* AIOps 성숙 4단계 토글 바 */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-center px-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-extrabold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                      🤖 AIOps Autopilot Maturity Control Panel
                    </span>
                    <span className="text-[9px] bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 px-2 py-0.5 rounded font-bold font-mono">
                      CURRENT MODE: LEVEL {maturityLevel} ({maturityLevel === 4 ? 'AUTOMATED_REMEDIATION' : (maturityLevel === 3 ? 'PREDICTIVE_ANALYSIS' : 'ACTIVE_OBSERVING')})
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 italic">단계 버튼을 클릭하면 해당 레벨의 자율 조치 지표와 플레이북이 활성화됩니다.</span>
                </div>
                
                <div className="grid grid-cols-4 gap-4 bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 p-3 rounded ">
                  {[
                    { level: 1, label: '1단계: Observe (통합 관측)', icon: '👁️', desc: 'Flow Log, 메트릭, 로그 통합 가시화', type: 'cyan' },
                    { level: 2, label: '2단계: Detect/RCA (지능 탐지)', icon: '🔍', desc: 'AI 임계치 이상탐지 및 근본원인 분석', type: 'cyan' },
                    { level: 3, label: '3단계: Predict (장애 예견)', icon: '🔮', desc: '스토리지 포화 트렌드 및 성능 예측', type: 'orange' },
                    { level: 4, label: '4단계: Automate (자가복구/SOAR)', icon: '🤖', desc: '회선 자동 우회 및 WAF IP 차단 플레이북', type: 'orange' }
                  ].map(item => (
                    <button
                      key={item.level}
                      onClick={() => setMaturityLevel(item.level)}
                      className={`text-left p-3.5 rounded transition-all border cursor-pointer ${
                        maturityLevel === item.level 
                          ? (item.type === 'cyan' ? 'bg-[#0f172a] neon-active-cyan font-bold ' : 'bg-[#0f172a] neon-active-orange font-bold ') 
                          : 'neon-inactive hover:bg-[#0d121f] border border-slate-800/80 hover:text-slate-100'
                      }`}
                    >
                      <div className="text-xs font-extrabold flex items-center gap-2 mb-1">
                        <span>{item.icon}</span> <span>{item.label}</span>
                      </div>
                      <p className="text-[10px] opacity-75 font-mono leading-tight">{item.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* 📊 Row 1: AIOps 4대 Golden Signals KPI 스탯 카드 그리드 */}
              <div className="grid grid-cols-4 gap-6">
                
                {/* KPI Card 1: System Health (종합 헬스 상태) */}
                <div className="bg-[#060913] border border-slate-800/80 p-4 rounded-lg flex flex-col justify-between relative overflow-hidden h-[135px]">
                  <div className="flex justify-between items-start">
                    <span className="text-[10.5px] text-slate-400 font-extrabold tracking-wider uppercase font-sans">System Health</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black font-mono border ${
                      incidents.some((i: any) => i.status === 'OPEN' && i.severity === 'CRITICAL')
                        ? 'bg-red-950/40 text-[#ef4444] border-red-900/30'
                        : incidents.some((i: any) => i.status === 'OPEN')
                          ? 'bg-amber-950/40 text-[#f59e0b] border-amber-900/30'
                          : 'bg-emerald-950/40 text-[#10b981] border-emerald-900/30'
                    }`}>
                      {incidents.some((i: any) => i.status === 'OPEN' && i.severity === 'CRITICAL') ? 'CRITICAL' : incidents.some((i: any) => i.status === 'OPEN') ? 'DEGRADED' : 'HEALTHY'}
                    </span>
                  </div>
                  
                  <div className="my-2.5 flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight text-slate-100 font-sans num">
                      {incidents.some((i: any) => i.status === 'OPEN') ? '92.5%' : '100%'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">baseline</span>
                  </div>
                  
                  {/* 미니 Sparkline (SVG) */}
                  <div className="h-[25px] w-full mt-1.5 opacity-60">
                    <svg viewBox="0 0 100 20" className="w-full h-full" preserveAspectRatio="none">
                      <path d="M 0 5 L 15 6 L 30 5 L 45 4 L 60 5 L 75 14 L 90 5 L 100 6" fill="none" stroke="#10b981" strokeWidth="1.8" />
                    </svg>
                  </div>
                  <div className="text-[8.5px] text-slate-500 font-mono mt-1">vs. last 24 hours</div>
                </div>

                {/* KPI Card 2: SLO Score (서비스 수준 지표) */}
                <div className="bg-[#060913] border border-slate-800/80 p-4 rounded-lg flex flex-col justify-between relative overflow-hidden h-[135px]">
                  <div className="flex justify-between items-start">
                    <span className="text-[10.5px] text-slate-400 font-extrabold tracking-wider uppercase font-sans">SLO Score (Target: 99.9%)</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-black font-mono bg-emerald-950/40 text-[#10b981] border border-emerald-900/30">
                      ▲ 0.02%
                    </span>
                  </div>
                  
                  <div className="my-2.5 flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight text-[#10b981] font-sans num">99.95%</span>
                    <span className="text-[10px] text-slate-500 font-mono">compliance</span>
                  </div>
                  
                  {/* 미니 Sparkline (SVG) */}
                  <div className="h-[25px] w-full mt-1.5 opacity-60">
                    <svg viewBox="0 0 100 20" className="w-full h-full" preserveAspectRatio="none">
                      <path d="M 0 10 L 20 8 L 40 9 L 60 7 L 80 5 L 100 4" fill="none" stroke="#10b981" strokeWidth="1.8" />
                    </svg>
                  </div>
                  <div className="text-[8.5px] text-slate-500 font-mono mt-1">30-day trailing window</div>
                </div>

                {/* KPI Card 3: Active Alarms (활성 경보 건수) */}
                <div className="bg-[#060913] border border-slate-800/80 p-4 rounded-lg flex flex-col justify-between relative overflow-hidden h-[135px]">
                  <div className="flex justify-between items-start">
                    <span className="text-[10.5px] text-slate-400 font-extrabold tracking-wider uppercase font-sans">Active Alarms</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black font-mono border ${
                      incidents.filter((i: any) => i.status === 'OPEN').length > 0
                        ? 'bg-red-950/40 text-[#ef4444] border-red-900/30'
                        : 'bg-slate-900/50 text-slate-400 border-slate-800'
                    }`}>
                      {incidents.filter((i: any) => i.status === 'OPEN').length > 0 ? 'ALERT' : 'OK'}
                    </span>
                  </div>
                  
                  <div className="my-2.5 flex items-baseline gap-2">
                    <span className={`text-3xl font-bold tracking-tight font-sans num ${
                      incidents.filter((i: any) => i.status === 'OPEN').length > 0 ? 'text-[#ef4444]' : 'text-slate-100'
                    }`}>
                      {incidents.filter((i: any) => i.status === 'OPEN').length}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">unresolved</span>
                  </div>
                  
                  {/* 미니 Sparkline (SVG) */}
                  <div className="h-[25px] w-full mt-1.5 opacity-60">
                    <svg viewBox="0 0 100 20" className="w-full h-full" preserveAspectRatio="none">
                      <path d="M 0 18 L 30 18 L 60 18 L 80 5 L 100 5" fill="none" stroke={incidents.filter((i: any) => i.status === 'OPEN').length > 0 ? '#ef4444' : '#64748b'} strokeWidth="1.8" />
                    </svg>
                  </div>
                  <div className="text-[8.5px] text-slate-500 font-mono mt-1">Real-time status queue</div>
                </div>

                {/* KPI Card 4: Monthly Cost (당월 누적 비용) */}
                <div className="bg-[#060913] border border-slate-800/80 p-4 rounded-lg flex flex-col justify-between relative overflow-hidden h-[135px]">
                  <div className="flex justify-between items-start">
                    <span className="text-[10.5px] text-slate-400 font-extrabold tracking-wider uppercase font-sans">Monthly Total Cost</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-black font-mono bg-sky-950/40 text-sky-400 border border-sky-900/30">
                      OPTIMIZED
                    </span>
                  </div>
                  
                  <div className="my-2.5 flex items-baseline gap-2">
                    <span className="text-2xl font-bold tracking-tight text-slate-100 font-sans num">
                      ₩{parseFloat(costs?.monthly_total || 0).toLocaleString()}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">KRW</span>
                  </div>
                  
                  {/* 미니 Sparkline (SVG) */}
                  <div className="h-[25px] w-full mt-1.5 opacity-60">
                    <svg viewBox="0 0 100 20" className="w-full h-full" preserveAspectRatio="none">
                      <path d="M 0 15 L 20 13 L 40 12 L 60 11 L 80 10 L 100 8" fill="none" stroke="#38bdf8" strokeWidth="1.8" />
                    </svg>
                  </div>
                  <div className="text-[8.5px] text-slate-500 font-mono mt-1">Direct SCP Billing OpenAPI</div>
                </div>

              </div>

              {/* 좌우 분할 그리드 배치 */}
              <div className="grid grid-cols-10 gap-6 items-start">
                
                {/* 좌측 5열: 실시간 토폴로지 관계도 & 서버 정보 리스트 */}
                <div className="col-span-5 space-y-6">
                  {/* 토폴로지 캔버스 카드 */}
                  <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 rounded  p-4 space-y-3">
                    <div className="flex justify-between items-center pb-2.5 border-b border-slate-800/60">
                      <div className="flex items-center gap-4">
                        <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                          <span>🌐</span> 인프라 자원 토폴로지 관제
                        </h3>
                        <div className="flex bg-slate-900 border border-slate-700 rounded p-0.5">
                          <button
                            onClick={() => setTopoViewMode('graph')}
                            className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                              topoViewMode === 'graph' ? 'bg-[#0073bb] text-white' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            🌐 다이어그램 맵
                          </button>
                          <button
                            onClick={() => setTopoViewMode('tree')}
                            className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                              topoViewMode === 'tree' ? 'bg-[#0073bb] text-white' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            🌲 계층 트리 뷰
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <span className="h-4 w-4 bg-green-500 rounded-full animate-ping opacity-75 inline-block" style={{ width: '8px', height: '8px' }} />
                        <span className="text-[9px] font-bold text-slate-400 font-mono uppercase">LIVE FEED ACTIVE</span>
                      </div>
                    </div>
                    
                    {/* 토폴로지 마운트 */}
                    {topoViewMode === 'graph' ? (
                      <ForceTopology
                        topology={topology}
                        activeCsp={activeCsp}
                        selectedNode={selectedNode}
                        onSelectNode={(id) => { setSelectedNode(id); }}
                      />
                    ) : (
                      <HierarchicalTreeView
                        topology={topology}
                        activeCsp={activeCsp}
                        selectedNode={selectedNode}
                        onSelectNode={(id) => { setSelectedNode(id); }}
                      />
                    )}
                  </div>

                  {/* 리소스 요약 테이블 */}
                  <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 rounded ">
                    <div className="px-5 py-3 border-b border-slate-800/60 bg-slate-900/60">
                      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">가동 장비 리소스 대장</h3>
                    </div>
                    <div className="overflow-x-auto max-h-[220px] overflow-y-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-900/40 border-b border-slate-800/60 text-slate-400 font-bold uppercase text-[9px]">
                          <tr>
                            <th className="p-2.5 pl-5">ID</th>
                            <th className="p-2.5">Name</th>
                            <th className="p-2.5">Type</th>
                            <th className="p-2.5">State</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#334155]">
                          {topology.nodes.map((node: any) => (
                            <tr key={node.id} className={`hover:bg-slate-800/40 transition-all ${selectedNode === node.id ? 'bg-slate-800/80' : ''}`} onClick={() => setSelectedNode(node.id)}>
                              <td className="p-2.5 pl-5 text-slate-400 text-[10px]">{node.id}</td>
                              <td className="p-2.5 font-bold text-slate-200 text-[10px]">{node.label}</td>
                              <td className="p-2.5 text-[#0073bb] font-extrabold text-[10px]">{node.type}</td>
                              <td className="p-2.5">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${node.status === 'warning' ? 'bg-orange-100/10 text-[#ec7211]' : 'bg-green-100/10 text-[#1d8102]'}`}>
                                  {node.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* 우측 5열: AIOps 성숙 단계에 따른 통제/분석 카드 패널 */}
                <div className="col-span-5 space-y-6">
                  
                  {/* AIOps Autopilot Live Action Log (AI 자율 운영 자가복구 이력) */}
                  <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 rounded  p-4 space-y-3">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-800/60">
                      <h3 className="text-xs font-extrabold text-[#f8fafc] uppercase tracking-wider flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
                        <span>🤖 AIOps Autopilot Live Action Log</span>
                      </h3>
                      <span className="text-[8px] bg-slate-700 text-slate-300 font-mono px-1.5 py-0.5 rounded uppercase">SYSTEM_OPERATIONAL</span>
                    </div>
                    
                    {/* 터미널 스타일 로그 피드 */}
                    <div className="space-y-2.5 max-h-[170px] overflow-y-auto font-mono text-[9px] text-[#38bdf8] leading-normal bg-slate-900/90 p-3 rounded border border-slate-950">
                      <div className="text-slate-500">// ddalkkak AIOps Agent v2.5.4 Autopilot Listening...</div>
                      
                      {topology.nodes.some((n: any) => n.status === 'warning') && (
                        <div className="text-[#f43f5e] animate-pulse">
                          [15:11:42] [ALERT] [Level 2] scp-vm-app-01 CPU/메모리 부하 상승 감지! Root Cause 분석 기동 완료.
                        </div>
                      )}
                      
                      {blockedIps.length > 0 && (
                        <div className="text-[#a855f7]">
                          [15:09:12] [SOAR] [Level 4] 무차별 대입 공격 IP 차단 작동. Blocked {blockedIps.length} IPs via WAF rules.
                        </div>
                      )}
                      
                      {!topology.nodes.some((n: any) => n.id.includes('-') && n.id.length > 20) && (
                        networkPaths.dedicated.status !== 'ACTIVE' ? (
                          <div className="text-[#f59e0b] animate-pulse">
                            [15:07:30] [HEAL] [Level 4] 전용회선 Packet Loss 초과로 백업 IPSec VPN 터널 우회 경로 자동 절체 성공!
                          </div>
                        ) : (
                          <div className="text-[#10b981]">
                            [15:05:00] [INFO] [Level 4] 주 전용회선(Dedicated) 12ms 무손실 전송 구간 유지 중.
                          </div>
                        )
                      )}
                      
                      {diskPrediction && diskPrediction.saturates_soon && (
                        <div className="text-[#f59e0b]">
                          [15:02:15] [PREDICT] [Level 3] {diskPrediction.node_id} 스토리지 포화 임계치 도달 {diskPrediction.days_to_saturation}일 남음 예측. 알림 발행 완료.
                        </div>
                      )}
                      
                      <div className="text-slate-400">
                        [14:58:10] [INFO] [Level 1] SCP OpenAPI VM {topology.nodes.filter((n: any) => n.provider === 'scp').length}개 및 AWS VPC 자원 토폴로지 통합 맵 매핑 완료.
                      </div>
                      <div className="text-slate-500">
                        [14:55:00] [SYS] [Security] RDBMS DB tenant_id 다중테넌트 격리 필터 규칙(RDBMS Sec) 컴파일 반영 완료.
                      </div>
                    </div>
                    <p className="text-[8.5px] text-slate-400 italic">※ AI 자율 운영 엔진이 실시간 수집된 인프라 상태를 기반으로 자동 의사결정하여 기록한 실시간 로그 피드입니다.</p>
                  </div>

                  {/* Level 3: 용량 예측 패널 (Predict) - 임계 및 안전 구분 분기 */}
                  {maturityLevel >= 3 && diskPrediction && (
                    <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 rounded  p-4 space-y-3">
                      <div className="border-b border-slate-800/60 pb-2 flex justify-between items-center">
                        <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">🔮 AIOps 디스크 포화 선행 예측</h3>
                        {diskPrediction.saturates_soon ? (
                          <span className="bg-[#d13212]/10 text-[#d13212] px-2 py-0.5 rounded text-[9px] font-bold animate-pulse">
                            🚨 위험
                          </span>
                        ) : (
                          <span className="bg-emerald-950/40 text-emerald-400 border border-emerald-900/30 px-2 py-0.5 rounded text-[8px] font-bold">
                            SAFE
                          </span>
                        )}
                      </div>
                      
                      {!diskPrediction.saturates_soon ? (
                        /* 예측 안전 클린 뷰 */
                        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded text-center space-y-1">
                          <span className="text-xs font-bold text-slate-300 block">스토리지 안정 한도선 유지 중</span>
                          <p className="text-[9px] text-slate-500 leading-normal">
                            최근 30일 데이터 디스크 쓰기 유입 트렌드를 분석한 결과, 임계 오차 범위 내 급격한 사용량 상승 추이가 관측되지 않았습니다. (30일 이내 포화 위험 리소스 없음)
                          </p>
                        </div>
                      ) : (
                        /* 임계 경보 발생 시 디스크 상세 정보 */
                        <>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-slate-900 border border-slate-700 p-2 rounded">
                              <div className="text-[8px] font-bold text-slate-400 uppercase">현재 사용률</div>
                              <div className="text-sm font-extrabold text-slate-100 mt-1">{diskPrediction.current_usage_pct.toFixed(1)}%</div>
                            </div>
                            <div className="bg-slate-900 border border-slate-700 p-2 rounded">
                              <div className="text-[8px] font-bold text-slate-400 uppercase">일평균 증가율</div>
                              <div className="text-sm font-extrabold text-[#ec7211] mt-1">+{diskPrediction.growth_rate_pct_day.toFixed(2)}%</div>
                            </div>
                            <div className="bg-slate-900 border border-slate-700 p-2 rounded">
                              <div className="text-[8px] font-bold text-slate-400 uppercase">잔여 예측일</div>
                              <div className="text-sm font-extrabold text-[#d13212] mt-1">
                                {diskPrediction.days_to_saturation > 0 ? `${diskPrediction.days_to_saturation}일` : '안전'}
                              </div>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-300 font-mono leading-relaxed bg-slate-900 p-2.5 rounded border border-slate-700">
                            {diskPrediction.reason}
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Level 4: 네트워크 이중화 회선 우회 - SCP 프리미엄 리디자인 (실서버 시 비활성 가이드 전환) */}
                  {maturityLevel >= 4 && (
                    <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-700/80 rounded  p-4 space-y-4">
                      <div className="border-b border-slate-800/60 pb-2 flex justify-between items-center">
                        <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider">🤖 이중화 네트워크 자율 우회 제어</h3>
                        <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase bg-slate-800 text-slate-400">
                          UNCONFIGURED
                        </span>
                      </div>
                      
                      {topology.nodes.some((n: any) => n.id.includes('-') && n.id.length > 20) ? (
                        /* 실서버 연동 상태 시 비활성 가이드 표시 */
                        <div className="p-4 bg-slate-900/60 border border-slate-800 rounded text-center space-y-2">
                          <span className="text-2xl block">🌐</span>
                          <span className="text-[10.5px] font-bold text-slate-300 block">이중화 전용회선 미할당 안내</span>
                          <p className="text-[9.5px] text-slate-500 leading-normal">
                            현재 수집 연동된 SCP Seoul Region 및 가상 사설 망(VPC) 인프라 환경 내에는 Dedicated 전용회선이나 IPSec VPN 백업 회선이 구성되어 있지 않습니다.
                          </p>
                          <span className="text-[8px] font-mono text-sky-500 bg-sky-950/40 px-1.5 py-0.5 rounded inline-block">
                            ※ 회선 우회 제어 탭 비활성화 완료
                          </span>
                        </div>
                      ) : (
                        /* 시뮬레이터 가상 환경 시 활성 제어 뷰 */
                        <div className="space-y-4">
                          {/* 📉 실시간 Latency & Packet Loss 품질 비교 차트 신설 */}
                          <div className="space-y-1 bg-slate-950 p-2.5 rounded border border-slate-900">
                            <div className="text-[8px] font-mono text-slate-500 uppercase flex justify-between">
                              <span>Line Quality Metrics (Latency)</span>
                              <span className="text-slate-400">Target: 서울-대전 전용선</span>
                            </div>
                            <div className="h-[65px] w-full relative flex items-end">
                              <svg className="absolute inset-0 h-full w-full">
                                <line x1="0" y1="16" x2="300" y2="16" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
                                <line x1="0" y1="32" x2="300" y2="32" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
                                <line x1="0" y1="48" x2="300" y2="48" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
                                
                                <path
                                  d={networkPaths.dedicated.status === 'ACTIVE' 
                                    ? "M 0 55 L 40 54 L 80 56 L 120 53 L 160 55 L 200 52 L 240 55 L 280 54"
                                    : "M 0 55 L 40 54 L 80 56 L 120 15 L 160 10 L 200 8 L 240 12 L 280 15"
                                  }
                                  fill="none"
                                  stroke={networkPaths.dedicated.status === 'ACTIVE' ? "#1d8102" : "#d13212"}
                                  strokeWidth="1.5"
                                />
                                
                                <path
                                  d="M 0 45 L 40 43 L 80 44 L 120 46 L 160 43 L 200 45 L 240 42 L 280 44"
                                  fill="none"
                                  stroke="#0073bb"
                                  strokeWidth="1.2"
                                  strokeDasharray="2,2"
                                />
                              </svg>
                              <div className="absolute right-1 top-1 text-[6.5px] font-mono text-slate-500 bg-slate-900 p-0.5 rounded">
                                {networkPaths.dedicated.status === 'ACTIVE' ? 'Dedicated: 12ms (Normal)' : 'Dedicated: 185ms (Degraded)'}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2 text-[10px]">
                            <div className="p-2.5 border rounded border-slate-700 bg-slate-900 flex justify-between items-center font-mono">
                              <div>
                                <div className="font-bold text-slate-200">전용회선 (Dedicated)</div>
                                <div className="text-[8px] text-slate-400">Packet Loss: {(networkPaths.dedicated.packet_loss * 100).toFixed(1)}%</div>
                              </div>
                              <span className={`px-1.5 py-0.5 rounded font-extrabold text-[8px] ${networkPaths.dedicated.status === 'ACTIVE' ? 'bg-[#1d8102] text-white' : 'bg-gray-400 text-white'}`}>
                                {networkPaths.dedicated.status}
                              </span>
                            </div>

                            <div className="p-2.5 border rounded border-slate-700 bg-slate-900 flex justify-between items-center font-mono">
                              <div>
                                <div className="font-bold text-slate-200">백업 VPN (Standby)</div>
                                <div className="text-[8px] text-slate-400">Bandwidth: {networkPaths.vpn.bandwidth_mbps} Mbps</div>
                              </div>
                              <span className={`px-1.5 py-0.5 rounded font-extrabold text-[8px] ${networkPaths.vpn.status === 'ACTIVE' ? 'bg-[#0073bb] text-white' : 'bg-gray-400 text-white'}`}>
                                {networkPaths.vpn.status}
                              </span>
                            </div>

                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={async () => {
                                  const res = await fetchFromBackend(`/monitor/network/bypass?action=trigger`, { method: 'POST' });
                                  if (res) {
                                    setNetworkPaths(res);
                                    await loadData(activeCsp);
                                  }
                                }}
                                className="flex-1 bg-[#d13212] hover:bg-[#b0280d] text-white font-bold p-2 rounded text-[10px] transition-all cursor-pointer text-center"
                              >
                                💥 회선 장애 주입
                              </button>
                              <button
                                onClick={async () => {
                                  const res = await fetchFromBackend(`/monitor/network/bypass?action=recover`, { method: 'POST' });
                                  if (res) {
                                    setNetworkPaths(res);
                                    await loadData(activeCsp);
                                  }
                                }}
                                className="flex-1 bg-[#1d8102] hover:bg-[#176602] text-white font-bold p-2 rounded text-[10px] transition-all cursor-pointer text-center"
                              >
                                ✅ 회선 정상 복구
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Level 4: SecOps SOAR 침입 IP 차단 대장 */}
                  {maturityLevel >= 4 && (
                    <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 rounded  p-4 space-y-3">
                      <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider border-b border-slate-800/60 pb-2">
                        🛡️ AI SecOps SOAR 침입 IP 차단
                      </h3>
                      
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="차단 IP 입력 (e.g. 185.220.101.5)"
                            value={newBlockIp}
                            onChange={(e) => setNewBlockIp(e.target.value)}
                            className="flex-1 border border-slate-700 bg-slate-900 p-1.5 rounded text-xs focus:outline-[#ec7211] font-mono text-slate-100 placeholder-slate-500"
                          />
                          <button
                            onClick={async () => {
                              if (!newBlockIp) return;
                              const res = await fetchFromBackend(`/monitor/security/soar?ip=${newBlockIp}`, { method: 'POST' });
                              if (res) {
                                setNewBlockIp('');
                                const updatedBlocked = await fetchFromBackend(`/monitor/security/blocked?provider=${activeCsp}`);
                                if (updatedBlocked) setBlockedIps(updatedBlocked);
                              }
                            }}
                            className="bg-[#232f3e] hover:bg-[#1a2530] text-white font-bold px-3 py-1.5 rounded text-xs transition-all cursor-pointer"
                          >
                            🚫 차단
                          </button>
                        </div>

                        <div className="border border-slate-700 rounded max-h-[110px] overflow-y-auto font-mono text-[10px] bg-slate-900/40">
                          <table className="w-full text-left">
                            <thead className="bg-slate-900/60 border-b border-slate-700 text-slate-400 font-bold uppercase text-[8px]">
                              <tr>
                                <th className="p-2">IP 주소</th>
                                <th className="p-2">상태</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                              {blockedIps.length === 0 ? (
                                <tr>
                                  <td colSpan={2} className="p-3 text-center text-slate-500">차단 규칙 없음</td>
                                </tr>
                              ) : (
                                blockedIps.map(ip => (
                                  <tr key={ip} className="hover:bg-slate-800/40">
                                    <td className="p-2 font-bold text-slate-200">{ip}</td>
                                    <td className="p-2"><span className="bg-[#d13212]/10 text-[#d13212] px-1 rounded text-[8px] font-bold">BLOCKED</span></td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 알림 위젯 목록 */}
                  <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 rounded ">
                    <div className="px-5 py-3 border-b border-slate-800/60 bg-slate-900/60 flex justify-between items-center">
                      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">🚨 SCP Cloud Monitoring Alarm History</h3>
                    </div>
                    <div className="p-4 space-y-3">
                      {incidents.filter(i => i.status === 'OPEN').length === 0 ? (
                        <div className="p-3 text-center text-[10px] text-slate-500 font-mono">
                          [INFO] // No active alarms.
                        </div>
                      ) : (
                        incidents.filter(i => i.status === 'OPEN').slice(0, 3).map((ev: any) => (
                          <div
                            key={ev.id}
                            className="p-3 bg-slate-900/50 border border-slate-700/60 border-l-4 rounded flex justify-between items-center cursor-pointer hover:bg-slate-800/80 transition-all border-l-orange-500"
                            onClick={() => { setActiveMenu('incidents'); loadIncidentDetail(ev.id); }}
                          >
                            <div>
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ev.severity === 'CRITICAL' ? '#d13212' : '#ec7211' }} />
                                <h4 className="font-bold text-slate-200 text-[10px]">{ev.title}</h4>
                              </div>
                              <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{ev.description}</p>
                            </div>
                            <span className="text-[8px] font-mono text-slate-500">{ev.severity}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  
                </div>
              </div>

            </div>
          )}

          {/* B. 인시던트 허브 (Incidents Hub) */}
          {activeMenu === 'incidents' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Incidents Control Hub</h2>
                <p className="text-xs text-slate-400 mt-1">L2 이상탐지 및 L3 알람 폭풍 제어를 통해 자동 요약 승격된 조치 대상 장애 목록입니다.</p>
              </div>

              {/* 라이선스 만료 경고 슬라이드 노출 */}
              {(license.is_expired || !license.is_valid) && (
                <div className="p-4 bg-red-950/30 border border-red-900/50 text-red-400 text-xs rounded font-bold">
                  🚨 시스템 라이선스가 만료되었거나 서명이 손상되었습니다. 자동조치 승인 및 상태 변경 CUD 쓰기 요청이 잠금 차단(Read-Only)되었습니다.
                </div>
              )}

              <div className="grid grid-cols-3 gap-8">
                {/* 장애 목록 테이블 (좌측 2열 크기) */}
                <div className="col-span-2 bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 rounded ">
                  <div className="px-6 py-4 border-b border-slate-800/60 bg-slate-900/60">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Active Incident Queue</h3>
                  </div>
                  <div className="overflow-y-auto max-h-[500px]">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800/60 bg-slate-900/40 text-slate-400 uppercase font-semibold">
                          <th className="py-3 px-4">Severity</th>
                          <th className="py-3 px-4">Incident Title</th>
                          <th className="py-3 px-4">State</th>
                          <th className="py-3 px-4">Owner</th>
                          <th className="py-3 px-4 text-right">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {incidents.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-12 text-center">
                              <div className="text-2xl mb-2">🎉</div>
                              <span className="text-[11px] font-bold text-emerald-400 block">활성 장애 인시던트가 없습니다</span>
                              <p className="text-[9.5px] text-slate-500 mt-1">모든 수집 노드가 정상 범주(Baseline) 내에서 원활히 가동 중입니다.</p>
                            </td>
                          </tr>
                        ) : (
                          incidents.map((inc: any) => (
                            <tr
                              key={inc.id}
                              onClick={() => loadIncidentDetail(inc.id)}
                              className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${selectedIncidentId === inc.id ? 'bg-slate-800 font-bold border-l-4 border-l-[#ec7211]' : ''}`}
                            >
                              <td className="py-3.5 px-4">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${inc.severity === 'CRITICAL' ? 'bg-red-950/40 text-red-400 border border-red-900/30' : 'bg-orange-950/40 text-orange-400 border border-orange-900/30'}`}>
                                  {inc.severity}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-slate-200">{inc.title}</td>
                              <td className="py-3.5 px-4">
                                <span className={`text-[10px] font-bold ${inc.status === 'OPEN' ? 'text-red-400' : (inc.status === 'RESOLVED' ? 'text-green-400' : 'text-blue-400')}`}>
                                  {inc.status}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-slate-400 font-mono text-[10px]">{inc.assigned_to ? inc.assigned_to.split('@')[0] : 'Unassigned'}</td>
                              <td className="py-3.5 px-4 text-right text-slate-500 font-mono">{inc.created_at.split('T')[1].substring(0, 5)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 장애 상세 추적 및 AI 어시스턴트 (우측 1열 크기) */}
                <div className="space-y-6">
                  {incidentDetail ? (
                    <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 p-6 rounded  space-y-6">
                      <div>
                        <span className="text-[10px] text-slate-400 font-mono">Incident # {incidentDetail.incident.id}</span>
                        <h3 className="font-bold text-base text-slate-100 mt-1">{incidentDetail.incident.title}</h3>
                        <p className="text-xs text-slate-300 mt-2 bg-slate-900 p-2.5 border border-slate-700 rounded">{incidentDetail.incident.description}</p>
                      </div>

                      {/* 상태 변경 제어 판넬 */}
                      <div className="flex gap-2 border-t border-b border-slate-700 py-3.5">
                        <button
                          onClick={() => handleUpdateIncidentStatus(incidentDetail.incident.id, 'INVESTIGATING', true)}
                          className="flex-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold py-1.5 rounded cursor-pointer transition-colors"
                          disabled={license.is_expired || !license.is_valid}
                        >
                          조치 착수
                        </button>
                        <button
                          onClick={() => handleUpdateIncidentStatus(incidentDetail.incident.id, 'RESOLVED')}
                          className="flex-1 bg-[#1d8102] hover:bg-[#155a01] text-white text-xs font-bold py-1.5 rounded cursor-pointer transition-colors"
                          disabled={license.is_expired || !license.is_valid}
                        >
                          장애 해결
                        </button>
                      </div>

                      {/* AIOps 복합 진단 판넬 (RCA / RCA Timeline 탭 분리형) */}
                      <div className="space-y-4">
                        <div className="flex bg-slate-900/80 p-0.5 rounded border border-slate-800">
                          <button
                            onClick={() => setActiveDetailTab('rca')}
                            className={`flex-1 text-center py-1.5 rounded text-[10px] font-extrabold transition-all cursor-pointer ${
                              activeDetailTab === 'rca' ? 'bg-[#0073bb] text-white' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            💡 AI RCA 진단
                          </button>
                          <button
                            onClick={() => {
                              setActiveDetailTab('timeline');
                              if (timelineCards.length === 0) loadTimelineCards(incidentDetail.incident.id);
                            }}
                            className={`flex-1 text-center py-1.5 rounded text-[10px] font-extrabold transition-all cursor-pointer ${
                              activeDetailTab === 'timeline' ? 'bg-[#0073bb] text-white' : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            ⏱️ RCA 타임라인 카드
                          </button>
                        </div>

                        {activeDetailTab === 'rca' ? (
                          <div className="space-y-3">
                            <button
                              onClick={() => handleRunAiRca(incidentDetail.incident.id)}
                              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold py-2 rounded text-xs cursor-pointer  flex items-center justify-center gap-1.5"
                              disabled={isRcaLoading}
                            >
                              {isRcaLoading ? 'AI 분석 중...' : '🔮 AI 원인 분석 실행 (RCA)'}
                            </button>

                            {aiRca && (
                              <div className="bg-slate-900/60 border border-slate-800 p-4.5 rounded text-xs space-y-4 text-slate-200">
                                <div>
                                  <div className="font-extrabold text-[#ff9900] text-[11px] uppercase tracking-wide">💡 AI Incident Summary:</div>
                                  <p className="mt-1 font-semibold leading-relaxed text-slate-300">{aiRca.summary}</p>
                                </div>
                                <div>
                                  <div className="font-extrabold text-sky-400 text-[11px] uppercase tracking-wide">🔍 Probable Root Cause:</div>
                                  <p className="mt-1 text-slate-300 leading-relaxed">{aiRca.probable_cause}</p>
                                </div>
                                <div>
                                  <div className="font-extrabold text-emerald-400 text-[11px] uppercase tracking-wide">📋 Recommended Runbook Action:</div>
                                  <p className="mt-1 text-slate-300 leading-relaxed font-mono whitespace-pre-wrap bg-slate-950 p-2.5 border border-slate-800 rounded">{aiRca.recommended_runbook}</p>
                                  
                                  {/* AI Copilot 원클릭 런북 실행 런쳐 */}
                                  {incidentDetail.incident.status !== 'RESOLVED' && (
                                    <button
                                      onClick={() => handleRunActionScript(incidentDetail.incident.id, aiRca.recommended_runbook)}
                                      className="w-full mt-2.5 bg-[#ec7211] hover:bg-[#d85d00] text-white font-extrabold py-2 rounded text-[10px] shadow transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                      disabled={isExecutingScript}
                                    >
                                      {isExecutingScript ? '런북 스크립트 실행 중...' : '⚡ AI Copilot 런북 실행'}
                                    </button>
                                  )}
                                </div>

                                {/* ⌨️ AIOps Sandbox Terminal */}
                                {terminalLog && (
                                  <div className="border border-slate-800 rounded bg-slate-950 p-3 space-y-2">
                                    <div className="flex items-center gap-2 border-b border-slate-900 pb-1.5">
                                      <span className="h-2 w-2 rounded-full bg-red-500" />
                                      <span className="h-2 w-2 rounded-full bg-yellow-500" />
                                      <span className="h-2 w-2 rounded-full bg-green-500" />
                                      <span className="text-[8px] text-slate-500 font-mono pl-2">AIOps Sandbox Terminal</span>
                                    </div>
                                    <pre className="font-mono text-[9px] text-[#38bdf8] leading-normal whitespace-pre-wrap max-h-[140px] overflow-y-auto">{terminalLog}</pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          /* ⏱️ RCA Timeline Card Stream 렌더링 */
                          <div className="space-y-4">
                            {isRcaLoading ? (
                              /* 🌀 가이드라인 충족: 레이아웃 치수와 1:1 매칭되는 스켈레톤 로더 */
                              <div className="space-y-3.5 animate-pulse pl-5 border-l border-slate-900">
                                {[1, 2, 3].map((n) => (
                                  <div key={n} className="p-3 bg-[#0d121f] border border-slate-800/80 rounded space-y-2">
                                    <div className="flex justify-between">
                                      <div className="h-3 w-1/3 bg-slate-800 rounded" />
                                      <div className="h-2 w-12 bg-slate-800 rounded" />
                                    </div>
                                    <div className="h-2.5 w-full bg-slate-800/60 rounded" />
                                    <div className="h-2 w-2/3 bg-slate-800/40 rounded" />
                                  </div>
                                ))}
                              </div>
                            ) : timelineCards.length === 0 ? (
                              <div className="p-6 text-center text-slate-500 font-mono text-[10px]">[INFO] No timeline details registered. Try running AI RCA.</div>
                            ) : (
                              <div className="relative pl-5 border-l border-slate-800 space-y-4">
                                {timelineCards.map((card, idx) => {
                                  const colors: Record<string, string> = {
                                    TRIGGERED: 'border-red-500 bg-red-950/20 text-red-400',
                                    ANOMALY_DETECT: 'border-orange-500 bg-orange-950/20 text-orange-400',
                                    CORRELATION: 'border-sky-500 bg-sky-950/20 text-sky-400',
                                    RECOMMENDATION: 'border-emerald-500 bg-emerald-950/20 text-emerald-400'
                                  };
                                  return (
                                    <div key={idx} className="relative space-y-1">
                                      <span className={`absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 ${
                                        card.event_type === 'TRIGGERED' ? 'bg-red-500 border-slate-950' : 'bg-slate-900 border-slate-700'
                                      }`} />
                                      <div className={`p-3 rounded border ${colors[card.event_type] || 'border-slate-800 bg-slate-900/60'}`}>
                                        <div className="flex justify-between items-center">
                                          <span className="font-bold text-[10px]">{card.title}</span>
                                          <span className="text-[7.5px] font-mono opacity-65">{card.timestamp.split('T')[1].substring(0, 8)}</span>
                                        </div>
                                        <p className="text-[9.5px] text-slate-300 mt-1 leading-relaxed">{card.description}</p>
                                        
                                        {card.meta && (
                                          <div className="mt-2 pt-1.5 border-t border-slate-800/40 text-[8.5px] font-mono text-slate-400 space-y-0.5">
                                            {Object.entries(card.meta).map(([k, v]: any) => (
                                              <div key={k} className="flex justify-between">
                                                <span className="opacity-70">{k}:</span>
                                                <span className="font-bold text-slate-200 truncate max-w-[150px]">{v}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* SCP Cloud Activity History (Trail) */}
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider border-b border-[#eaeded] pb-1.5">SCP Cloud Activity History (Trail)</h4>
                        <div className="space-y-3 pl-2.5 border-l-2 border-gray-200">
                          {incidentDetail.timeline.map((time: any) => {
                            let bulletColor = 'bg-gray-400';
                            if (time.event_type === 'remediation') bulletColor = 'bg-blue-600 animate-pulse';
                            if (time.event_type === 'remediation_log') bulletColor = 'bg-[#1d8102]';
                            if (time.event_type === 'create') bulletColor = 'bg-[#d13212]';
                            if (time.event_type === 'status_change' && time.message.includes('RESOLVED')) bulletColor = 'bg-[#1d8102]';
                            
                            return (
                              <div key={time.id} className="relative pb-1">
                                <span className={`absolute -left-[15px] top-1 h-2 w-2 rounded-full ${bulletColor}`} />
                                <div className="text-[10px] text-gray-400 font-mono">{time.created_at.split('T')[1].substring(0, 5)} // {time.actor}</div>
                                <p className="text-xs text-gray-700 font-medium mt-0.5 whitespace-pre-wrap">{time.message}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-white border border-[#eaeded] rounded text-center text-xs text-gray-400 font-mono ">
                      [Select an incident from the queue to view details & run AI RCA diagnostics]
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* C. 리소스 토폴로지 화면 (Obsidian 스타일 물리엔진 교체 완료) */}
          {activeMenu === 'topology' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 tracking-tight">인터랙티브 물리엔진 토폴로지 맵</h2>
                <p className="text-xs text-slate-400 mt-1">Obsidian의 3D 관계 그래프 구조로 설계된 캔버스 맵입니다. 리소스를 마우스로 튕기고 회전하여 상호 연계를 파악하십시오.</p>
              </div>

              {/* 물리엔진 캔버스 컴포넌트 마운트 */}
              {topoViewMode === 'graph' ? (
                <ForceTopology
                  topology={topology}
                  activeCsp={activeCsp}
                  selectedNode={selectedNode}
                  onSelectNode={(id) => { setSelectedNode(id); }}
                />
              ) : (
                <HierarchicalTreeView
                  topology={topology}
                  activeCsp={activeCsp}
                  selectedNode={selectedNode}
                  onSelectNode={(id) => { setSelectedNode(id); }}
                />
              )}

              {/* 자산 목록 */}
              <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 rounded ">
                <div className="px-6 py-4 border-b border-slate-800/60 bg-slate-900/60">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">리소스 테이블 리스트</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800/60 bg-slate-900/40 text-slate-400 uppercase font-semibold">
                        <th className="py-3 px-6">Instance ID</th>
                        <th className="py-3 px-6">Instance Name</th>
                        <th className="py-3 px-6">Type</th>
                        <th className="py-3 px-6">State</th>
                        <th className="py-3 px-6">Cloud Provider</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {topology.nodes.map((node: any) => (
                        <tr key={node.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-6 font-mono text-[11px] text-slate-400">{node.id}</td>
                          <td className="py-3 px-6 text-slate-100 font-bold">{node.label}</td>
                          <td className="py-3 px-6 font-mono text-[11px] text-[#0073bb] uppercase">{node.type}</td>
                          <td className="py-3 px-6">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${node.status === 'warning' ? 'bg-orange-950/40 text-orange-400 border border-orange-900/30' : 'bg-green-950/40 text-green-400 border border-green-900/30'}`}>
                              {node.status}
                            </span>
                          </td>
                          <td className="py-3 px-6 font-mono text-[11px] uppercase text-slate-400">{node.provider}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeMenu === 'metrics' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 tracking-tight">SCP Cloud Monitoring Metrics</h2>
                <p className="text-xs text-slate-400 mt-1">인프라 인스턴스들의 리소스 임계 성능을 분석 그래프로 표시합니다.</p>
              </div>
              
              <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 p-6 rounded ">
                <div className="grid grid-cols-3 gap-6 mb-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-200 uppercase mb-2">Instance Node</label>
                    <select
                      className="w-full border border-slate-700 rounded p-2 text-xs text-slate-100 bg-slate-900 focus:outline-[#ff9900]"
                      value={selectedNode}
                      onChange={(e) => setSelectedNode(e.target.value)}
                    >
                      {topology.nodes.filter((n: any) => ['vm', 'database', 'loadbalancer'].includes(n.type)).map((n: any) => (
                        <option key={n.id} value={n.id} className="bg-slate-900">{n.label} ({n.id})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-200 uppercase mb-2">Metric Dimension</label>
                    <select
                      className="w-full border border-slate-700 rounded p-2 text-xs text-slate-100 bg-slate-900 focus:outline-[#ff9900]"
                      value={selectedMetric}
                      onChange={(e) => setSelectedMetric(e.target.value)}
                    >
                      <option value="cpu" className="bg-slate-900">CPUUtilization (%)</option>
                      <option value="memory" className="bg-slate-900">MemoryUtilization (%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-200 uppercase mb-2">Period Range</label>
                    <select
                      className="w-full border border-slate-700 rounded p-2 text-xs text-slate-100 bg-slate-900 focus:outline-[#ff9900]"
                      value={metricsDuration}
                      onChange={(e) => setMetricsDuration(parseInt(e.target.value))}
                    >
                      <option value="30" className="bg-slate-900">Last 30 Minutes</option>
                      <option value="60" className="bg-slate-900">Last 1 Hour</option>
                      <option value="120" className="bg-slate-900">Last 2 Hours</option>
                    </select>
                  </div>
                </div>

                {/* CloudWatch 차트 */}
                {metrics.length > 0 ? (
                  <div className="border border-slate-700 p-6 rounded bg-slate-950 relative">
                    <h4 className="text-slate-100 font-bold text-xs uppercase mb-4">{selectedNode} - Metrics Graph</h4>
                    <svg width="100%" height="240" viewBox="0 0 800 240" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="cloudwatchGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.08" />
                          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* 가로 그리드 */}
                      <line x1="50" y1="20" x2="780" y2="20" stroke="rgba(255, 255, 255, 0.025)" strokeWidth="1" />
                      <line x1="50" y1="70" x2="780" y2="70" stroke="rgba(255, 255, 255, 0.025)" strokeWidth="1" />
                      <line x1="50" y1="120" x2="780" y2="120" stroke="rgba(255, 255, 255, 0.025)" strokeWidth="1" />
                      <line x1="50" y1="170" x2="780" y2="170" stroke="rgba(255, 255, 255, 0.025)" strokeWidth="1" />
                      <line x1="50" y1="220" x2="780" y2="220" stroke="#334155" strokeWidth="1.5" />

                      {/* Y축 라벨 */}
                      <text x="12" y="24" fill="#64748b" className="num text-[10px] font-bold">100%</text>
                      <text x="12" y="124" fill="#64748b" className="num text-[10px] font-bold">50%</text>
                      <text x="12" y="224" fill="#64748b" className="num text-[10px] font-bold">0%</text>

                      {(() => {
                        const width = 730;
                        const height = 200;
                        const pointsCount = metrics.length;
                        const xStep = width / (pointsCount - 1);
                        
                        let pathLine = '';
                        let pathArea = '';
                        
                        metrics.forEach((m, idx) => {
                          const x = 50 + idx * xStep;
                          const y = 220 - (m.value / 100) * height;
                          
                          if (idx === 0) {
                            pathLine += `M ${x} ${y}`;
                            pathArea += `M ${x} 220 L ${x} ${y}`;
                          } else {
                            pathLine += ` L ${x} ${y}`;
                            pathArea += ` L ${x} ${y}`;
                          }
                          
                          if (idx === pointsCount - 1) {
                            pathArea += ` L ${x} 220 Z`;
                          }
                        });

                        return (
                          <>
                            <path d={pathArea} fill="url(#cloudwatchGrad)" />
                            <path d={pathLine} fill="none" stroke="#22d3ee" strokeWidth="2" />
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500 font-mono">[No metrics data populated]</div>
                )}
              </div>
            </div>
          )}

          {/* E. 로그 및 알람 화면 */}
          {activeMenu === 'logs' && (
            <div className="grid grid-cols-2 gap-8">
              <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 p-6 rounded ">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-4">📰 CloudWatch Logs Stream</h3>
                <div className="space-y-2 h-[450px] overflow-y-auto pr-2 font-mono text-[11px] leading-relaxed">
                  {logs.map((log: any, idx: number) => {
                    const levelColors: any = { error: 'text-red-400', warning: 'text-[#ec7211]', info: 'text-sky-400' };
                    return (
                      <div key={idx} className="pb-2 border-b border-slate-700/60 flex gap-3.5">
                        <span className="text-slate-500">{log.timestamp.split('T')[1].replace('Z', '')}</span>
                        <span className={`font-bold uppercase ${levelColors[log.level] || 'text-slate-500'}`}>
                          [{log.level}]
                        </span>
                        <span className="text-slate-300">{log.message}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 p-6 rounded ">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-4">🚨 Alarm Severity Log</h3>
                <div className="space-y-4">
                  {events.map((ev: any) => (
                    <div key={ev.id} className="p-4 bg-slate-900/60 border border-slate-700 rounded hover:border-slate-500 transition-colors">
                      <div className="flex justify-between items-center mb-2">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${ev.severity === 'CRITICAL' ? 'bg-red-950/40 text-red-400 border border-red-900/30' : 'bg-orange-950/40 text-orange-400 border border-orange-900/30'}`}>
                          {ev.severity}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{ev.created_at}</span>
                      </div>
                      <h4 className="font-bold text-slate-200 text-xs mb-1">{ev.title}</h4>
                      <p className="text-xs text-slate-400">{ev.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeMenu === 'costs' && (
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-slate-100 tracking-tight">SCP Billing & Cost Manager & FinOps Analyzer</h2>
                  <p className="text-xs text-slate-400 mt-1">당월 리소스 비용 사용 내역 및 Trusted Advisor/리소스 부하(CPU) 기반 권장 Rightsizing 분석 보고서입니다.</p>
                </div>
                <button
                  onClick={handleGenerateMonthlyReport}
                  className="bg-[#ec7211] hover:bg-[#d85d00] text-white font-bold px-4 py-2 rounded text-xs transition-all  cursor-pointer"
                  disabled={isReportLoading}
                >
                  {isReportLoading ? '보고서 작성 중...' : '📋 월간 운영 보고서 AI 초안 작성'}
                </button>
              </div>

              {/* 비용 이상 급증 감지 (Cost Anomaly Alert Banner) */}
              {costAnomalies.length > 0 && (
                <div className="space-y-3">
                  {costAnomalies.map((anom, idx) => (
                    <div key={idx} className="p-4 bg-red-950/20 border border-red-900/50 border-l-4 border-l-[#d13212] rounded flex justify-between items-center text-xs">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-extrabold text-[#d13212] uppercase tracking-wider">🚨 [FinOps 비용 이상 폭증 감지]</span>
                          <span className="font-mono text-slate-400">{anom.date}</span>
                        </div>
                        <p className="text-slate-200 leading-relaxed font-semibold">{anom.reason}</p>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-red-400 font-extrabold text-sm">+${anom.difference.toFixed(2)} / Day</div>
                        <div className="text-[10px] text-slate-500">Avg: ${anom.average_amount.toFixed(2)} → Peak: ${anom.anomaly_amount.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 월간 운영 보고서 마크다운 팝업 */}
              {monthlyReport && (
                <div className="bg-slate-900 border border-slate-700 p-6 rounded  space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">📋 AI Generated Monthly Executive Report Draft</h3>
                    <button 
                      onClick={() => { navigator.clipboard.writeText(monthlyReport); alert('보고서가 클립보드에 복사되었습니다.'); }}
                      className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[10px] font-bold py-1 px-2.5 rounded cursor-pointer transition-all"
                    >
                      📋 복사하기 (Copy)
                    </button>
                  </div>
                  <pre className="font-mono text-xs text-slate-300 bg-slate-950 p-6 border border-slate-800 rounded max-h-[400px] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {monthlyReport}
                  </pre>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 p-6 rounded ">
                  <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Unblended Cost (M-T-D)</h4>
                  <p className="text-3xl font-extrabold text-slate-100">${parseFloat(costs?.monthly_total || 0).toFixed(2)}</p>
                </div>
                <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 p-6 rounded ">
                  <h4 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Daily Cost Average</h4>
                  <p className="text-3xl font-extrabold text-slate-100">${parseFloat(costs?.daily_average || 0).toFixed(2)}</p>
                </div>
              </div>

              {/* 비용 바 차트 */}
              {costs?.daily_trends && (
                <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 p-6 rounded ">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-6">📅 Daily Billing Costs (AP-NORTHEAST-2)</h3>
                  <div className="border border-slate-700 p-6 rounded bg-slate-950">
                    <svg width="100%" height="150" viewBox="0 0 700 150" preserveAspectRatio="none">
                      {costs.daily_trends.map((item: any, idx: number) => {
                        const amountVal = parseFloat(item.amount || 0);
                        const maxVal = Math.max(...costs.daily_trends.map((d: any) => parseFloat(d.amount || 0)));
                        const height = (amountVal / (maxVal || 1)) * 100;
                        const x = 50 + idx * 90;
                        const y = 120 - height;
                        return (
                          <g key={idx}>
                            <rect x={x} y={y} width="32" height={height} fill="#0073bb" rx="2" />
                            <text x={x + 2} y="142" fill="#7f8c8d" fontSize="9" fontWeight="bold">{item.date.split('-')[2]}일</text>
                            <text x={x - 4} y={y - 8} fill="#2c3e50" fontSize="9" fontWeight="extrabold">${amountVal.toFixed(0)}</text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              )}

              {/* Rightsizing 추천 */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">💡 AWS Trusted Advisor Rightsizing Recommendations</h3>
                <div className="grid grid-cols-2 gap-6">
                  {costs?.recommendations?.map((rec: any, idx: number) => (
                    <div key={idx} className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 p-6 rounded ">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-[#ec7211]" />
                          <h4 className="font-bold text-slate-200 text-xs">Resource: <code>{rec.node_id}</code></h4>
                        </div>
                        <span className="bg-green-950/40 text-green-400 border border-green-900/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          -${parseFloat(rec.savings || 0).toFixed(2)} / Month
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mb-2 leading-relaxed"><strong>진단 내역</strong>: {rec.reason}</p>
                      <p className="text-xs text-slate-300 mb-4 font-semibold"><strong>조치 권고</strong>: {rec.action}</p>
                      <div className="flex justify-between text-[11px] font-mono text-slate-500 border-t border-slate-800 pt-3">
                        <span>Current Fee: ${parseFloat(rec.current_monthly_cost || 0).toFixed(2)}</span>
                        <span>Optimized Fee: ${parseFloat(rec.target_monthly_cost || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 실시간 리소스 기반 Rightsizing 추천 (Dynamic Rightsizing) */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">📊 Real-time Performance-based Rightsizing recommendations</h3>
                {rightsizingRecommendations.length === 0 ? (
                  /* 최적화 비활성 안전 가이드 카드 노출 */
                  <div className="p-8 bg-[#0d121f] border border-slate-800/80 border border-slate-700/60 rounded  text-center space-y-2">
                    <span className="text-2xl block">✅</span>
                    <span className="text-[11px] font-bold text-emerald-400 block">비용 최적화 안정 상태</span>
                    <p className="text-[9.5px] text-slate-400 max-w-md mx-auto leading-normal">
                      현재 가동 중인 모든 SCP 가상서버들이 최적의 리소스 점유율(CPU 15%~75%)을 유지하고 있습니다. 오버 프로비저닝 상태의 유휴 서버가 감지되지 않아 추가 다운사이징이 필요 없습니다.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-6">
                    {rightsizingRecommendations.map((rec: any, idx: number) => {
                      const isSimulating = selectedSimNode === rec.node_id;
                      return (
                        <div
                          key={idx}
                          onClick={() => handleSimulateRightsizing(rec.node_id)}
                          className={`bg-[#0d121f] border border-slate-800/80 p-6 rounded  flex flex-col justify-between cursor-pointer transition-all border ${
                            isSimulating ? 'border-sky-500 bg-slate-900/60' : 'border-slate-800/60 hover:border-slate-600'
                          }`}
                        >
                          <div>
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${rec.action.includes('Downgrade') || rec.action.includes('Scale-Down') ? 'bg-[#ff9900]' : 'bg-[#d13212]'}`} />
                                <h4 className="font-bold text-slate-200 text-xs">{rec.node_label} (<code>{rec.node_id}</code>)</h4>
                              </div>
                              {rec.savings > 0 && (
                                <span className="bg-green-950/40 text-green-400 border border-green-900/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  Savings: -₩{rec.savings.toLocaleString()} / Month
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 mb-2 leading-relaxed"><strong>진단 내역</strong>: {rec.reason} (최근 CPU 평균: {rec.avg_cpu.toFixed(1)}%)</p>
                            <p className="text-xs text-slate-300 mb-4 font-semibold"><strong>조치 권고</strong>: {rec.action} - {rec.recommendation_text}</p>
                          </div>
                          
                          {/* 🔮 Rightsizing 부하 변화 예측 시뮬레이션 SVG 영역 그래프 차트 오버레이 */}
                          {isSimulating && rightsizingSimulation.length > 0 && (
                            <div className="mb-4 pt-3 border-t border-slate-800 space-y-2" onClick={(e) => e.stopPropagation()}>
                              <div className="text-[8.5px] font-bold text-sky-400 flex justify-between font-mono">
                                <span>🔮 축소 시 예상 부하 시뮬레이션</span>
                                <span className="text-[7.5px] text-slate-500 uppercase">Interactive Area Chart</span>
                              </div>
                              
                              <div className="h-[90px] w-full bg-slate-950/80 border border-slate-900 rounded relative overflow-hidden flex items-end p-1">
                                <svg className="absolute inset-0 h-full w-full">
                                  <line x1="0" y1="22.5" x2="450" y2="22.5" stroke="rgba(255,255,255,0.03)" strokeWidth="0.8" />
                                  <line x1="0" y1="45" x2="450" y2="45" stroke="rgba(255,255,255,0.03)" strokeWidth="0.8" />
                                  <line x1="0" y1="67.5" x2="450" y2="67.5" stroke="rgba(255,255,255,0.03)" strokeWidth="0.8" />
                                  
                                  {/* 1. 원래 CPU 영역 그래프 (파란색) */}
                                  <path
                                    d={`M 0 90 ${rightsizingSimulation.map((pt, pIdx) => {
                                      const x = (pIdx / (rightsizingSimulation.length - 1)) * 360;
                                      const y = 90 - (pt.original_value * 0.8);
                                      return `L ${x} ${y}`;
                                    }).join(' ')} L 360 90 Z`}
                                    fill="rgba(0, 115, 187, 0.06)"
                                    stroke="rgba(0, 115, 187, 0.7)"
                                    strokeWidth="1.2"
                                  />
                                  
                                  {/* 2. 다운사이징 후 예상 CPU 영역 그래프 (주황색) */}
                                  <path
                                    d={`M 0 90 ${rightsizingSimulation.map((pt, pIdx) => {
                                      const x = (pIdx / (rightsizingSimulation.length - 1)) * 360;
                                      const y = 90 - (pt.simulated_value * 0.8);
                                      return `L ${x} ${y}`;
                                    }).join(' ')} L 360 90 Z`}
                                    fill="rgba(236, 114, 17, 0.05)"
                                    stroke="rgba(236, 114, 17, 0.75)"
                                    strokeWidth="1.2"
                                    strokeDasharray="2,2"
                                  />
                                </svg>
                                
                                <div className="absolute right-1 top-1 text-[7px] font-mono space-y-0.5 bg-slate-900/90 border border-slate-800 p-1 rounded">
                                  <div className="flex items-center gap-1"><span className="h-1.5 w-1.5 bg-[#0073bb] rounded-full inline-block" /> Current CPU</div>
                                  <div className="flex items-center gap-1"><span className="h-1.5 w-1.5 bg-[#ec7211] rounded-full inline-block" /> Simulated CPU</div>
                                </div>
                              </div>
                              
                              <div className="text-[9px] text-slate-400 font-mono text-center">
                                적용 후 예상 CPU 피크 부하: max {(Math.max(...rightsizingSimulation.map(pt => pt.simulated_value))).toFixed(1)}% (안전성 승인 통과)
                              </div>
                            </div>
                          )}

                          <div className="flex justify-between text-[11px] font-mono text-slate-500 border-t border-slate-800 pt-3">
                            <span>Current Monthly: ₩${rec.current_monthly_cost.toLocaleString()}</span>
                            <span>Target Monthly: ₩${rec.target_monthly_cost.toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* G. 룰 설정 및 감사로그 화면 */}
          {activeMenu === 'alerts' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Settings & Config Policies (설정 및 정책 관리)</h2>
                <p className="text-xs text-slate-400 mt-1">클라우드 API 연동 설정, 경보 수집 임계치 룰 관리 및 API 감사 로그 조회를 수행합니다.</p>
              </div>
              
              {/* 클라우드 OpenAPI 계정 연동 설정 카드 */}
              <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 p-6 rounded  space-y-4">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider border-b border-slate-800/60 pb-2 flex items-center gap-1.5">
                  <span>🔗</span> Samsung Cloud Platform V2 OpenAPI 계정 연동 및 등록
                </h3>
                <p className="text-xs text-slate-400">Access Key, Secret Key, Project ID를 입력하고 연동 테스트를 통과하면 보안 DEK 키로 봉투 암호화되어 DB에 자동 저장 및 토폴로지가 갱신됩니다.</p>
                
                <div className="bg-slate-900/50 border border-amber-800/30 rounded p-3 text-[10px] text-slate-400 mb-3">
                  엔드포인트 URL 패턴: <span className="text-emerald-400 font-mono">https://virtualserver.{'{'}region{'}'}.{'{'}env{'}'}.samsungsdscloud.com/v1/servers</span>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-amber-400 uppercase">환경 (Env)</label>
                    <select id="scp_env_settings" className="w-full border border-amber-700/50 p-2 rounded text-xs bg-slate-900 text-slate-100 focus:outline-[#ec7211]">
                      <option value="e">e — Enterprise (외부고객)</option>
                      <option value="s">s — Samsung 내부</option>
                      <option value="g">g — Sovereign</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-amber-400 uppercase">리전 (Region)</label>
                    <select id="scp_region_settings" className="w-full border border-amber-700/50 p-2 rounded text-xs bg-slate-900 text-slate-100 focus:outline-[#ec7211]">
                      <option value="kr-west1">kr-west1 (서울 서부)</option>
                      <option value="kr-east1">kr-east1 (서울 동부)</option>
                      <option value="kr-south1">kr-south1</option>
                      <option value="kr-south2">kr-south2</option>
                      <option value="kr-south3">kr-south3</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 items-end pt-2">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Access Key</label>
                      <button 
                        onClick={() => {
                          const input = document.getElementById('scp_access_key_settings') as HTMLInputElement;
                          if (input) input.type = input.type === 'password' ? 'text' : 'password';
                        }}
                        className="text-[9px] text-[#0073bb] hover:underline cursor-pointer"
                      >
                        👁️ 보기/숨기기
                      </button>
                    </div>
                    <input
                      type="password"
                      placeholder="SCP Access Key"
                      id="scp_access_key_settings"
                      className="w-full border border-slate-700 p-2 rounded text-xs focus:outline-[#ec7211] bg-slate-900 text-slate-100 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Secret Key</label>
                      <button 
                        onClick={() => {
                          const input = document.getElementById('scp_secret_key_settings') as HTMLInputElement;
                          if (input) input.type = input.type === 'password' ? 'text' : 'password';
                        }}
                        className="text-[9px] text-[#0073bb] hover:underline cursor-pointer"
                      >
                        👁️ 보기/숨기기
                      </button>
                    </div>
                    <input
                      type="password"
                      placeholder="SCP Secret Key"
                      id="scp_secret_key_settings"
                      className="w-full border border-slate-700 p-2 rounded text-xs focus:outline-[#ec7211] bg-slate-900 text-slate-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Project ID</label>
                      <button 
                        onClick={() => {
                          const input = document.getElementById('scp_project_id_settings') as HTMLInputElement;
                          if (input) input.type = input.type === 'password' ? 'text' : 'password';
                        }}
                        className="text-[9px] text-[#0073bb] hover:underline cursor-pointer"
                      >
                        👁️ 보기/숨기기
                      </button>
                    </div>
                    <input
                      type="password"
                      placeholder="SCP Project ID"
                      id="scp_project_id_settings"
                      className="w-full border border-slate-700 p-2 rounded text-xs focus:outline-[#ec7211] bg-slate-900 text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <button
                      onClick={async () => {
                        const ak = (document.getElementById('scp_access_key_settings') as HTMLInputElement)?.value;
                        const sk = (document.getElementById('scp_secret_key_settings') as HTMLInputElement)?.value;
                        const prj = (document.getElementById('scp_project_id_settings') as HTMLInputElement)?.value;
                        
                        if (!ak || !sk || !prj) {
                          alert("Access Key, Secret Key, Project ID를 모두 입력해주세요.");
                          return;
                        }
                        
                        try {
                          const res = await fetchFromBackend(`/credentials/test-scp?access_key=${encodeURIComponent(ak)}&secret_key=${encodeURIComponent(sk)}&project_id=${encodeURIComponent(prj)}&scp_env=${encodeURIComponent((document.getElementById('scp_env_settings') as HTMLSelectElement)?.value || 'e')}&scp_region=${encodeURIComponent((document.getElementById('scp_region_settings') as HTMLSelectElement)?.value || 'kr-west1')}`, { method: "POST" });
                          if (res) {
                            alert(`[${res.status}] ${res.message}\n연동 모드: ${res.mode}`);
                            if (res.status === "SUCCESS") {
                              await loadData(activeCsp);
                            }
                          }
                        } catch (err: any) {
                          alert("연동성 검증에 실패했습니다: " + err.message);
                        }
                      }}
                      className="w-full bg-[#0073bb] hover:bg-[#005c96] text-white font-bold p-2.5 rounded text-xs transition-all cursor-pointer text-center"
                    >
                      ⚡ 연동 검증 및 DB 저장
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-8">
                {/* 룰 추가 폼 */}
                <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 p-6 rounded ">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-6">🚨 Create Config Rule</h3>
                  <form onSubmit={handleAddRule} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">Rule Name</label>
                      <input
                        type="text"
                        className="w-full border border-slate-700 rounded p-2 text-xs text-slate-100 bg-slate-900"
                        value={newRuleName}
                        onChange={(e) => setNewRuleName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">Metric Dimension</label>
                      <select
                        className="w-full border border-slate-700 rounded p-2 text-xs text-slate-100 bg-slate-900"
                        value={newRuleMetric}
                        onChange={(e) => setNewRuleMetric(e.target.value)}
                      >
                        <option value="cpu" className="bg-slate-900">CPUUtilization</option>
                        <option value="memory" className="bg-slate-900">MemoryUtilization</option>
                        <option value="disk" className="bg-slate-900">DiskUtilization</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">Operator</label>
                      <select
                        className="w-full border border-slate-700 rounded p-2 text-xs text-slate-100 bg-slate-900"
                        value={newRuleOperator}
                        onChange={(e) => setNewRuleOperator(e.target.value)}
                      >
                        <option value="gt" className="bg-slate-900">Greater Than (&gt;)</option>
                        <option value="lt" className="bg-slate-900">Less Than (&lt;)</option>
                        <option value="eq" className="bg-slate-900">Equal (=)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">Threshold (%)</label>
                      <input
                        type="number"
                        className="w-full border border-slate-700 rounded p-2 text-xs text-slate-100 bg-slate-900"
                        value={newRuleThreshold}
                        onChange={(e) => setNewRuleThreshold(parseFloat(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">Duration (Minutes)</label>
                      <input
                        type="number"
                        className="w-full border border-slate-700 rounded p-2 text-xs text-slate-100 bg-slate-900"
                        value={newRuleDuration}
                        onChange={(e) => setNewRuleDuration(parseInt(e.target.value))}
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-[#ec7211] hover:bg-[#d85d00] text-white font-bold p-2.5 rounded text-xs uppercase tracking-wider transition-colors cursor-pointer "
                      disabled={['TENANT_VIEWER'].includes(userRole) || license.is_expired || !license.is_valid}
                    >
                      Deploy Rule
                    </button>
                  </form>
                </div>

                {/* 룰 목록 테이블 */}
                <div className="col-span-2 bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 p-6 rounded ">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-6">📋 Config Rules Inventory</h3>
                  <div className="overflow-y-auto max-h-[350px]">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800/60 text-slate-400 bg-slate-900/60 uppercase tracking-wider">
                          <th className="py-2.5 px-4 font-semibold">Rule Name</th>
                          <th className="py-2.5 px-4 font-semibold">Expression</th>
                          <th className="py-2.5 px-4 font-semibold">Duration</th>
                          <th className="py-2.5 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {rules.map((rule: any) => (
                          <tr key={rule.id} className="hover:bg-slate-800/40">
                            <td className="py-3 px-4 text-slate-100 font-bold">{rule.name}</td>
                            <td className="py-3 px-4 font-mono text-[11px] text-[#0073bb]">
                              {rule.metric_name} {rule.operator === 'gt' ? '>' : (rule.operator === 'lt' ? '<' : '=')} {rule.threshold}%
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-300">{rule.duration_minutes}m</td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleDeleteRule(rule.id)}
                                className="text-red-400 hover:text-red-500 font-bold text-[10px] uppercase cursor-pointer"
                                disabled={['TENANT_VIEWER'].includes(userRole) || license.is_expired || !license.is_valid}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* CloudTrail 감사로그 */}
              <div className="bg-[#0d121f] border border-slate-800/80 border border-slate-800/60 p-6 rounded ">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-6">🛡️ CloudTrail Security Event History</h3>
                <div className="space-y-2 h-[250px] overflow-y-auto font-mono text-[11px] pr-2 leading-relaxed text-slate-300">
                  {auditLogs.map((log: any) => {
                    const isDelete = log.action.includes('delete');
                    return (
                      <div key={log.id} className="pb-2 border-b border-slate-700/60">
                        <span className="text-slate-500 mr-2">[{log.created_at}]</span>
                        <span className={`font-semibold mr-2 ${isDelete ? 'text-red-400' : 'text-sky-400'}`}>
                          [{log.action.toUpperCase()}]
                        </span>
                        <span>Username: <code>{log.user_email}</code> // {log.details}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
