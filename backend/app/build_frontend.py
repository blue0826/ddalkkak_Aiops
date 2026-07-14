import os
from loguru import logger

def main():
    logger.info("Next.js page.tsx 빌드 스크립트 실행 시작 (템플릿 모듈러 로더)")
    
    # 템플릿 경로 및 대상 경로 정의
    template_path = "backend/app/templates/page_template.txt"
    target_path = "frontend/src/app/page.tsx"
    
    if not os.path.exists(template_path):
        logger.error(f"템플릿 파일을 찾을 수 없습니다: {template_path}")
        return

    # 템플릿 읽기
    with open(template_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    # 물리 대상 소스에 덮어쓰기
    with open(target_path, "w", encoding="utf-8") as f:
        f.write(content)
        
    logger.info("Next.js page.tsx 파일에 Obsidian 물리 토폴로지 및 L5 자동조치 코드 이식 완료!")

if __name__ == "__main__":
    main()
