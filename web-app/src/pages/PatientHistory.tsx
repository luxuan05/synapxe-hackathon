import { useEffect, useState } from "react";
import { Calendar, Pill, FileText, Eye, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/auth/AuthContext";
import { formatSgDate } from "@/lib/datetime";

type Visit = {
  id: number;
  date: string;
  patient: string;
  diagnosis: string;
  medications: string[];
  summary_sent: boolean;
  summary_text: string;
  summary_status: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000";

const PatientHistory = () => {
  const { token } = useAuth();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [openVisitId, setOpenVisitId] = useState<number | null>(null);
  const [panelMode, setPanelMode] = useState<"view" | "edit">("view");
  const [summaryDraft, setSummaryDraft] = useState("");
  const [savingSummary, setSavingSummary] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/doctor/history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setVisits((await res.json()) as Visit[]);
        }
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [token]);

  const handleView = (visit: Visit) => {
    setHistoryError(null);
    if (openVisitId === visit.id) {
      setOpenVisitId(null);
      return;
    }
    setPanelMode("view");
    setSummaryDraft(visit.summary_text ?? "");
    setOpenVisitId(visit.id);
  };

  const handleEditSummary = (visit: Visit) => {
    setHistoryError(null);
    setPanelMode("edit");
    setSummaryDraft(visit.summary_text ?? "");
    setOpenVisitId(visit.id);
  };

  const handleSaveSummary = async (visitId: number) => {
    if (!token) return;
    setSavingSummary(true);
    setHistoryError(null);
    try {
      const res = await fetch(`${API_BASE}/doctor/appointments/${visitId}/summary`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          summary_text: summaryDraft,
          status: "approved",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Failed to update summary");
      }

      setVisits((current) =>
        current.map((visit) =>
          visit.id === visitId
            ? { ...visit, summary_text: summaryDraft, summary_status: "approved", summary_sent: true }
            : visit
        )
      );
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Failed to update summary");
    } finally {
      setSavingSummary(false);
    }
  };

  return (
    <div>
      <PageHeader title="Appointment History" subtitle="Past visits and records" />

      <div className="space-y-4">
        {loading ? (
          <Card className="border-none shadow-sm">
            <CardContent className="p-6 text-sm text-muted-foreground">Loading history...</CardContent>
          </Card>
        ) : visits.length === 0 ? (
          <Card className="border-none shadow-sm">
            <CardContent className="p-6 text-sm text-muted-foreground">No visit history yet.</CardContent>
          </Card>
        ) : visits.map((visit) => (
          <Card key={visit.id} className="border-none shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-foreground">{visit.patient}</h3>
                    {visit.summary_status === "published" ? (
                      <Badge variant="secondary" className="text-xs bg-green-50 text-green-600">Sent</Badge>
                    ) : visit.summary_status === "approved" ? (
                      <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-600">Approved</Badge>
                    ) : visit.summary_status === "generated" ? (
                      <Badge variant="secondary" className="text-xs bg-violet-50 text-violet-600">Generated</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-600">Pending</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      {formatSgDate(visit.date)}
                    </span>
                    <span className="flex items-center gap-1.5"><FileText className="h-4 w-4" />{visit.diagnosis}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {visit.medications.map((med) => (
                      <span key={med} className="inline-flex items-center gap-1 text-xs bg-accent/60 text-accent-foreground px-2.5 py-1 rounded-full">
                        <Pill className="h-3 w-3" />{med}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => handleView(visit)}>
                    <Eye className="h-4 w-4 mr-1.5" />
                    {openVisitId === visit.id ? "Hide" : "View"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleEditSummary(visit)}>
                    <Pencil className="h-4 w-4 mr-1.5" />
                    Edit Summary
                  </Button>
                </div>
              </div>
              {openVisitId === visit.id ? (
                <div className="mt-4 border-t pt-4 space-y-3">
                  <label className="text-sm font-medium text-foreground block">Patient-Friendly Summary</label>
                  <textarea
                    className="w-full rounded-md border border-border bg-accent/30 px-3 py-2 text-sm min-h-[120px]"
                    value={summaryDraft}
                    onChange={(e) => setSummaryDraft(e.target.value)}
                    placeholder="No summary yet. Add summary for patient..."
                    readOnly={panelMode === "view"}
                  />
                  <div className="flex items-center gap-2 flex-wrap">
                    {panelMode === "view" ? (
                      <p className="text-xs text-muted-foreground">View-only mode. Click Edit Summary to make changes.</p>
                    ) : (
                      <Button size="sm" onClick={() => handleSaveSummary(visit.id)} disabled={savingSummary}>
                        {savingSummary ? "Saving..." : "Save Summary"}
                      </Button>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      Status: {visit.summary_status || "none"}
                    </Badge>
                  </div>
                  {historyError ? <p className="text-sm text-destructive">{historyError}</p> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default PatientHistory;
