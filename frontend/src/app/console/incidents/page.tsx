"use client";

/**
 * 인시던트 화면 — 목록/상세를 ?id= 쿼리로 전환한다 (design-guide §7.4: 상태는 URL이 단일 진실 소스).
 */
import { AlertTriangle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { IncidentDetailView } from "@/components/incidents/IncidentDetailView";
import { IncidentListView } from "@/components/incidents/IncidentListView";

export default function IncidentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");
  const incidentId = idParam ? Number(idParam) : null;
  const hasValidId = incidentId !== null && Number.isFinite(incidentId);

  const selectIncident = (id: number) => {
    router.push(`/console/incidents?id=${id}`);
  };
  const clearSelection = () => {
    router.push("/console/incidents");
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <AlertTriangle size={20} className="text-[var(--muted)]" strokeWidth={1.75} aria-hidden />
        <h1 className="font-semibold" style={{ font: "var(--text-h1)" }}>
          인시던트
        </h1>
      </div>

      {hasValidId ? (
        <IncidentDetailView incidentId={incidentId as number} onBack={clearSelection} />
      ) : (
        <IncidentListView onSelect={selectIncident} />
      )}
    </div>
  );
}
