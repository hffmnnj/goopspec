/**
 * HeaderControls — small React island that handles interactive header state:
 * sidebar toggle button (mobile) and theme toggle. Intentionally tiny so
 * hydration only affects the header, not the whole page.
 *
 * The theme toggle uses a "mounted" guard to prevent SSR/client hydration
 * mismatches. The server always renders a neutral placeholder; the real
 * icon is shown only after the first client render when localStorage is
 * available. This is the canonical pattern for theme toggles in SSR apps.
 */
import { useState, useCallback, useEffect } from "react";
import { Menu, Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";

function getClientTheme(): "light" | "dark" {
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function HeaderControls() {
  // Start with null so SSR and the first client render agree (no theme known yet).
  const [theme, setThemeState] = useState<"light" | "dark" | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // After mount, read the real preference from localStorage / system.
  // This runs only on the client, so it never causes a hydration mismatch.
  useEffect(() => {
    setThemeState(getClientTheme());
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === "dark" ? "light" : "dark";
      localStorage.setItem("theme", next);
      document.documentElement.classList.toggle("dark", next === "dark");
      return next;
    });
  }, []);

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

      {/* Theme toggle — hidden until mounted to prevent hydration mismatch.
          aria-label defaults to a neutral value while theme is unknown. */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        aria-label={
          theme === null
            ? "Toggle theme"
            : `Switch to ${theme === "dark" ? "light" : "dark"} mode`
        }
        // Keep a stable size during the pre-mount frame so layout doesn't shift.
        className={theme === null ? "opacity-0 pointer-events-none" : undefined}
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
