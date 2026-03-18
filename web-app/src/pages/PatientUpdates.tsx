import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthContext";
import { API_BASE } from "@/lib/apiBase";
import { formatSgDateTime } from "@/lib/datetime";

type Patient = {
  id: number;
  name: string;
  email: string;
  appointment_time: string;
  venue: string;
  status: string;
};

type PreSummary = {
  id: number;
  patient_id: number;
  patient_name: string;
  appointment_id: number | null;
  appointment_time: string;
  status: string;
  summary_text: string;
  generated_at: string;
};

const PatientUpdates = () => {
  const { token } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [summaries, setSummaries] = useState<PreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingFor, setGeneratingFor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [patientsRes, summariesRes] = await Promise.all([
          fetch(`${API_BASE}/doctor/patients`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/doctor/pre-appointment-summaries`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (patientsRes.ok) setPatients((await patientsRes.json()) as Patient[]);
        if (summariesRes.ok) setSummaries((await summariesRes.json()) as PreSummary[]);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [token]);

  const generateSummary = async (patientId: number) => {
    if (!token) return;
    setGeneratingFor(patientId);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/doctor/pre-appointment-summaries/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ patient_id: patientId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Failed to generate summary");
      }
      const summary = (await res.json()) as PreSummary;
      setSummaries((current) => [summary, ...current]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate summary");
    } finally {
      setGeneratingFor(null);
    }
  };

  return (
    <div>
      <PageHeader title="Patient Chat Updates" subtitle="AI summaries from patient chatbot activity before appointments" />

      <Card className="border-none shadow-sm mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Generate Pre-Appointment Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading patients...</p>
          ) : patients.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assigned patients yet.</p>
          ) : (
            patients.map((patient) => (
              <div key={patient.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <p className="font-medium text-foreground">{patient.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {patient.email} · {formatSgDateTime(patient.appointment_time)}
                  </p>
                </div>
                <Button size="sm" onClick={() => generateSummary(patient.id)} disabled={generatingFor === patient.id}>
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  {generatingFor === patient.id ? "Generating..." : "Generate"}
                </Button>
              </div>
            ))
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Generated Summaries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading summaries...</p>
          ) : summaries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No generated summaries yet.</p>
          ) : (
            summaries.map((summary) => (
              <div key={summary.id} className="rounded-md border border-border p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{summary.patient_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {summary.generated_at ? formatSgDateTime(summary.generated_at) : "Just now"}
                  </p>
                </div>
                <p className="whitespace-pre-line text-sm text-foreground">{summary.summary_text}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PatientUpdates;
