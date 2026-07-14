import json
import base64
from datetime import datetime
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization
from loguru import logger

def generate_keypair():
    """
    Ed25519 개인키와 공개키 쌍을 생성하고 PEM 형식 문자열로 반환합니다.
    """
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    # 개인키 PEM 변환
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode('utf-8')

    # 공개키 PEM 변환
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode('utf-8')

    return private_pem, public_pem

def issue_license(
    private_key_pem: str,
    edition: str,
    expire_date_str: str,
    max_nodes: int,
    max_tenants: int
) -> str:
    """
    개인키로 라이선스 데이터에 서명하고 암호화 서명된 단일 라이선스 키 텍스트를 발행합니다.
    """
    # 라이선스 원본 JSON 조립
    license_data = {
        "edition": edition,
        "expire_date": expire_date_str,
        "max_nodes": max_nodes,
        "max_tenants": max_tenants,
        "issued_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    # JSON 직렬화
    json_bytes = json.dumps(license_data, sort_keys=True).encode('utf-8')
    data_b64 = base64.b64encode(json_bytes).decode('utf-8')

    # 개인키 복원 및 서명 수행
    private_key = ed25519.Ed25519PrivateKey.from_private_bytes(
        serialization.load_pem_private_key(private_key_pem.encode('utf-8'), password=None).private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption()
        )
    )
    
    signature = private_key.sign(json_bytes)
    sig_b64 = base64.b64encode(signature).decode('utf-8')

    # 최종 서명된 라이선스 토큰 (데이터.서명)
    license_key = f"{data_b64}.{sig_b64}"
    return license_key

if __name__ == "__main__":
    logger.info("AIOps MSP 오프라인 라이선스 비대칭 키 쌍 및 라이선스 키 생성 유틸리티 가동")
    
    # 1. 키쌍 생성
    private_pem, public_pem = generate_keypair()
    
    print("\n" + "="*50)
    print("--- [NEW PUBLIC KEY FOR SYSTEM HARDCODING] ---")
    print(public_pem.strip())
    print("="*50 + "\n")
    
    # 2. 테스트용 라이선스 서명 발행
    # 전용 설치(Dedicated AI) 에디션, 2030년 12월 31일 만료, 최대 50 노드 관제 한도, 테넌트 1개 제약
    test_license_key = issue_license(
        private_key_pem=private_pem,
        edition="Dedicated AI",
        expire_date_str="2030-12-31",
        max_nodes=50,
        max_tenants=1
    )
    
    # license.key 파일로 로컬 저장
    with open("license.key", "w", encoding="utf-8") as f:
        f.write(test_license_key)
        
    logger.info("테스트용 라이선스 파일 'license.key' 생성 완료! (만료: 2030-12-31, Edition: Dedicated AI)")
