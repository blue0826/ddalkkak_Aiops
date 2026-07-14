import streamlit as st
import requests
import json
from decimal import Decimal
import pandas as pd
from datetime import datetime

# Streamlit 페이지 기본 설정 (다크 모드 강제)
st.set_page_config(
    page_title="ddalkkak AIOps Console",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded"
)

# 백엔드 API 주소
BACKEND_URL = "http://127.0.0.1:8000/api/v1"

# 프리미엄 다크테마 커스텀 CSS 주입 (HTML 파일 생성 없이 메모리 주입)
st.markdown("""
<style>
    .main { background-color: #0d1117; color: #c9d1d9; }
    .stButton>button { background-color: #f0883f; color: white; border-radius: 4px; border: none; font-weight: bold; }
    .stButton>button:hover { background-color: #e07220; }
    .metric-card { background-color: #161b22; border: 1px solid #30363d; padding: 15px; border-radius: 8px; margin-bottom: 10px; }
    .audit-log-info { color: #58a6ff; font-family: monospace; }
    .audit-log-warning { color: #f0883f; font-family: monospace; }
</style>
""", unsafe_allow_html=True)

# 세션 상태 초기화
if "token" not in st.session_state:
    st.session_state.token = None
if "role" not in st.session_state:
    st.session_state.role = None
if "tenant_id" not in st.session_state:
    st.session_state.tenant_id = None
if "email" not in st.session_state:
    st.session_state.email = None

def login_user(username, password):
    try:
        r = requests.post(f"{BACKEND_URL}/auth/login", json={"username": username, "password": password})
        if r.status_code == 200:
            data = r.json()
            st.session_state.token = data["access_token"]
            st.session_state.role = data["role"]
            st.session_state.tenant_id = data["tenant_id"]
            st.session_state.email = data["email"]
            return True, "성공"
        else:
            return False, r.json().get("detail", "로그인 실패")
    except Exception as e:
        return False, f"서버 연결 오류: {str(e)}"

# -----------------
# 1. 로그인 화면 (50:50 좌우 분할)
# -----------------
if not st.session_state.token:
    col1, col2 = st.columns([1.2, 1])
    
    with col1:
        st.image("https://img.icons8.com/nolan/256/cloud-connection.png", width=120)
        st.markdown("<h1 style='color: #f0883f;'>MODU DDAL-KKAK AIOps</h1>", unsafe_allow_html=True)
        st.markdown("### 삼성클라우드플랫폼(SCP) & AWS 멀티테넌트 통합 관제 플랫폼")
        st.markdown("""
        본 시스템은 고객사의 클라우드 자산을 실시간으로 수집하고, AI 기반의 이상 탐지 및 자동 조치 게이트웨이를 제공합니다.
        
        - 🔐 **보안 암호화**: Envelope Encryption 기반의 민감 자격증명 관리
        - 📂 **테넌트 격리**: Row-Level Security (RLS) 기반 완벽한 테넌트 격리 보증
        - 📊 **FinOps 분석**: 리소스 낭비 요소 진단 및 비용 절감 추천
        - 🚨 **룰 엔진 및 감사**: 임계치 기반 신속한 알림 라우팅 및 감사 추적
        """)
        # 데코레이션용 동적 노드 다이어그램 SVG 드로잉
        svg_intro = """
        <svg width="450" height="150" style="background:#161b22; border-radius:8px; border: 1px solid #30363d;">
            <circle cx="50" cy="75" r="10" fill="#58a6ff" />
            <text x="35" y="105" fill="#8b949e" font-size="11">SCP Core</text>
            <circle cx="200" cy="40" r="12" fill="#ff9900" />
            <text x="180" y="70" fill="#8b949e" font-size="11">AWS EC2</text>
            <circle cx="200" cy="110" r="10" fill="#7ee787" />
            <text x="180" y="135" fill="#8b949e" font-size="11">VictoriaMetrics</text>
            <circle cx="380" cy="75" r="12" fill="#f0883f" />
            <text x="350" y="105" fill="#c9d1d9" font-size="11">AIOps Console</text>
            
            <line x1="60" y1="75" x2="188" y2="40" stroke="#f0883f" stroke-width="2" stroke-dasharray="4" />
            <line x1="60" y1="75" x2="190" y2="110" stroke="#f0883f" stroke-width="2" />
            <line x1="212" y1="40" x2="368" y2="75" stroke="#7ee787" stroke-width="2" />
            <line x1="210" y1="110" x2="368" y2="75" stroke="#7ee787" stroke-width="2" />
        </svg>
        """
        st.components.v1.html(svg_intro, height=160)

    with col2:
        st.markdown("<div style='padding-top: 50px;'></div>", unsafe_allow_html=True)
        st.markdown("### 계정 로그인")
        with st.form("login_form"):
            username = st.text_input("이메일 주소 (Email)", value="op_scp@client.com")
            password = st.text_input("비밀번호 (Password)", type="password", value="op123!")
            submit = st.form_submit_button("콘솔 접속")
            
            if submit:
                success, msg = login_user(username, password)
                if success:
                    st.success("접속 성공! 콘솔로 이동합니다.")
                    st.rerun()
                else:
                    st.error(f"오류: {msg}")
        st.info("테스트용 계정 정보는 `work_queue/frontend_status.md`에 자세히 안내되어 있습니다.")
        st.stop()

