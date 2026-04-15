import { LayoutDashboard, FolderKanban, Settings, X } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "/";

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-in-out md:static md:z-auto md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Mobile close button */}
        <div className="flex h-14 items-center justify-between border-b px-4 md:hidden">
          <span className="text-lg font-semibold">Navigation</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3" aria-label="Main navigation">
          {navItems.map((item) => {
            const isActive = currentPath === item.href;
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t p-3">
          <p className="text-xs text-sidebar-foreground/50">GoopSpec v0.1.0</p>
        </div>
      </aside>
    </>
  );
}
