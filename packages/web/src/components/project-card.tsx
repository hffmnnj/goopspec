import {
  FolderKanban,
  Activity,
  Clock,
  ListTodo,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  id: string;
  name: string;
  description?: string;
  path: string;
  itemCount: number;
  activeWorkflowCount: number;
  updatedAt: string;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function ProjectCard({
  id,
  name,
  description,
  path,
  itemCount,
  activeWorkflowCount,
  updatedAt,
}: ProjectCardProps) {
  return (
    <a
      href={`/projects/${encodeURIComponent(id)}`}
      className="group block w-full min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
    >
      <Card className="h-full transition-colors group-hover:border-primary/50">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <FolderKanban className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-base truncate">{name}</CardTitle>
            </div>
            {activeWorkflowCount > 0 && (
              <Badge variant="default" className="shrink-0">
                <Activity className="mr-1 h-3 w-3" />
                {activeWorkflowCount} active
              </Badge>
            )}
          </div>
          {description && (
            <CardDescription className="line-clamp-2 mt-1.5">
              {description}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent className="pb-3">
          <p
            className="truncate text-xs text-muted-foreground font-mono"
            title={path}
          >
            {path}
          </p>
        </CardContent>

        <CardFooter className="text-xs text-muted-foreground gap-4">
          <span className="inline-flex items-center gap-1">
            <ListTodo className="h-3.5 w-3.5" />
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1",
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            {formatRelativeTime(updatedAt)}
          </span>
        </CardFooter>
      </Card>
    </a>
  );
}