# -----------------
# 2. 대시보드 메인 화면 (로그인 완료 후)
# -----------------
headers = {"Authorization": f"Bearer {st.session_state.token}"}

# 사이드바 구성
st.sidebar.markdown(f"**접속자**: `{st.session_state.email}`")
st.sidebar.markdown(f"**권한**: `{st.session_state.role}`")
st.sidebar.markdown(f"**기본 테넌트**: `{st.session_state.tenant_id}`")

# 어드민 전용 테넌트 스위칭 셀렉터
active_tenant = st.session_state.tenant_id
if st.session_state.role == "SYSTEM_ADMIN":
    try:
        r_tenants = requests.get(f"{BACKEND_URL}/tenants", headers=headers)
        if r_tenants.status_code == 200:
            tenants = r_tenants.json()
            tenant_options = {t["name"]: t["id"] for t in tenants}
            tenant_options["전체 테넌트 (시스템합산)"] = "system"
            selected_name = st.sidebar.selectbox("관제 테넌트 대상 선택", list(tenant_options.keys()))
            active_tenant = tenant_options[selected_name]
    except Exception:
        pass

menu = st.sidebar.radio(
    "콘솔 메뉴",
    ["통합 대시보드 (Dashboard)", "리소스 토폴로지 (Topology)", "성능 메트릭 (Metrics)", "로그 및 알람 (Logs & Events)", "FinOps 비용 (Costs)", "경보 설정 및 감사로그"]
)

# 로그아웃 버튼
if st.sidebar.button("로그아웃 (Sign Out)"):
    st.session_state.token = None
    st.rerun()

