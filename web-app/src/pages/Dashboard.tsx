import { useEffect, useMemo, useState } from "react";
import { Users, FileText, AlertTriangle, Clock, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/auth/AuthContext";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "@/lib/apiBase";
import { formatSgDateTime, sgDateKey } from "@/lib/datetime";

type DoctorPatient = {
  id: number;
  name: string;
  email: string;
  appointment_time: string;
  venue: string;
  status: string;
};

type HistoryItem = {
  id: number;
  summary_sent: boolean;
};

const Dashboard = () => {
  const { user, doctorParticulars, token } = useAuth();
  const navigate = useNavigate();
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const subtitleParts = [doctorParticulars?.hospital, doctorParticulars?.department].filter(Boolean);
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : "Complete doctor particulars";

  useEffect(() => {
    if (!token) return;
    const run = async () => {
      setLoading(true);
      try {
        const [patientsRes, historyRes] = await Promise.all([
          fetch(`${API_BASE}/doctor/patients`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_BASE}/doctor/history`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (patientsRes.ok) setPatients((await patientsRes.json()) as DoctorPatient[]);
        if (historyRes.ok) setHistory((await historyRes.json()) as HistoryItem[]);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [token]);

  const stats = useMemo(
    () => [
      { label: "Patients", value: String(patients.length), icon: Users, color: "text-primary" },
      {
        label: "Pending Summaries",
        value: String(history.filter((item) => !item.summary_sent).length),
        icon: FileText,
        color: "text-amber-500",
      },
      {
        label: "Completed Summaries",
        value: String(history.filter((item) => item.summary_sent).length),
        icon: AlertTriangle,
        color: "text-destructive",
      },
    ],
    [history, patients.length]
  );

  const todaysPatients = useMemo(() => {
    const todayKey = sgDateKey(new Date());
    return patients.filter((patient) => {
      return sgDateKey(patient.appointment_time) === todayKey;
    });
  }, [patients]);

  const upcomingPatients = useMemo(() => {
    const now = new Date();
    return patients.filter((patient) => {
      const apptDate = new Date(patient.appointment_time);
      if (Number.isNaN(apptDate.getTime())) return false;
      return apptDate > now;
    });
  }, [patients]);

  const openPatient = (patient: DoctorPatient) => {
    const params = new URLSearchParams({
      patientId: String(patient.id),
      date: sgDateKey(patient.appointment_time),
    });
    navigate(`/appointment?${params.toString()}`);
  };

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.name ?? "Doctor"}`}
        subtitle={subtitle}
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-none shadow-sm">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center">
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Today's Appointments */}
      <Card className="border-none shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-lg font-semibold">Today's Appointments</CardTitle>
          <Badge variant="secondary" className="font-normal">
            <Clock className="h-3 w-3 mr-1" />
            {todaysPatients.length} patients
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-6 text-sm text-muted-foreground">Loading patients...</div>
          ) : todaysPatients.length === 0 ? (
            <div className="px-6 py-6 text-sm text-muted-foreground">No appointments scheduled for today.</div>
          ) : (
            <div className="divide-y divide-border">
              {todaysPatients.map((patient) => (
                <div key={patient.id} className="flex items-center justify-between px-6 py-4 hover:bg-accent/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                      {patient.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                      <p className="font-medium text-foreground">{patient.name}</p>
                      <p className="text-sm text-muted-foreground">{patient.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                      <p className="text-sm font-medium text-foreground">{formatSgDateTime(patient.appointment_time)}</p>
                      <p className="text-xs text-muted-foreground">{patient.venue}</p>
                      {patient.status === "in-progress" ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">In Progress</Badge>
                      ) : patient.status === "completed" ? (
                        <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 text-xs">Completed</Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs">Scheduled</Badge>
                      )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary hover:text-primary"
                    onClick={() => openPatient(patient)}
                  >
                    Open Patient <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm mt-6">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-lg font-semibold">Upcoming Appointments</CardTitle>
          <Badge variant="secondary" className="font-normal">
            <Clock className="h-3 w-3 mr-1" />
            {upcomingPatients.length} patients
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-6 text-sm text-muted-foreground">Loading patients...</div>
          ) : upcomingPatients.length === 0 ? (
            <div className="px-6 py-6 text-sm text-muted-foreground">No upcoming appointments.</div>
          ) : (
            <div className="divide-y divide-border">
              {upcomingPatients.map((patient) => (
                <div key={patient.id} className="flex items-center justify-between px-6 py-4 hover:bg-accent/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                      {patient.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{patient.name}</p>
                      <p className="text-sm text-muted-foreground">{patient.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-medium text-foreground">{formatSgDateTime(patient.appointment_time)}</p>
                      <p className="text-xs text-muted-foreground">{patient.venue}</p>
                      {patient.status === "in-progress" ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">In Progress</Badge>
                      ) : patient.status === "completed" ? (
                        <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 text-xs">Completed</Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs">Scheduled</Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-primary hover:text-primary"
                      onClick={() => openPatient(patient)}
                    >
                      Open Patient <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
