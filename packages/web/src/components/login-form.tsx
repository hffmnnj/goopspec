import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LoginFormProps {
  daemonUrl: string;
  initialError?: boolean;
}

export function LoginForm({ daemonUrl, initialError = false }: LoginFormProps) {
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(
    initialError ? "Invalid password. Please try again." : null,
  );
  const [loading, setLoading] = React.useState(false);

  const errorId = "login-error";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${daemonUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (data.noPasswordRequired || data.authenticated) {
        window.location.href = "/";
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Invalid password. Please try again.");
        setLoading(false);
        return;
      }

      window.location.href = "/";
    } catch {
      setError("Unable to reach the daemon. Is it running?");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="password"
          className="text-sm font-medium leading-none text-foreground/80"
        >
          Password
        </label>
        <Input
          id="password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          autoFocus
          autoComplete="current-password"
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          className="h-11 bg-background/50 border-border/60 placeholder:text-muted-foreground/50 focus-visible:ring-[#d946ef]/40"
        />
      </div>

      {error && (
        <div
          id={errorId}
          role="alert"
          className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 shrink-0"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={loading || !password.trim()}
        className="w-full h-11 bg-[#d946ef] hover:bg-[#c026d3] text-white font-medium transition-all duration-200 disabled:opacity-40"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Signing in…
          </span>
        ) : (
          "Sign In"
        )}
      </Button>
    </form>
  );
}