# -----------------
# 메뉴 1: 통합 대시보드 (Dashboard)
# -----------------
if menu == "통합 대시보드 (Dashboard)":
    st.title("⚡ 통합 관제 대시보드")
    
    # 1. 요약 메트릭 카드 로드 (비용, 토폴로지 등 API 교차 연동)
    col1, col2, col3, col4 = st.columns(4)
    
    # 토폴로지 노드 수 계산
    node_count = 0
    warning_count = 0
    try:
        r_topo = requests.get(f"{BACKEND_URL}/monitor/topology?tenant_id={active_tenant}", headers=headers)
        if r_topo.status_code == 200:
            nodes_data = r_topo.json()["nodes"]
            node_count = len(nodes_data)
            warning_count = len([n for n in nodes_data if n["status"] == "warning"])
    except Exception:
        pass

    # 비용 데이터 로드
    monthly_cost = "0.00"
    try:
        r_cost = requests.get(f"{BACKEND_URL}/monitor/costs?tenant_id={active_tenant}", headers=headers)
        if r_cost.status_code == 200:
            monthly_cost = f"${r_cost.json()['monthly_total']:.2f}"
    except Exception:
        pass
        
    with col1:
        st.markdown(f"<div class='metric-card'><h4>🖥️ 관제 자원 노드 수</h4><h2>{node_count} Nodes</h2></div>", unsafe_allow_html=True)
    with col2:
        st.markdown(f"<div class='metric-card'><h4>⚠️ 경보 상태 노드</h4><h2 style='color:#f0883f;'>{warning_count} Warning</h2></div>", unsafe_allow_html=True)
    with col3:
        st.markdown(f"<div class='metric-card'><h4>💵 당월 누적 비용 (FinOps)</h4><h2>{monthly_cost}</h2></div>", unsafe_allow_html=True)
    with col4:
        st.markdown("<div class='metric-card'><h4>🔒 자격증명 보안</h4><h2 style='color:#7ee787;'>봉투암호화 활성</h2></div>", unsafe_allow_html=True)

    # 2. 최근 실시간 경보(이벤트) 노출
    st.subheader("🚨 실시간 탐지 이벤트")
    try:
        r_events = requests.get(f"{BACKEND_URL}/monitor/events?tenant_id={active_tenant}", headers=headers)
        if r_events.status_code == 200:
            events = r_events.json()
            if not events:
                st.info("현재 감지된 활성 경보가 없습니다.")
            for ev in events:
                severity_color = "red" if ev["severity"] == "CRITICAL" else "orange"
                st.markdown(f"""
                <div style='background-color:#161b22; border-left: 5px solid {severity_color}; padding: 10px; margin-bottom: 8px;'>
                    <strong>[{ev['severity']}] {ev['title']}</strong> | 노드: <code>{ev['node_id']}</code> | 발생시각: {ev['created_at']}<br/>
                    <small>{ev['description']}</small>
                </div>
                """, unsafe_allow_html=True)
    except Exception as e:
        st.error(f"이벤트 로드 실패: {e}")

