import { Menu } from "lucide-react";
import { Button } from "./ui/button";
import { ThemeToggle } from "./theme-toggle";

interface NavBarProps {
  onToggleSidebar: () => void;
}

export function NavBar({ onToggleSidebar }: NavBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
          <span className="text-sm font-bold text-primary-foreground">G</span>
        </div>
        <span className="text-lg font-semibold tracking-tight">GoopSpec</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
