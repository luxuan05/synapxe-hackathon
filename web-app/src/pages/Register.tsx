import { useState } from "react";
import { ShieldPlus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Register = () => {
  const navigate = useNavigate();
  const { registerWithSingpass } = useAuth();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    const trimmedEmail = username.trim();
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setError("Please enter a valid email address");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await registerWithSingpass({ username: trimmedEmail, password, fullName });
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-white flex items-center justify-center p-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#ffffff_0%,#f8f5ff_40%,#f3edff_100%)]" />
        <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-purple-300/35 blur-3xl" />
        <div className="absolute top-1/2 -translate-y-1/2 right-[-90px] h-80 w-80 rounded-full bg-violet-300/30 blur-3xl" />
        <div className="absolute bottom-[-80px] left-1/2 -translate-x-1/2 h-72 w-96 rounded-full bg-fuchsia-200/35 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(124,58,237,0.08)_1px,transparent_0)] [background-size:22px_22px]" />
      </div>

      <div className="relative w-full max-w-md rounded-2xl border border-purple-100 bg-white/85 p-8 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldPlus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Create Account</h1>
            <p className="text-sm text-muted-foreground">Doctor-only registration</p>
          </div>
        </div>

        <div className="space-y-3">
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Username (email)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            type="password"
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRegister()}
          />
        </div>

        <button
          onClick={handleRegister}
          disabled={loading}
          className="mt-5 w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Register with Singpass"}
        </button>

        {error ? <p className="text-sm text-destructive mt-4">{error}</p> : null}

        <p className="text-sm text-muted-foreground mt-5">
          Already registered?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Go to login
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
