/**
 * HeaderControls — small React island that handles interactive header state:
 * sidebar toggle button (mobile) and theme toggle. Intentionally tiny so
 * hydration only affects the header, not the whole page.
 */
import { useState, useCallback } from "react";
import { Menu, Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function HeaderControls() {
  const [theme, setThemeState] = useState<"light" | "dark">(getInitialTheme);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }, [theme]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      // Drive the sidebar via a data attribute on the sidebar element
      const sidebar = document.getElementById("app-sidebar");
      if (sidebar) {
        sidebar.dataset.open = String(next);
        sidebar.classList.toggle("-translate-x-full", !next);
        sidebar.classList.toggle("translate-x-0", next);
      }
      const overlay = document.getElementById("sidebar-overlay");
      if (overlay) {
        overlay.classList.toggle("hidden", !next);
      }
      return next;
    });
  }, []);

  return (
    <div className="contents">
      {/* Mobile hamburger — rendered in the header's left slot via CSS order */}
      <Button
        id="sidebar-toggle"
        variant="ghost"
        size="icon"
        className="md:hidden order-first"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
        aria-expanded={sidebarOpen}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      >
        {theme === "dark" ? (
          <Sun className="h-5 w-5" />
        ) : (
          <Moon className="h-5 w-5" />
        )}
      </Button>
    </div>
  );
}
