"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { ApiError, login } from "@/lib/api";
import { getAuthToken, setAuthToken, setAuthUser } from "@/lib/auth-storage";

/** 로그인 화면 — 다크 테마, POST /auth/login → 토큰/사용자 정보를 auth-storage에 저장. */
export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getAuthToken()) {
      router.replace("/console/dashboard");
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const token = await login({ username, password });
      setAuthToken(token.access_token);
      setAuthUser({ role: token.role, tenant_id: token.tenant_id, email: token.email });
      router.replace("/console/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "로그인에 실패했습니다. 네트워크 상태를 확인하고 다시 시도하십시오."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-0)] px-4 text-[var(--foreground)]">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-1)] p-8">
        <h1 className="font-semibold" style={{ font: "var(--text-h1)" }}>
          AIOps 통합 관제 콘솔
        </h1>
        <p className="mt-1 text-[13px] text-[var(--muted)]">삼성클라우드플랫폼(SCP)·AWS 멀티테넌트 관제</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username" className="text-[12px] font-medium text-[var(--muted)]">
              이메일
            </label>
            <input
              id="username"
              type="email"
              required
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="h-10 rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-0)] px-3 text-[13px] text-[var(--foreground)] outline-none focus-visible:border-[var(--brand)]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-[12px] font-medium text-[var(--muted)]">
              비밀번호
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--border)] bg-[var(--bg-0)] px-3 pr-10 text-[13px] text-[var(--foreground)] outline-none focus-visible:border-[var(--brand)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              >
                {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
              </button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-[var(--radius-input)] border border-[var(--crit)]/40 bg-[var(--crit)]/10 px-3 py-2 text-[12px] text-[var(--crit)]"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 flex h-10 items-center justify-center gap-2 rounded-[var(--radius-input)] bg-[var(--brand)] text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <LogIn size={14} aria-hidden />
            {isSubmitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
