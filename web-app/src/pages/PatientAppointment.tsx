import { useEffect, useMemo, useState, useRef } from "react";
import { Send, Sparkles, Pencil, Check, Pill, X, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/auth/AuthContext";
import { useSearchParams } from "react-router-dom";
import { API_BASE } from "@/lib/apiBase";
import { sgDateKey } from "@/lib/datetime";

type Patient = {
  id: number;
  name: string;
  email: string;
  appointment_time: string;
  venue: string;
  status: string;
};

type MedSuggestion = {
  name: string;
  dosage: string;
  reason: string;
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const PatientAppointment = () => {
  const { token, user } = useAuth();
  const [searchParams] = useSearchParams();
  const routePatientId = Number(searchParams.get("patientId"));
  const initialPatientId = Number.isNaN(routePatientId) ? null : routePatientId;
  const initialDate = searchParams.get("date") ?? "";
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [notes, setNotes] = useState({
    symptoms: "",
    diagnosis: "",
    treatment: "",
    medication: "",
    followUp: "",
  });
  const [summaryGenerated, setSummaryGenerated] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [currentAppointmentId, setCurrentAppointmentId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Medication suggestion state
  const [medSuggestions, setMedSuggestions] = useState<MedSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastFetchedDiagnosis = useRef("");

  const debouncedDiagnosis = useDebounce(notes.diagnosis, 800);

  const handleChange = (field: string, value: string) => {
    setNotes((prev) => ({ ...prev, [field]: value }));
    if (field === "diagnosis" && !value.trim()) {
      setMedSuggestions([]);
      setDismissed(false);
      lastFetchedDiagnosis.current = "";
    }
  };

  // Fetch medication suggestions from backend
  useEffect(() => {
    const diagnosis = debouncedDiagnosis.trim();
    if (!diagnosis || diagnosis.length < 3 || diagnosis === lastFetchedDiagnosis.current || dismissed) return;

    const fetchSuggestions = async () => {
      setSuggestionsLoading(true);
      lastFetchedDiagnosis.current = diagnosis;
      try {
        const res = await fetch(`${API_BASE}/doctor/med-suggestions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ diagnosis }),
        });
        if (!res.ok) throw new Error("Failed to fetch suggestions");
        const data = (await res.json()) as MedSuggestion[];
        setMedSuggestions(Array.isArray(data) ? data : []);
        setDismissed(false);
      } catch {
        setMedSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    };

    void fetchSuggestions();
  }, [debouncedDiagnosis, dismissed, token]);

  const handleAddSuggestion = (suggestion: MedSuggestion) => {
    const entry = `${suggestion.name} ${suggestion.dosage}`;
    setNotes((prev) => ({
      ...prev,
      medication: prev.medication ? `${prev.medication}, ${entry}` : entry,
    }));
    setMedSuggestions((prev) => prev.filter((s) => s.name !== suggestion.name));
  };

  useEffect(() => {
    if (!token) return;
    const run = async () => {
      const res = await fetch(`${API_BASE}/doctor/patients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as Patient[];
        setPatients(data);
        if (data.length > 0) {
          const nextDate = initialDate || sgDateKey(data[0].appointment_time);
          setSelectedDate(nextDate);
          const candidate = initialPatientId !== null ? data.find((p) => p.id === initialPatientId) : null;
          if (candidate && sgDateKey(candidate.appointment_time) === nextDate) {
            setSelectedPatientId(candidate.id);
          } else {
            const firstForDate = data.find((p) => sgDateKey(p.appointment_time) === nextDate);
            setSelectedPatientId(firstForDate?.id ?? data[0].id);
          }
        }
      }
    };
    void run();
  }, [initialDate, initialPatientId, token]);

  const filteredPatients = useMemo(
    () => (selectedDate ? patients.filter((p) => sgDateKey(p.appointment_time) === selectedDate) : patients),
    [patients, selectedDate]
  );

  useEffect(() => {
    if (filteredPatients.length === 0) { setSelectedPatientId(null); return; }
    if (!filteredPatients.some((p) => p.id === selectedPatientId)) {
      setSelectedPatientId(filteredPatients[0].id);
    }
  }, [filteredPatients, selectedPatientId]);

  useEffect(() => {
    setSent(false);
    setSummaryGenerated(false);
    setSummaryText("");
    setCurrentAppointmentId(null);
    setEditing(false);
  }, [selectedPatientId]);

  const selectedPatient = filteredPatients.find((p) => p.id === selectedPatientId) ?? null;

  const handleGenerate = async () => {
    if (!token || !selectedPatientId) return;
    setSaving(true);
    setSent(false);
    setEditing(false);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/doctor/appointment-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patient_id: selectedPatientId,
          symptoms: notes.symptoms,
          diagnosis: notes.diagnosis,
          treatment_plan: notes.treatment,
          medications: notes.medication,
          follow_up_instructions: notes.followUp,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Failed to save notes");
      }
      const data = (await res.json()) as { summary_text: string; appointment_id: number };
      setSummaryText(data.summary_text);
      setCurrentAppointmentId(data.appointment_id);
      setSummaryGenerated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save notes");
    } finally {
      setSaving(false);
    }
  };

  const handleApproveAndSend = async () => {
    if (!token || !currentAppointmentId) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/doctor/appointments/${currentAppointmentId}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? "Failed to send summary");
      }
      setSent(true);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send summary");
    } finally {
      setSending(false);
    }
  };

  const fields = [
    { key: "symptoms", label: "Symptoms", placeholder: "Describe the patient's symptoms..." },
    { key: "diagnosis", label: "Diagnosis", placeholder: "Enter diagnosis..." },
    { key: "treatment", label: "Treatment Plan", placeholder: "Outline the treatment plan..." },
    { key: "medication", label: "Medication Prescribed", placeholder: "List medications and dosages..." },
    { key: "followUp", label: "Follow-up Instructions", placeholder: "Any follow-up notes..." },
  ];

  const showSuggestions = (suggestionsLoading || medSuggestions.length > 0) && !dismissed;

  return (
    <div>
      <PageHeader
        title="Patient Appointment"
        subtitle={
          selectedPatient
            ? `${selectedPatient.name} · ${selectedPatient.email} · ID: ${selectedPatient.id}`
            : "Select date and patient to start"
        }
      >
        <Badge variant="secondary" className="text-sm">In Progress</Badge>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Doctor Notes */}
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Appointment Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Appointment Date</label>
              <input
                type="date"
                className="w-full rounded-md border border-border bg-accent/30 px-3 py-2 text-sm"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Patient</label>
              <select
                className="w-full rounded-md border border-border bg-accent/30 px-3 py-2 text-sm"
                value={selectedPatientId ?? ""}
                onChange={(e) => setSelectedPatientId(Number(e.target.value))}
                disabled={filteredPatients.length === 0}
              >
                {filteredPatients.map((patient) => (
                  <option key={patient.id} value={patient.id}>{patient.name}</option>
                ))}
              </select>
              {selectedDate && filteredPatients.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">No patients found for this date.</p>
              )}
            </div>

            {fields.map((field) => (
              <div key={field.key}>
                <label className="text-sm font-medium text-foreground mb-1.5 block">{field.label}</label>
                <Textarea
                  placeholder={field.placeholder}
                  value={notes[field.key as keyof typeof notes]}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className="resize-none bg-accent/30 border-border focus:border-primary"
                  rows={3}
                />

                {/* AI medication suggestions shown below the Medication field */}
                {field.key === "medication" && showSuggestions && (
                  <div className="mt-2.5 rounded-xl border border-violet-100 bg-violet-50/70 p-3.5">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                        <Sparkles className="h-3.5 w-3.5" />
                        Suggested for "{notes.diagnosis}"
                      </div>
                      {!suggestionsLoading && (
                        <button
                          onClick={() => { setDismissed(true); setMedSuggestions([]); }}
                          className="rounded-md p-0.5 text-violet-400 hover:text-violet-600 hover:bg-violet-100 transition-colors"
                          aria-label="Dismiss suggestions"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {suggestionsLoading ? (
                      <div className="flex items-center gap-2 text-xs text-violet-500 py-0.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Fetching suggestions...
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {medSuggestions.map((s) => (
                          <button
                            key={s.name}
                            onClick={() => handleAddSuggestion(s)}
                            title={s.reason}
                            className="group flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-medium text-violet-800 shadow-sm transition-all hover:border-violet-500 hover:bg-violet-600 hover:text-white hover:shadow active:scale-95"
                          >
                            <Pill className="h-3 w-3 text-violet-400 group-hover:text-white transition-colors" />
                            <span className="font-semibold">{s.name}</span>
                            <span className="text-violet-400 group-hover:text-violet-200 transition-colors font-normal">
                              · {s.dosage}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-[10px] text-violet-400">
                      Click to add · Hover for reason · Always verify before prescribing
                    </p>
                  </div>
                )}
              </div>
            ))}

            <Button onClick={handleGenerate} className="w-full mt-2" size="lg" disabled={saving || !selectedPatientId}>
              <Sparkles className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Generate Patient Summary"}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        {/* Right: AI Summary Preview */}
        <Card className={`border-none shadow-sm transition-opacity ${summaryGenerated ? "opacity-100" : "opacity-40"}`}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Patient-Friendly Summary</CardTitle>
            {summaryGenerated && (
              <Badge className={sent ? "bg-blue-100 text-blue-700 hover:bg-blue-100" : "bg-green-100 text-green-700 hover:bg-green-100"}>
                {sent ? "Sent" : "AI Generated"}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {summaryGenerated ? (
              <div className="space-y-4">
                <div className="bg-accent/40 rounded-xl p-5 text-sm text-foreground leading-relaxed space-y-3">
                  <p><strong>Hello {selectedPatient?.name ?? "Patient"},</strong></p>
                  <p>Here's a summary of your visit today with {user?.name ?? "your doctor"}:</p>

                  {editing ? (
                    <Textarea
                      value={summaryText}
                      onChange={(e) => setSummaryText(e.target.value)}
                      className="resize-none bg-white border-border focus:border-primary min-h-[120px]"
                      rows={6}
                    />
                  ) : (
                    <p>{summaryText}</p>
                  )}

                  <p className="text-muted-foreground italic">— Generated from doctor's notes</p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={sent}
                    onClick={() => setEditing((prev) => !prev)}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    {editing ? "Done" : "Edit"}
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleApproveAndSend}
                    disabled={sending || !currentAppointmentId || sent || editing}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    {sending ? "Sending..." : sent ? "Sent" : "Approve & Send"}
                    {!sent && <Send className="h-4 w-4 ml-2" />}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Fill in the appointment notes and click<br />"Generate Patient Summary" to preview.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PatientAppointment;
