import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from backend.app.core.config import settings
from loguru import logger

def get_master_kek() -> Fernet:
    """
    전용 마스터 키(MASTER_KEK) 기반으로 PBKDF2를 사용하여 32바이트 마스터 키(KEK)를 유도합니다.
    """
    salt = b"aiops_master_salt_12345"
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(settings.MASTER_KEK.encode("utf-8")))
    return Fernet(key)

class EnvelopeEncryptor:
    def __init__(self):
        self.master_kek = get_master_kek()
        self.key_id = "master-kek-v1"

    def encrypt(self, plaintext: str) -> tuple:
        """
        임의의 단방향 DEK(데이터 암호화 키)를 생성해 평문을 암호화하고,
        해당 DEK를 마스터 KEK(키 암호화 키)로 감싸 반환합니다.
        반환값: (encrypted_data_str, encrypted_dek_str)
        """
        logger.info("자격증명 데이터 봉투 암호화 수행 시작")
        # 1. 고유 DEK 생성 및 Fernet 객체 초기화
        raw_dek = Fernet.generate_key()
        dek_fernet = Fernet(raw_dek)
        
        # 2. DEK를 사용하여 평문 데이터 암호화
        encrypted_data = dek_fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")
        
        # 3. KEK를 사용하여 DEK 암호화 (봉투 래핑)
        encrypted_dek = self.master_kek.encrypt(raw_dek).decode("utf-8")
        
        return encrypted_data, encrypted_dek

    def decrypt(self, encrypted_data: str, encrypted_dek: str) -> str:
        """
        감싸진 DEK를 KEK로 복호화한 후, 
        복호화된 DEK를 사용하여 본래의 평문 데이터를 복원합니다.
        """
        logger.info("자격증명 데이터 봉투 암호화 복호화 수행 시작")
        # 1. KEK를 통해 암호화된 DEK 복구
        raw_dek = self.master_kek.decrypt(encrypted_dek.encode("utf-8"))
        
        # 2. 복구된 DEK로 실제 암호화 데이터 복호화
        dek_fernet = Fernet(raw_dek)
        plaintext = dek_fernet.decrypt(encrypted_data.encode("utf-8")).decode("utf-8")
        
        return plaintext

# 싱글톤 인스턴스 노출
encryptor = EnvelopeEncryptor()
