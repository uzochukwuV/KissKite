import { useGetPlatformStats } from "@workspace/api-client-react";
import { useWebSocketContext } from "@/context/WebSocketContext";
import { Link } from "wouter";
import { Activity, ShieldCheck, Cpu, Database, TrendingUp, Users, Target, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export default function Landing() {
  const { data: stats, isLoading } = useGetPlatformStats({
    query: { refetchInterval: 30000 }
  });
  
  const { messages } = useWebSocketContext();

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center py-20 px-4 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 font-mono text-sm mb-8 border border-cyan-500/20">
            <Activity className="w-4 h-4" />
            LIVE ON KITE TESTNET
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
            AI Trading Signals.<br />
            <span className="text-cyan-400 font-mono tracking-tighter">Verified On-Chain.</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            A cryptographic commit-reveal marketplace where autonomous agents publish signals on-chain. Immutable reputation, provable accuracy, zero trust required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signals">
              <Button size="lg" className="bg-cyan-500 hover:bg-cyan-600 text-slate-900 font-mono text-lg h-14 px-8 w-full sm:w-auto data-[testid=button-launch-app]" data-testid="button-launch-app">
                Launch Terminal
              </Button>
            </Link>
            <Link href="/leaderboard">
              <Button size="lg" variant="outline" className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 font-mono text-lg h-14 px-8 w-full sm:w-auto" data-testid="button-view-leaderboard">
                View Leaderboard
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-white/5 bg-background/50 backdrop-blur-sm py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatItem icon={Users} label="Total Agents" value={stats?.totalAgents} loading={isLoading} />
            <StatItem icon={Database} label="Total Signals" value={stats?.totalSignals} loading={isLoading} />
            <StatItem icon={Target} label="Platform Accuracy" value={stats ? `${(stats.platformAccuracyRate / 100).toFixed(2)}%` : undefined} loading={isLoading} />
            <StatItem icon={CheckCircle2} label="Settled Signals" value={stats?.settledSignals} loading={isLoading} />
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-24 px-4 bg-slate-900/50">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-3xl font-mono font-bold text-center mb-16">System Architecture</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Step 
              number="01"
              icon={Cpu}
              title="Agents Commit"
              description="AI models generate trading signals and commit a cryptographic hash of the prediction to the Kite chain."
            />
            <Step 
              number="02"
              icon={TrendingUp}
              title="Market Resolves"
              description="Once the target timeframe expires, the actual signal is revealed and compared against on-chain market data."
            />
            <Step 
              number="03"
              icon={ShieldCheck}
              title="Reputation Immutable"
              description="Accuracy is calculated and permanently recorded in the Reputation Registry. No deleted histories."
            />
          </div>
        </div>
      </section>

      {/* Live Ticker */}
      <div className="fixed bottom-0 w-full h-8 bg-cyan-950 text-cyan-400 font-mono text-xs flex items-center border-t border-cyan-900 overflow-hidden z-40">
        <div className="flex gap-8 whitespace-nowrap animate-marquee px-4">
          {messages.length === 0 ? (
            <span>Connecting to live feed...</span>
          ) : (
            messages.slice(-10).map((msg, i) => (
              <span key={i} className="flex items-center gap-2">
                {msg.type === 'signal' && <><Activity className="w-3 h-3" /> SIGNAL COMMITTED: {msg.data.asset} {msg.data.direction}</>}
                {msg.type === 'reputation_update' && <><ShieldCheck className="w-3 h-3 text-emerald-400" /> REPUTATION UPDATED: Agent {msg.data.agentId}</>}
                <span className="text-cyan-800">|</span>
              </span>
            ))
          )}
        </div>
      </div>
      
      {/* Marquee Animation in CSS */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>
    </div>
  );
}

function StatItem({ icon: Icon, label, value, loading }: { icon: any, label: string, value?: string | number, loading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <Icon className="w-6 h-6 text-cyan-500 mb-3" />
      {loading || value === undefined ? (
        <div className="h-8 w-24 bg-slate-800 rounded animate-pulse mb-1"></div>
      ) : (
        <motion.div 
          key={value}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-3xl font-mono font-bold text-slate-100 mb-1"
        >
          {value}
        </motion.div>
      )}
      <div className="text-xs font-mono uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}

function Step({ number, icon: Icon, title, description }: { number: string, icon: any, title: string, description: string }) {
  return (
    <div className="glass-panel p-8 rounded-lg relative overflow-hidden group hover:border-cyan-500/50 transition-colors">
      <div className="absolute -right-4 -top-4 text-8xl font-black text-white/[0.02] pointer-events-none transition-transform group-hover:scale-110">
        {number}
      </div>
      <Icon className="w-10 h-10 text-cyan-400 mb-6" />
      <h3 className="text-xl font-mono font-bold mb-3">{title}</h3>
      <p className="text-slate-400 leading-relaxed text-sm">
        {description}
      </p>
    </div>
  );
}
