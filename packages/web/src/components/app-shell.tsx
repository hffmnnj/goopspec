import { useState, useCallback, type ReactNode } from "react";
import { ThemeProvider } from "./theme-provider";
import { NavBar } from "./nav-bar";
import { Sidebar } from "./sidebar";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <ThemeProvider>
      <div className="flex min-h-screen flex-col">
        <NavBar onToggleSidebar={toggleSidebar} />
        <div className="flex flex-1">
          <Sidebar open={sidebarOpen} onClose={closeSidebar} />
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </ThemeProvider>
  );
}