# -----------------
# 메뉴 2: 리소스 토폴로지 (Topology)
# -----------------
elif menu == "리소스 토폴로지 (Topology)":
    st.title("🌐 멀티클라우드 리소스 토폴로지 관계도")
    st.markdown("삼성클라우드(SCP)와 AWS의 가상 리소스, 서브넷 구조를 시각화합니다. 주황색 노드는 경보 임계치를 초과한 상태입니다.")
    
    try:
        r_topo = requests.get(f"{BACKEND_URL}/monitor/topology?tenant_id={active_tenant}", headers=headers)
        if r_topo.status_code == 200:
            topo = r_topo.json()
            nodes = topo["nodes"]
            links = topo["links"]
            
            # 동적 SVG 생성 코드를 통해 UI 렌더링 자동화
            svg_content = """<svg width="1000" height="420" style="background:#161b22; border-radius:8px; border: 1px solid #30363d;">"""
            
            # 1. 서브넷 구역 드로잉
            svg_content += """
            <!-- SCP 구역 -->
            <rect x="20" y="30" width="450" height="360" rx="10" fill="none" stroke="#58a6ff" stroke-width="2" stroke-dasharray="5" />
            <text x="35" y="55" fill="#58a6ff" font-weight="bold" font-size="14">Samsung Cloud Platform (SCP)</text>
            
            <!-- AWS 구역 -->
            <rect x="520" y="30" width="450" height="360" rx="10" fill="none" stroke="#ff9900" stroke-width="2" stroke-dasharray="5" />
            <text x="535" y="55" fill="#ff9900" font-weight="bold" font-size="14">Amazon Web Services (AWS)</text>
            """
            
            # 2. 노드 위치 매핑 딕셔너리
            positions = {
                # SCP 노드
                "scp-vpc-01": (70, 100), "scp-subnet-pub": (120, 160), "scp-subnet-priv": (120, 280),
                "scp-lb-01": (250, 100), "scp-vm-web-01": (320, 150), "scp-vm-web-02": (320, 210),
                "scp-vm-app-01": (250, 290), "scp-vm-app-02": (320, 330), "scp-db-maria-01": (420, 290),
                "scp-obs-backup": (420, 160),
                
                # AWS 노드
                "aws-vpc-prod": (570, 100), "aws-subnet-public": (620, 160), "aws-subnet-private": (620, 280),
                "aws-alb-web": (750, 100), "aws-ec2-web-01": (820, 150), "aws-ec2-web-02": (820, 210),
                "aws-ec2-app-01": (750, 290), "aws-rds-postgresql": (850, 290), "aws-s3-assets": (850, 160)
            }
            
            # 3. 링크/관계선 그리기
            for link in links:
                src, tgt = link["source"], link["target"]
                if src in positions and tgt in positions:
                    x1, y1 = positions[src]
                    x2, y2 = positions[tgt]
                    color = "#f0883f" if link["type"] == "network_flow" else "#30363d"
                    dash = "3" if link["type"] == "association" else "0"
                    svg_content += f"""<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="1.8" stroke-dasharray="{dash}" />"""
            
            # 4. 노드 원 및 텍스트 그리기
            for node in nodes:
                nid = node["id"]
                if nid in positions:
                    x, y = positions[nid]
                    color = "#7ee787" # 정상 녹색
                    if node["status"] == "warning":
                        color = "#f0883f" # 경보 오렌지색
                    elif node["type"] in ["vpc", "subnet"]:
                        color = "#8b949e" # 회색
                        
                    svg_content += f"""
                    <circle cx="{x}" cy="{y}" r="8" fill="{color}" />
                    <text x="{x + 12}" y="{y + 4}" fill="#c9d1d9" font-size="11">{node['label']}</text>
                    """
            
            svg_content += "</svg>"
            st.components.v1.html(svg_content, height=430)
            
            # 테이블 목록 노출
            st.subheader("🖥️ 인프라 자원 상세 내역")
            st.dataframe(pd.DataFrame(nodes))
    except Exception as e:
        st.error(f"토폴로지 로드 실패: {e}")

# -----------------
# 메뉴 3: 성능 메트릭 (Metrics)
# -----------------
elif menu == "성능 메트릭 (Metrics)":
    st.title("📈 실시간 자원 성능 메트릭")
    st.markdown("자원의 실시간 시계열 메트릭(CPU, Memory) 변화 추이를 차트로 모니터링합니다.")
    
    # 테넌트에 매핑된 노드 목록 구하기
    try:
        r_topo = requests.get(f"{BACKEND_URL}/monitor/topology?tenant_id={active_tenant}", headers=headers)
        if r_topo.status_code == 200:
            nodes = r_topo.json()["nodes"]
            monitored_nodes = [n for n in nodes if n["type"] in ["vm", "database", "loadbalancer"]]
            
            if not monitored_nodes:
                st.info("메트릭 모니터링 대상 자원이 없습니다.")
            else:
                node_options = {n["label"]: n["id"] for n in monitored_nodes}
                selected_label = st.selectbox("모니터링 대상 노드 선택", list(node_options.keys()))
                node_id = node_options[selected_label]
                
                col1, col2 = st.columns(2)
                with col1:
                    metric = st.selectbox("성능 지표", ["cpu", "memory"])
                with col2:
                    minutes = st.slider("조회 범위 (분)", 10, 120, 60, step=10)
                
                # API 호출
                r_metrics = requests.get(
                    f"{BACKEND_URL}/monitor/metrics?node_id={node_id}&metric_name={metric}&minutes={minutes}",
                    headers=headers
                )
                if r_metrics.status_code == 200:
                    metrics_data = r_metrics.json()
                    df = pd.DataFrame(metrics_data)
                    if not df.empty:
                        df["timestamp"] = pd.to_datetime(df["timestamp"])
                        df.set_index("timestamp", inplace=True)
                        st.line_chart(df)
                    else:
                        st.info("데이터가 없습니다.")
    except Exception as e:
        st.error(f"메트릭 로드 실패: {e}")

