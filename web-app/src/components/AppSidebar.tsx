import { NavLink } from "react-router-dom";
import { LayoutDashboard, ClipboardList, History, UserCog, LogOut, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthContext";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/appointment", icon: ClipboardList, label: "Appointment" },
  { to: "/history", icon: History, label: "Appointment History" },
  { to: "/patient-updates", icon: Sparkles, label: "Patient Updates" },
  { to: "/profile", icon: UserCog, label: "Profile" },
];

const AppSidebar = () => {
  const { user, doctorParticulars, logout } = useAuth();
  const hospitalLabel = doctorParticulars?.hospital || "Add hospital in onboarding";

  return (
    <aside className="hidden md:flex flex-col w-64 min-h-screen bg-sidebar-background text-sidebar-foreground border-r border-sidebar-border">
      <div className="p-6 border-b border-sidebar-border">
        <h1 className="text-xl font-bold text-sidebar-foreground tracking-tight">
          <span className="text-sidebar-primary">Medi</span>Portal
        </h1>
        <p className="text-xs text-sidebar-foreground/60 mt-1">Doctor Dashboard</p>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 mx-3 mb-4 rounded-lg bg-sidebar-accent/50">
        <p className="text-xs text-sidebar-foreground/60">Logged in as</p>
        <p className="text-sm font-medium text-sidebar-foreground mt-0.5">
          {user?.name ?? "Doctor"}
        </p>
        <p className="text-xs text-sidebar-foreground/50">{hospitalLabel}</p>
        <button
          onClick={logout}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-sidebar-foreground/70 hover:text-sidebar-primary transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
