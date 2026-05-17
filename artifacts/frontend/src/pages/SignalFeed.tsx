import { useState, useEffect } from "react";
import { useWebSocketContext } from "@/context/WebSocketContext";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { useListSignals } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Lock, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatPrice, truncateAddress } from "@/lib/utils";
import { CountdownTimer } from "@/components/CountdownTimer";
import type { Signal } from "@workspace/api-client-react";

export default function SignalFeed() {
  const { isActive, isLoading: isSubLoading } = useSubscriptionStatus();
  const { messages } = useWebSocketContext();
  const [signals, setSignals] = useState<Signal[]>([]);
  
  // Fetch initial history
  const { data: history } = useListSignals({ limit: 20 }, { query: { enabled: isActive } });

  useEffect(() => {
    if (history && signals.length === 0) {
      setSignals(history);
    }
  }, [history]);

  useEffect(() => {
    // Look for new signals in websocket messages
    const newSignals = messages
      .filter(m => m.type === 'signal')
      .map(m => m.data as Signal);
      
    if (newSignals.length > 0) {
      setSignals(prev => {
        // Prepend new, remove duplicates, keep max 50
        const combined = [...newSignals.reverse(), ...prev];
        const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
        return unique.slice(0, 50);
      });
    }
  }, [messages]);

  if (isSubLoading) {
    return <div className="p-12 text-center font-mono animate-pulse text-cyan-500">Checking access...</div>;
  }

  if (!isActive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mb-6 border border-white/10">
          <Lock className="w-8 h-8 text-slate-500" />
        </div>
        <h2 className="text-2xl font-mono font-bold mb-4">Terminal Locked</h2>
        <p className="text-muted-foreground mb-8 max-w-md">
          The live signal feed requires an active Subscription Pass. Subscribe to get real-time WebSocket access to agent predictions.
        </p>
        <Link href="/subscribe">
          <Button className="bg-cyan-500 hover:bg-cyan-600 font-mono text-slate-900">
            View Subscription Tiers
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-mono font-bold tracking-tight flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </div>
            Live Feed
          </h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm">Real-time trading signals from autonomous agents.</p>
        </div>
        
        <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 font-mono py-1">
          Connected
        </Badge>
      </div>

      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {signals.map((signal) => (
            <motion.div
              key={signal.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <SignalCard signal={signal} />
            </motion.div>
          ))}
          {signals.length === 0 && (
             <div className="text-center py-12 glass-panel rounded-xl border border-white/5 font-mono text-muted-foreground">
               <Activity className="w-8 h-8 mx-auto mb-4 opacity-50" />
               Waiting for signals...
             </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SignalCard({ signal }: { signal: Signal }) {
  const isBuy = signal.direction === 'BUY';
  const isSell = signal.direction === 'SELL';
  
  return (
    <Link href={`/signals/${signal.id}`}>
      <div className="glass-panel border-white/10 rounded-lg p-5 hover:bg-white/[0.02] hover:border-cyan-500/30 transition-all cursor-pointer group">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-2xl font-black font-mono">{signal.asset}</div>
              <div className="text-xs text-slate-500 font-mono mt-1">Agent #{signal.agentId}</div>
            </div>
            
            <Badge variant="outline" className={`px-3 py-1 font-mono text-sm ${
              isBuy ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/5' : 
              isSell ? 'border-red-500/50 text-red-400 bg-red-500/5' : 
              'border-amber-500/50 text-amber-400 bg-amber-500/5'
            }`}>
              {signal.direction}
            </Badge>
            
            <div className="hidden sm:block">
              <div className="text-xs text-slate-500 font-mono uppercase">Target</div>
              <div className="font-mono text-lg">${formatPrice(signal.targetPrice)}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-6 text-right">
            <div className="hidden md:block">
              <div className="text-xs text-slate-500 font-mono uppercase">Hash</div>
              <div className="font-mono text-sm text-cyan-700">{truncateAddress(signal.signalHash)}</div>
            </div>
            
            <div>
              <div className="text-xs text-slate-500 font-mono uppercase mb-1">Time Left</div>
              <CountdownTimer targetDate={signal.expiration} className="text-lg" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
