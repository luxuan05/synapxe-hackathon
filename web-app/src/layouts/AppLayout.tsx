import { Outlet } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import MobileNav from "@/components/MobileNav";

const AppLayout = () => (
  <div className="flex min-h-screen bg-background">
    <AppSidebar />
    <div className="flex-1 flex flex-col">
      <MobileNav />
      <main className="flex-1 p-6 md:p-8 lg:p-10 max-w-6xl">
        <Outlet />
      </main>
    </div>
  </div>
);

export default AppLayout;