# -----------------
# 메뉴 4: 로그 및 알람 (Logs & Events)
# -----------------
elif menu == "로그 및 알람 (Logs & Events)":
    st.title("📰 실시간 로그 스트림 및 이상탐지 이력")
    
    col1, col2 = st.columns(2)
    with col1:
        st.subheader("📝 로그 스트림")
        limit = st.slider("표시 로그 개수", 10, 100, 30)
        try:
            r_logs = requests.get(f"{BACKEND_URL}/monitor/logs?limit={limit}&tenant_id={active_tenant}", headers=headers)
            if r_logs.status_code == 200:
                logs = r_logs.json()
                for log in logs:
                    lvl_color = "red" if log["level"] == "error" else ("orange" if log["level"] == "warning" else "gray")
                    st.markdown(f"""
                    <div style='padding:5px; border-bottom:1px solid #21262d; font-family: monospace;'>
                        <span style='color:#8b949e;'>[{log['timestamp']}]</span>
                        <span style='color:{lvl_color}; font-weight:bold;'>[{log['level'].upper()}]</span>
                        <span>{log['message']}</span>
                    </div>
                    """, unsafe_allow_html=True)
        except Exception as e:
            st.error(f"로그 로드 오류: {e}")
            
    with col2:
        st.subheader("🚨 경보 및 이상탐지 이벤트")
        try:
            r_events = requests.get(f"{BACKEND_URL}/monitor/events?tenant_id={active_tenant}", headers=headers)
            if r_events.status_code == 200:
                events = r_events.json()
                if not events:
                    st.info("활성 이상탐지 이벤트가 없습니다.")
                for ev in events:
                    st.markdown(f"""
                    <div style='background-color:#161b22; padding:15px; border-radius:8px; border:1px solid #30363d; margin-bottom:10px;'>
                        <span style='background:#f0883f; padding:3px 6px; border-radius:3px; color:white; font-size:10px;'>{ev['severity']}</span>
                        <h5 style='margin:5px 0;'>{ev['title']}</h5>
                        <p style='font-size:12px; color:#8b949e;'>{ev['description']}</p>
                        <small>노드 ID: {ev['node_id']} | 시각: {ev['created_at']}</small>
                    </div>
                    """, unsafe_allow_html=True)
        except Exception as e:
            st.error(f"이벤트 로드 오류: {e}")

