import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { API_BASE } from "@/lib/apiBase";

type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

type DoctorParticulars = {
  hospital: string;
  department: string;
  phone: string;
  licenseNumber: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsDoctorSetup: boolean;
  doctorParticulars: DoctorParticulars | null;
  loginWithSingpass: (username: string, password: string) => Promise<void>;
  registerWithSingpass: (payload: {
    username: string;
    password: string;
    fullName: string;
  }) => Promise<void>;
  saveDoctorParticulars: (payload: DoctorParticulars) => Promise<void>;
  logout: () => void;
};

const STORAGE_KEY = "mediportal.auth";
const REQUEST_TIMEOUT_MS = 10000;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [needsDoctorSetup, setNeedsDoctorSetup] = useState(false);
  const [doctorParticulars, setDoctorParticulars] = useState<DoctorParticulars | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { token: string; user: AuthUser };
        setToken(parsed.token);
        setUser(parsed.user);
        if (parsed.user.role === "doctor") {
          void loadDoctorProfile(parsed.token);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const authFetch = async (path: string, init: RequestInit = {}, accessToken?: string) => {
    const bearer = accessToken ?? token;
    if (!bearer) throw new Error("Missing auth token");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const loadDoctorProfile = async (accessToken?: string) => {
    try {
      const res = await authFetch("/doctor/profile", { method: "GET" }, accessToken);
      if (!res.ok) {
        setNeedsDoctorSetup(false);
        return;
      }
      const data = (await res.json()) as {
        hospital: string;
        department: string;
        phone: string;
        license_number: string;
      };
      const nextProfile: DoctorParticulars = {
        hospital: data.hospital ?? "",
        department: data.department ?? "",
        phone: data.phone ?? "",
        licenseNumber: data.license_number ?? "",
      };
      setDoctorParticulars(nextProfile);
      const complete = Boolean(nextProfile.hospital && nextProfile.department && nextProfile.phone && nextProfile.licenseNumber);
      setNeedsDoctorSetup(!complete);
    } catch {
      setNeedsDoctorSetup(false);
    }
  };

  const postWithTimeout = async (path: string, body: Record<string, unknown>) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const loginWithSingpass = async (username: string, password: string) => {
    let res: Response;
    try {
      res = await postWithTimeout("/auth/login", { username, password });
    } catch {
      throw new Error("Cannot reach backend. Make sure FastAPI is running on port 8000.");
    }

    if (!res.ok) {
      throw new Error("Invalid username/password");
    }

    const data = await res.json();
    const nextToken = data.access_token as string;
    const nextUser = data.user as AuthUser;
    if (nextUser.role !== "doctor") {
      throw new Error("Web app is only for doctor accounts");
    }
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: nextToken, user: nextUser }));
    await loadDoctorProfile(nextToken);
  };

  const registerWithSingpass = async (payload: {
    username: string;
    password: string;
    fullName: string;
  }) => {
    let res: Response;
    try {
      res = await postWithTimeout("/auth/register", {
        username: payload.username,
        password: payload.password,
        full_name: payload.fullName,
        role: "doctor",
      });
    } catch {
      throw new Error("Cannot reach backend. Make sure FastAPI is running on port 8000.");
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail ?? "Registration failed");
    }

    const data = await res.json();
    const nextToken = data.access_token as string;
    const nextUser = data.user as AuthUser;
    if (nextUser.role !== "doctor") {
      throw new Error("Web app is only for doctor accounts");
    }
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: nextToken, user: nextUser }));
    setNeedsDoctorSetup(true);
    setDoctorParticulars(null);
  };

  const saveDoctorParticulars = async (payload: DoctorParticulars) => {
    const res = await authFetch("/doctor/profile", {
      method: "PUT",
      body: JSON.stringify({
        hospital: payload.hospital,
        department: payload.department,
        phone: payload.phone,
        license_number: payload.licenseNumber,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail ?? "Failed to save doctor particulars");
    }
    setDoctorParticulars(payload);
    setNeedsDoctorSetup(false);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setNeedsDoctorSetup(false);
    setDoctorParticulars(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token),
      isLoading,
      needsDoctorSetup,
      doctorParticulars,
      loginWithSingpass,
      registerWithSingpass,
      saveDoctorParticulars,
      logout,
    }),
    [user, token, isLoading, needsDoctorSetup, doctorParticulars]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
