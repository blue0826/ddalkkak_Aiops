/**
 * 인증 토큰 중앙 저장소.
 *
 * NOTE(보안 후속 과제): 현재는 localStorage에 평문 저장한다. XSS에 취약하므로
 * 실서비스 전환 시 httpOnly 쿠키 + 서버사이드 세션 검증으로 이전할 것.
 * 헌법 §3의 "고객 자격증명"(AWS/SCP 연동키)은 이 토큰과 무관하게 백엔드에서
 * envelope encryption으로 별도 보호되며, 프론트에는 절대 평문 노출되지 않는다.
 *
 * getAuthToken/getAuthUser는 useAuth()에서 React.useSyncExternalStore의 getSnapshot으로
 * 그대로 쓰인다 — 그래서 getAuthUser()는 값이 바뀌지 않았으면 매번 같은 객체 참조를 반환하도록
 * 캐시한다(그렇지 않으면 매 렌더마다 "새 스냅샷"으로 오인되어 불필요한 재렌더가 반복된다).
 */

const TOKEN_KEY = "aiops_access_token";
const USER_KEY = "aiops_auth_user";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
  notifyAuthChange();
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  notifyAuthChange();
}

/** POST /auth/login 응답(Token) 중 UI가 필요로 하는 신원 정보만 — 자격증명/시크릿 아님. */
export interface StoredAuthUser {
  role: string;
  tenant_id: string;
  email: string;
}

let cachedUserRaw: string | null = null;
let cachedUser: StoredAuthUser | null = null;

export function getAuthUser(): StoredAuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (raw === cachedUserRaw) return cachedUser;

  cachedUserRaw = raw;
  if (!raw) {
    cachedUser = null;
    return null;
  }
  try {
    cachedUser = JSON.parse(raw) as StoredAuthUser;
  } catch {
    cachedUser = null;
  }
  return cachedUser;
}

export function setAuthUser(user: StoredAuthUser): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  notifyAuthChange();
}

export function clearAuthUser(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USER_KEY);
  notifyAuthChange();
}

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/**
 * 401 응답 수신 시 호출될 콜백을 등록한다 (예: 로그인 화면으로 리다이렉트).
 * 반환값은 구독 해제 함수.
 */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export function notifyUnauthorized(): void {
  clearAuthToken();
  clearAuthUser();
  unauthorizedListeners.forEach((listener) => listener());
}

type AuthChangeListener = () => void;
const authChangeListeners = new Set<AuthChangeListener>();

function notifyAuthChange(): void {
  authChangeListeners.forEach((listener) => listener());
}

/** useAuth()가 React.useSyncExternalStore의 subscribe로 사용한다. */
export function subscribeAuthChange(listener: AuthChangeListener): () => void {
  authChangeListeners.add(listener);
  return () => authChangeListeners.delete(listener);
}
