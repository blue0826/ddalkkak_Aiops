/**
 * SCP 자격증명 입력 상태 + 페이로드 조립 유틸.
 * ScpCredentialFields(입력 UI)와 TenantOnboardingForm/TenantCredentialPanel(제출 로직)이 공유한다.
 * 엔드포인트/키셋 규약은 기존 credentialApi.ts와 동일 — monitor 라우터의
 * resolve_scp_credential_fields()가 그대로 복호화·파싱할 수 있는 JSON 키셋을 유지한다.
 * 시크릿은 이 파일 안에서도 로그로 남기거나 URL에 싣지 않는다(POST 바디 JSON 전용).
 */

export interface ScpFieldsValue {
  accessKey: string;
  secretKey: string;
  projectId: string;
  scpEnv: string;
  scpRegion: string;
}

export const SCP_ENV_OPTIONS = [
  { value: "e", label: "Enterprise (e)" },
  { value: "g", label: "Sovereign (g)" },
  { value: "s", label: "Samsung 내부 (s)" },
] as const;

export function emptyScpFields(defaultRegion: string): ScpFieldsValue {
  return {
    accessKey: "",
    secretKey: "",
    projectId: "",
    scpEnv: SCP_ENV_OPTIONS[0].value,
    scpRegion: defaultRegion,
  };
}

/** 세 필수 입력이 모두 채워졌는지 — 온보딩 폼에서 SCP 자격증명을 함께 등록할지 판단한다. */
export function isScpFieldsFilled(fields: ScpFieldsValue): boolean {
  return !!fields.accessKey.trim() && !!fields.secretKey.trim() && !!fields.projectId.trim();
}

/** 세 필수 입력이 전부 비어 있는지 — "선택 항목이라 건너뛴 상태"와 "입력하다 만 상태"를 구분한다. */
export function isScpFieldsEmpty(fields: ScpFieldsValue): boolean {
  return !fields.accessKey.trim() && !fields.secretKey.trim() && !fields.projectId.trim();
}

/**
 * POST /credentials의 auth_data(JSON 문자열)로 직렬화한다.
 * monitor 라우터의 resolve_scp_credential_fields()가 그대로 복호화·파싱할 수 있는 키셋을 유지한다.
 */
export function buildScpAuthData(fields: ScpFieldsValue): string {
  const endpoint_url = `https://virtualserver.${fields.scpRegion}.${fields.scpEnv}.samsungsdscloud.com`;
  return JSON.stringify({
    access_key: fields.accessKey.trim(),
    secret_key: fields.secretKey.trim(),
    project_id: fields.projectId.trim(),
    scp_env: fields.scpEnv,
    scp_region: fields.scpRegion,
    endpoint_url,
  });
}

export function scpCredentialName(fields: ScpFieldsValue): string {
  return `Samsung SCP (${fields.scpEnv}/${fields.scpRegion})`;
}
