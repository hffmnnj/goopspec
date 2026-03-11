import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ItemSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function ItemSearch({ value, onChange }: ItemSearchProps) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        type="search"
        placeholder="Search items..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 pl-8 pr-8 text-sm"
        aria-label="Search work items"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0.5 top-1/2 -translate-y-1/2 h-7 w-7"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
