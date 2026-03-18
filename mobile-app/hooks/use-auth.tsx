import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_BASE } from '@/constants/api';

const STORAGE_KEY = 'mediportal.auth';

const storage = {
  get: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') return localStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  set: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
    await SecureStore.setItemAsync(key, value);
  },
  delete: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') { localStorage.removeItem(key); return; }
    await SecureStore.deleteItemAsync(key);
  },
};

type AuthUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

type RegisterPayload = {
  fullName: string;
  username: string;
  password: string;
};

type ProfileParticulars = {
  dateOfBirth: string;
  phone: string;
  address: string;
  emergencyContact: string;
  medicalConditions: string[];
  medicationList: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsProfileSetup: boolean;
  profileParticulars: ProfileParticulars | null;
  loginWithSingpass: (username: string, password: string) => Promise<void>;
  registerWithSingpass: (payload: RegisterPayload) => Promise<void>;
  completeProfileSetup: (payload: ProfileParticulars) => Promise<void>;
  refreshProfile: () => Promise<void>;
  logout: () => void;
};

const REQUEST_TIMEOUT_MS = 10000;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [profileParticulars, setProfileParticulars] = useState<ProfileParticulars | null>(null);

  // On startup, restore saved session
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const saved = await storage.get(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as { token: string; user: AuthUser };
          setToken(parsed.token);
          setUser(parsed.user);
          await loadPatientProfile(parsed.token);
        }
      } catch {
        await storage.delete(STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    };
    void restoreSession();
  }, []);

  const authFetch = async (path: string, init: RequestInit = {}, accessToken?: string) => {
    const bearer = accessToken ?? token;
    if (!bearer) throw new Error('Missing auth token');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearer}`,
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const loadPatientProfile = async (accessToken?: string) => {
    try {
      const res = await authFetch('/patient/profile', { method: 'GET' }, accessToken);
      if (!res.ok) {
        setNeedsProfileSetup(true);
        return;
      }
      const data = (await res.json()) as {
        date_of_birth: string;
        phone: string;
        address: string;
        emergency_contact: string;
        medical_conditions: string[];
        medication_list: string;
      };
      const nextProfile: ProfileParticulars = {
        dateOfBirth: data.date_of_birth ?? '',
        phone: data.phone ?? '',
        address: data.address ?? '',
        emergencyContact: data.emergency_contact ?? '',
        medicalConditions: data.medical_conditions ?? [],
        medicationList: data.medication_list ?? '',
      };
      setProfileParticulars(nextProfile);
      const complete =
        Boolean(nextProfile.dateOfBirth) &&
        Boolean(nextProfile.phone) &&
        Boolean(nextProfile.address) &&
        Boolean(nextProfile.emergencyContact) &&
        nextProfile.medicalConditions.length > 0 &&
        Boolean(nextProfile.medicationList);
      setNeedsProfileSetup(!complete);
    } catch {
      setNeedsProfileSetup(true);
    }
  };

  const postWithTimeout = async (path: string, body: Record<string, unknown>) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const loginWithSingpass = async (username: string, password: string) => {
    let res: Response;
    try {
      res = await postWithTimeout('/auth/login', { username, password });
    } catch {
      throw new Error('Cannot reach backend. Check EXPO_PUBLIC_API_BASE_URL and backend server.');
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail ?? 'Invalid username/password');
    }

    const data = await res.json();
    const nextToken = data.access_token as string;
    const nextUser = data.user as AuthUser;

    if (nextUser.role !== 'patient') {
      throw new Error('Mobile app login is currently enabled for patient accounts only.');
    }

    setToken(nextToken);
    setUser(nextUser);
    await storage.set(STORAGE_KEY, JSON.stringify({ token: nextToken, user: nextUser }));
    await loadPatientProfile(nextToken);
  };

  const registerWithSingpass = async (payload: RegisterPayload) => {
    let res: Response;
    try {
      res = await postWithTimeout('/auth/register', {
        username: payload.username,
        password: payload.password,
        full_name: payload.fullName,
        role: 'patient',
      });
    } catch {
      throw new Error('Cannot reach backend. Check EXPO_PUBLIC_API_BASE_URL and backend server.');
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail ?? 'Registration failed');
    }

    const data = await res.json();
    const nextToken = data.access_token as string;
    const nextUser = data.user as AuthUser;

    if (nextUser.role !== 'patient') {
      throw new Error('Mobile app registration is currently enabled for patient accounts only.');
    }

    setToken(nextToken);
    setUser(nextUser);
    setNeedsProfileSetup(true);
    setProfileParticulars(null);
    await storage.set(STORAGE_KEY, JSON.stringify({ token: nextToken, user: nextUser }));
  };

  const completeProfileSetup = async (payload: ProfileParticulars) => {
    const res = await authFetch('/patient/profile', {
      method: 'PUT',
      body: JSON.stringify({
        date_of_birth: payload.dateOfBirth,
        phone: payload.phone,
        address: payload.address,
        emergency_contact: payload.emergencyContact,
        medical_conditions: payload.medicalConditions,
        medication_list: payload.medicationList,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail ?? 'Failed to save patient particulars');
    }
    setProfileParticulars(payload);
    setNeedsProfileSetup(false);
  };

  const refreshProfile = async () => {
    if (!token) return;
    await loadPatientProfile(token);
  };

  const logout = async () => {
    setToken(null);
    setUser(null);
    setNeedsProfileSetup(false);
    setProfileParticulars(null);
    await storage.delete(STORAGE_KEY);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token),
      isLoading,
      needsProfileSetup,
      profileParticulars,
      loginWithSingpass,
      registerWithSingpass,
      completeProfileSetup,
      refreshProfile,
      logout,
    }),
    [isLoading, needsProfileSetup, profileParticulars, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
