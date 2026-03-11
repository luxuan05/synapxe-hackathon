import { NavLink } from "react-router-dom";
import { LayoutDashboard, ClipboardList, History, UserCog, Menu, LogOut, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/auth/AuthContext";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/appointment", icon: ClipboardList, label: "Appointment" },
  { to: "/history", icon: History, label: "Patient History" },
  { to: "/patient-updates", icon: Sparkles, label: "Patient Updates" },
  { to: "/profile", icon: UserCog, label: "Profile" },
];

const MobileNav = () => {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
      <h1 className="text-lg font-bold">
        <span className="text-primary">Medi</span>Portal
      </h1>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="p-2 rounded-lg hover:bg-accent">
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 bg-sidebar-background text-sidebar-foreground p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="p-6 border-b border-sidebar-border">
            <h1 className="text-xl font-bold text-sidebar-primary-foreground">
              <span className="text-sidebar-primary">Medi</span>Portal
            </h1>
          </div>
          <nav className="py-4 px-3 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                  )
                }
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            ))}

            <div className="px-4 pt-4 mt-2 border-t border-sidebar-border/60">
              <p className="text-xs text-sidebar-foreground/60 mb-2">
                Signed in as {user?.name ?? "Doctor"}
              </p>
              <button
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="inline-flex items-center gap-2 text-sm text-sidebar-foreground/80 hover:text-sidebar-primary"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MobileNav;
