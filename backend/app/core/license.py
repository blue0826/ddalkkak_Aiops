import json
import base64
import os
from datetime import datetime
from typing import Dict, Any
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization
from fastapi import HTTPException, status
from loguru import logger

# generate_license.py를 통해 서명 발행에 매핑된 정적 공개키 블록
PUBLIC_KEY_PEM = """-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA/ZfnZcg/7HknYZYI4JioQMaf1hv2CRkiITsLAyrV7F8=
-----END PUBLIC KEY-----"""

class LicenseManager:
    """
    Ed25519 서명 기반 오프라인 라이선스 유효성 및 한도 검증 엔진
    """
    
    @staticmethod
    def get_license_info(license_path: str = "license.key") -> Dict[str, Any]:
        """
        로컬에 보관된 라이선스 파일을 파싱하고 비대칭 키 서명 검증을 진행합니다.
        파일이 없는 경우 30일 임시 평가판 사양을 기본값으로 사용합니다.
        """
        # 1. 라이선스 파일 부재 시 기본 평가판 작동
        if not os.path.exists(license_path):
            logger.info("라이선스 파일(license.key)이 감지되지 않아 임시 평가판 모드로 기동합니다.")
            return {
                "edition": "MSP Evaluation",
                "expire_date": "2026-08-07",  # 고정 또는 가상 30일 임시
                "max_nodes": 5,
                "max_tenants": 2,
                "is_valid": True,
                "is_expired": False,
                "is_evaluation": True
            }

        try:
            # 2. 파일 데이터 로드 및 토큰 파싱
            with open(license_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                
            if "." not in content:
                raise ValueError("올바르지 않은 라이선스 토큰 형식입니다.")
                
            data_b64, sig_b64 = content.split(".")
            
            # Base64 디코딩
            json_bytes = base64.b64decode(data_b64)
            sig_bytes = base64.b64decode(sig_b64)
            
            # 3. Ed25519 공개키 복원 및 서명 검증
            pub_key = serialization.load_pem_public_key(PUBLIC_KEY_PEM.encode('utf-8'))
            
            # verify 메소드는 서명이 올바르지 않으면 예외(InvalidSignature)를 발생시킵니다.
            pub_key.verify(sig_bytes, json_bytes)
            
            # 4. JSON 데이터 파싱 및 만료 검사
            license_data = json.loads(json_bytes.decode('utf-8'))
            expire_date_str = license_data.get("expire_date")
            
            expire_date = datetime.strptime(expire_date_str, "%Y-%m-%d")
            is_expired = datetime.utcnow() > expire_date
            
            logger.info(
                f"[라이선스 확인 성공] 에디션: {license_data.get('edition')}, "
                f"만료예정일: {expire_date_str}, 노드한도: {license_data.get('max_nodes')}, "
                f"만료여부: {is_expired}"
            )
            
            return {
                "edition": license_data.get("edition"),
                "expire_date": expire_date_str,
                "max_nodes": license_data.get("max_nodes"),
                "max_tenants": license_data.get("max_tenants"),
                "is_valid": True,
                "is_expired": is_expired,
                "is_evaluation": False
            }
            
        except Exception as e:
            logger.error(f"[라이선스 검증 실패] 서명 손상 또는 만료 포맷 오류: {str(e)}")
            return {
                "edition": "Invalid License",
                "expire_date": "1970-01-01",
                "max_nodes": 0,
                "max_tenants": 0,
                "is_valid": False,
                "is_expired": True,
                "is_evaluation": False,
                "error": str(e)
            }

def check_license_write_gate():
    """
    FastAPI 의존성 주입용 라이선스 제어 게이트.
    라이선스가 만료되었거나 서명이 유효하지 않은 경우 데이터 추가/수정(CUD) 동작을 거부합니다.
    """
    lic = LicenseManager.get_license_info()
    if not lic.get("is_valid", False) or lic.get("is_expired", False):
        logger.warning("라이선스 검증 실패로 쓰기 작업이 거부되었습니다. (읽기 전용 제한)")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="라이선스가 만료되었거나 올바르지 않습니다. 시스템이 안전 읽기 전용 모드(Read-Only)로 차단되었습니다."
        )
