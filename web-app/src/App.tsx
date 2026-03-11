import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthContext";
import RequireAuth from "@/auth/RequireAuth";
import AppLayout from "@/layouts/AppLayout";
import Dashboard from "@/pages/Dashboard";
import PatientAppointment from "@/pages/PatientAppointment";
import PatientHistory from "@/pages/PatientHistory";
import PatientUpdates from "@/pages/PatientUpdates";
import DoctorProfile from "@/pages/DoctorProfile";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import DoctorOnboarding from "@/pages/DoctorOnboarding";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/doctor-onboarding"
              element={
                <RequireAuth>
                  <DoctorOnboarding />
                </RequireAuth>
              }
            />
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/appointment" element={<PatientAppointment />} />
              <Route path="/history" element={<PatientHistory />} />
              <Route path="/patient-updates" element={<PatientUpdates />} />
              <Route path="/profile" element={<DoctorProfile />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