# -----------------
# 메뉴 5: FinOps 비용 (Costs)
# -----------------
elif menu == "FinOps 비용 (Costs)":
    st.title("💵 FinOps 비용 대시보드 및 자원 최적화")
    st.markdown("자원의 비용 사용 트렌드를 진단하고, 낭비되는 클라우드 자원을 식별하여 월별 절감액을 자동 추천합니다.")
    
    try:
        r_cost = requests.get(f"{BACKEND_URL}/monitor/costs?tenant_id={active_tenant}", headers=headers)
        if r_cost.status_code == 200:
            cost_data = r_cost.json()
            
            c1, c2 = st.columns(2)
            with c1:
                st.metric("월 예상 총 요금", f"${cost_data['monthly_total']:.2f}")
            with c2:
                st.metric("일별 평균 요금", f"${cost_data['daily_average']:.2f}")
                
            st.subheader("📅 최근 7일 비용 추이")
            df_trends = pd.DataFrame(cost_data["daily_trends"])
            df_trends.set_index("date", inplace=True)
            st.bar_chart(df_trends)
            
            st.subheader("💡 Rightsizing 절감 추천 항목")
            recs = cost_data["recommendations"]
            if not recs:
                st.success("최적화되어 낭비되고 있는 자원이 없습니다.")
            else:
                for r in recs:
                    st.markdown(f"""
                    <div style='background-color:#161b22; padding:15px; border-radius:8px; border:1px solid #30363d; margin-bottom:10px;'>
                        <h5 style='color:#f0883f;'>대상 자원: <code>{r['node_id']}</code></h5>
                        <p><strong>진단 사유</strong>: {r['reason']}</p>
                        <p><strong>추천 조치</strong>: {r['action']}</p>
                        <p>현재 월 비용: <strong>${r['current_monthly_cost']:.2f}</strong> → 변경 후 월 비용: <strong>${r['target_monthly_cost']:.2f}</strong></p>
                        <h4 style='color:#7ee787;'>예상 월 절감액: ${r['savings']:.2f}</h4>
                    </div>
                    """, unsafe_allow_html=True)
    except Exception as e:
        st.error(f"비용 로드 실패: {e}")

# -----------------
# 메뉴 6: 경보 설정 및 감사로그
# -----------------
elif menu == "경보 설정 및 감사로그":
    st.title("⚙️ 정책 제어 및 감사 로그 추적")
    
    # 쓰기 권한자만 제어 가능 (SYSTEM_ADMIN, TENANT_OPERATOR)
    if st.session_state.role in ["SYSTEM_ADMIN", "TENANT_OPERATOR"]:
        st.subheader("🚨 신규 경보 룰 생성")
        with st.form("alert_rule_form"):
            name = st.text_input("경보 규칙명", value="High Memory Usage")
            metric_name = st.selectbox("메트릭 선택", ["cpu", "memory", "disk"])
            operator = st.selectbox("조건 연산자", ["gt", "lt", "eq"])
            threshold = st.number_input("임계치 (%)", value=80.0, step=5.0)
            duration_minutes = st.slider("지속 시간 (분)", 1, 60, 5)
            
            submit_rule = st.form_submit_button("규칙 저장")
            if submit_rule:
                try:
                    payload = {
                        "name": name,
                        "metric_name": metric_name,
                        "operator": operator,
                        "threshold": threshold,
                        "duration_minutes": duration_minutes
                    }
                    r = requests.post(f"{BACKEND_URL}/alerts/rules", headers=headers, json=payload)
                    if r.status_code == 201:
                        st.success("새로운 경보 규칙이 데이터베이스에 저장되었으며 RLS 격리가 적용되었습니다.")
                    else:
                        st.error(r.json().get("detail", "경보 룰 저장 실패"))
                except Exception as e:
                    st.error(f"API 오류: {e}")
                    
    else:
        st.warning("사용자 권한(TENANT_VIEWER)에 의해 경보 설정 변경 메뉴가 잠겨 있습니다 (읽기 전용).")

    # 감사로그 목록 조회 (실시간 DB 연결)
    st.subheader("🛡️ 보안 감사 로그 (Audit Logs)")
    try:
        r_audit = requests.get(f"{BACKEND_URL}/alerts/audit-logs?limit=50", headers=headers)
        if r_audit.status_code == 200:
            audit_logs = r_audit.json()
            for log in audit_logs:
                style_class = "audit-log-warning" if "delete" in log["action"] else "audit-log-info"
                st.markdown(f"""
                <div style='padding:6px; border-bottom:1px solid #21262d;'>
                    <span style='color:#8b949e;'>[{log['created_at']}]</span>
                    <span class='{style_class}'>[{log['action'].upper()}]</span>
                    <span>사용자: <code>{log['user_email']}</code> | 내용: {log['details']}</span>
                </div>
                """, unsafe_allow_html=True)
    except Exception as e:
        st.error(f"감사 로그 조회 실패: {e}")
