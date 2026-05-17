import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function StatCard({ label, value, delta, prefix = '', suffix = '', className }: StatCardProps) {
  return (
    <Card className={cn("glass-panel overflow-hidden", className)}>
      <CardContent className="p-6">
        <div className="text-sm font-medium text-muted-foreground tracking-wider uppercase mb-2">
          {label}
        </div>
        <div className="flex items-baseline gap-2">
          {prefix && <span className="text-muted-foreground font-mono text-xl">{prefix}</span>}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={value}
            className="text-3xl font-mono font-bold text-foreground"
          >
            {value}
          </motion.div>
          {suffix && <span className="text-muted-foreground font-mono text-xl">{suffix}</span>}
        </div>
        {delta !== undefined && (
          <div className={cn("text-xs font-mono mt-2 flex items-center gap-1", delta >= 0 ? "text-emerald-500" : "text-red-500")}>
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}% from last week
          </div>
        )}
      </CardContent>
    </Card>
  );
}
