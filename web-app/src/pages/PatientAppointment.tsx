import { useEffect, useMemo, useState } from "react";
import { Send, Sparkles, Pencil, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/auth/AuthContext";
import { useSearchParams } from "react-router-dom";
import { sgDateKey } from "@/lib/datetime";

type Patient = {
  id: number;
  name: string;
  email: string;
  appointment_time: string;
  venue: string;
  status: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000";

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
  const [error, setError] = useState<string | null>(null);

  const handleChange = (field: string, value: string) => {
    setNotes((prev) => ({ ...prev, [field]: value }));
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
          const candidate = initialPatientId !== null ? data.find((patient) => patient.id === initialPatientId) : null;
          if (candidate && sgDateKey(candidate.appointment_time) === nextDate) {
            setSelectedPatientId(candidate.id);
          } else {
            const firstForDate = data.find((patient) => sgDateKey(patient.appointment_time) === nextDate);
            setSelectedPatientId(firstForDate?.id ?? data[0].id);
          }
        }
      }
    };
    void run();
  }, [initialDate, initialPatientId, token]);

  const filteredPatients = useMemo(
    () => (selectedDate ? patients.filter((patient) => sgDateKey(patient.appointment_time) === selectedDate) : patients),
    [patients, selectedDate]
  );

  useEffect(() => {
    if (filteredPatients.length === 0) {
      setSelectedPatientId(null);
      return;
    }
    if (!filteredPatients.some((patient) => patient.id === selectedPatientId)) {
      setSelectedPatientId(filteredPatients[0].id);
    }
  }, [filteredPatients, selectedPatientId]);

  const selectedPatient = filteredPatients.find((patient) => patient.id === selectedPatientId) ?? null;

  const handleGenerate = async () => {
    if (!token || !selectedPatientId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/doctor/appointment-notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </select>
              {selectedDate && filteredPatients.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No patients found for this date.</p>
              ) : null}
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
              </div>
            ))}
            <Button onClick={handleGenerate} className="w-full mt-2" size="lg" disabled={saving || !selectedPatientId}>
              <Sparkles className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Generate Patient Summary"}
            </Button>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </CardContent>
        </Card>

        {/* Right: AI Summary Preview */}
        <Card className={`border-none shadow-sm transition-opacity ${summaryGenerated ? "opacity-100" : "opacity-40"}`}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Patient-Friendly Summary</CardTitle>
            {summaryGenerated && <Badge className="bg-green-100 text-green-700 hover:bg-green-100">AI Generated</Badge>}
          </CardHeader>
          <CardContent>
            {summaryGenerated ? (
              <div className="space-y-4">
                <div className="bg-accent/40 rounded-xl p-5 text-sm text-foreground leading-relaxed space-y-3">
                  <p><strong>Hello {selectedPatient?.name ?? "Patient"},</strong></p>
                  <p>Here's a summary of your visit today with {user?.name ?? "your doctor"}:</p>
                  <p>{summaryText}</p>
                  <p className="text-muted-foreground italic">— Generated from doctor's notes</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1">
                    <Pencil className="h-4 w-4 mr-2" /> Edit
                  </Button>
                  <Button className="flex-1" onClick={handleApproveAndSend} disabled={sending || !currentAppointmentId}>
                    <Check className="h-4 w-4 mr-2" /> {sending ? "Sending..." : "Approve & Send"}
                    <Send className="h-4 w-4 ml-2" />
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
