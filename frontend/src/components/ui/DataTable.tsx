"use client";

/**
 * 제네릭 데이터 테이블 — §7.3.
 * 행높이 32~36px, sticky 헤더, zebra 금지(hairline 행 경계), 숫자열 우측정렬+num,
 * 행 hover는 --bg-2로 lift. onRowClick이 있으면 tabIndex+Enter/Space로도 조작 가능하게 한다.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** 숫자 컬럼은 numeric을 켜서 우측정렬 + tabular-nums를 동시에 적용한다. */
  numeric?: boolean;
  width?: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  /** rows가 비어 있을 때 렌더링할 상태 (EmptyState 등). 없으면 빈 tbody만 렌더링한다. */
  emptyState?: ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  emptyState,
  className,
}: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={cn("overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)]", className)}>
      <table className="w-full border-collapse text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-[var(--bg-1)]">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{ width: col.width }}
                className={cn(
                  "h-9 whitespace-nowrap px-3 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]",
                  (col.align === "right" || col.numeric) && "text-right"
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className={cn(
                "border-t border-[var(--border)] transition-colors hover:bg-[var(--bg-2)]",
                onRowClick && "cursor-pointer focus-visible:bg-[var(--bg-2)]"
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "h-9 px-3 align-middle",
                    col.numeric && "num text-right",
                    !col.numeric && col.align === "right" && "text-right"
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 긴 문자열 컬럼용 truncate 셀 — hover 시 title로 전체 텍스트를 보여준다. */
export function TruncateCell({ text, maxWidth = 240 }: { text: string; maxWidth?: number }) {
  return (
    <span className="block truncate" style={{ maxWidth }} title={text}>
      {text}
    </span>
  );
}
