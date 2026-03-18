const LOCAL_API_BASE = "http://127.0.0.1:8000";
const DEPLOYED_API_BASE = "https://synapxe-hackathon-backend.onrender.com";

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isLocalApiBase(value: string): boolean {
  return value.includes("localhost:8000") || value.includes("127.0.0.1:8000");
}

export function getApiBase(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  const isLocalRun = hostname ? isLocalHostname(hostname) : false;

  if (fromEnv && fromEnv.trim()) {
    const normalized = fromEnv.trim();
    if (!isLocalRun && isLocalApiBase(normalized)) {
      return DEPLOYED_API_BASE;
    }
    return normalized;
  }

  if (isLocalRun) {
    return LOCAL_API_BASE;
  }

  return DEPLOYED_API_BASE;
}

export const API_BASE = getApiBase();
