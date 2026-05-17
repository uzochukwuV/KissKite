import { Badge } from '@/components/ui/badge';
import { formatBps, cn } from '@/lib/utils';

export function ReputationBadge({ score, className }: { score?: number | null, className?: string }) {
  if (score === undefined || score === null) {
    return <Badge variant="outline" className={cn("font-mono text-muted-foreground", className)}>N/A</Badge>;
  }

  let colorClass = "bg-red-500/10 text-red-500 border-red-500/20";
  if (score >= 7000) {
    colorClass = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  } else if (score >= 4000) {
    colorClass = "bg-amber-500/10 text-amber-500 border-amber-500/20";
  }

  return (
    <Badge variant="outline" className={cn("font-mono", colorClass, className)}>
      {formatBps(score)}
    </Badge>
  );
}
