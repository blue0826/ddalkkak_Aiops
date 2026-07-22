"use client";

/**
 * 알람 규칙 목록 — GET /alerts/rules + DELETE /alerts/rules/{id}.
 * 생성 폼과 삭제 버튼은 운영자/관리자에게만 노출한다(뷰어는 조회 전용).
 */
import { useState } from "react";
import { Bell, Trash2 } from "lucide-react";
import { deleteAlertRule, getAlertRules } from "@/lib/api";
import { useApiResource } from "@/hooks/useApiResource";
import { useAuth } from "@/hooks/useAuth";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StaleIndicator } from "@/components/ui/StaleIndicator";
import type { AlertRule } from "@/lib/types";
import { canManageAlerts, operatorLabel } from "./utils";
import { CreateAlertRuleForm } from "./CreateAlertRuleForm";
import { useMinutesAgo } from "./useMinutesAgo";

export function AlertRulesPanel() {
  const { user } = useAuth();
  const { data, error, isLoading, lastUpdated, refetch } = useApiResource(() => getAlertRules(), []);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const canManage = canManageAlerts(user?.role);
  const minutesAgo = useMinutesAgo(lastUpdated);

  async function handleDelete(id: number) {
    setDeleteError(null);
    setPendingDeleteId(id);
    try {
      await deleteAlertRule(id);
      refetch();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "규칙 삭제에 실패했습니다.");
    } finally {
      setPendingDeleteId(null);
    }
  }

  const columns: DataTableColumn<AlertRule>[] = [
    { key: "name", header: "이름", render: (row) => row.name },
    { key: "metric_name", header: "메트릭", render: (row) => <span className="font-mono">{row.metric_name}</span> },
    { key: "operator", header: "연산자", render: (row) => operatorLabel(row.operator) },
    { key: "threshold", header: "임계치", numeric: true, render: (row) => row.threshold },
    { key: "duration_minutes", header: "지속(분)", numeric: true, render: (row) => row.duration_minutes },
    {
      key: "is_active",
      header: "활성",
      render: (row) =>
        row.is_active ? (
          <span className="text-[var(--ok)]">활성</span>
        ) : (
          <span className="text-[var(--muted)]">비활성</span>
        ),
    },
  ];

  if (canManage) {
    columns.push({
      key: "actions",
      header: "",
      align: "right",
      render: (row) => (
        <button
          type="button"
          disabled={pendingDeleteId === row.id}
          onClick={() => handleDelete(row.id)}
          aria-label={`${row.name} 규칙 삭제`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-input)] text-[var(--muted)] transition-colors hover:bg-[var(--bg-2)] hover:text-[var(--crit)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={14} aria-hidden />
        </button>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && <CreateAlertRuleForm onCreated={refetch} />}

      {deleteError && (
        <p role="alert" className="text-[12px] text-[var(--crit)]">
          {deleteError}
        </p>
      )}

      {minutesAgo !== null && (
        <div className="flex justify-end">
          <StaleIndicator minutesAgo={minutesAgo} />
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={36} />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          cause={`알람 규칙을 불러오지 못했습니다: ${error.message}`}
          remedy="네트워크 상태를 확인한 뒤 다시 시도하십시오."
          onRetry={refetch}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={data ?? []}
          getRowKey={(row) => row.id}
          emptyState={
            <EmptyState
              variant="onboarding"
              title="아직 등록된 규칙이 없습니다 — 규칙 추가"
              description="새 알람 규칙을 추가해 임계치 초과를 감지하십시오."
              icon={Bell}
            />
          }
        />
      )}
    </div>
  );
}
