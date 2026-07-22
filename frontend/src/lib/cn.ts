/**
 * Tailwind 클래스 조합 유틸.
 * clsx로 조건부 클래스를 조립하고, tailwind-merge로 충돌하는 유틸리티 클래스를 정리한다.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
