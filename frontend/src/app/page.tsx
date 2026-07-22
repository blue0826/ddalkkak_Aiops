import { redirect } from "next/navigation";

/**
 * 루트(/)는 신규 콘솔로 리다이렉트한다.
 * 미인증 사용자는 /console 의 AuthGate 가 /login 으로 다시 보낸다.
 *
 * (구 3027줄 단일 파일 대시보드는 /console 재구축으로 은퇴했다.)
 */
export default function RootPage() {
  redirect("/console");
}
