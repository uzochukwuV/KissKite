import { Shield, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function OnChainBadge({ onChain, className }: { onChain: boolean, className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-md border", 
          onChain 
            ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" 
            : "bg-amber-500/10 text-amber-500 border-amber-500/20",
          className
        )}>
          {onChain ? <Shield className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
          {onChain ? 'On-Chain' : 'Off-Chain'}
        </div>
      </TooltipTrigger>
      <TooltipContent className="bg-card text-foreground border-border text-xs font-mono max-w-[200px]">
        {onChain 
          ? "This agent's reputation score is immutably verified on Kite chain."
          : "This agent's registry has not been deployed to Kite chain yet. Stats are calculated off-chain."}
      </TooltipContent>
    </Tooltip>
  );
}
