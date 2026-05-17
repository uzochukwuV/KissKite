import { useGetAgent, useGetAgentStats, useGetAgentSignals } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { StatCard } from "@/components/StatCard";
import { ReputationBadge } from "@/components/ReputationBadge";
import { OnChainBadge } from "@/components/OnChainBadge";
import { truncateAddress, formatPrice, formatBps } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useMemo } from "react";

// Manual reputation fetch
function useAgentReputation(agentId: number) {
  return useQuery({
    queryKey: ['reputation', agentId],
    queryFn: async () => {
      const r = await fetch(`/api/agents/${agentId}/reputation`);
      if (!r.ok) throw new Error('Failed to fetch reputation');
      return r.json();
    },
    staleTime: 60000,
    enabled: !!agentId
  });
}

export default function AgentProfile() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);

  const { data: agent, isLoading: isLoadingAgent, error } = useGetAgent(id, { query: { enabled: !!id } });
  const { data: stats } = useGetAgentStats(id, { query: { enabled: !!id } });
  const { data: signals } = useGetAgentSignals(id, { query: { enabled: !!id } });
  const { data: rep } = useAgentReputation(id);

  const chartData = useMemo(() => {
    if (!signals) return [];
    
    // Calculate rolling accuracy over time
    const settled = [...signals].filter(s => s.status === 'settled').sort((a, b) => 
      new Date(a.settledAt!).getTime() - new Date(b.settledAt!).getTime()
    );
    
    let accurate = 0;
    return settled.map((s, index) => {
      if (s.accurate) accurate++;
      return {
        name: `Sig ${index + 1}`,
        accuracy: ((accurate / (index + 1)) * 100).toFixed(2),
        accurate: s.accurate ? 1 : 0
      };
    });
  }, [signals]);

  if (error) {
    return <div className="container mx-auto p-8"><Alert variant="destructive"><AlertDescription>Agent not found</AlertDescription></Alert></div>;
  }

  if (isLoadingAgent || !agent) {
    return <div className="container mx-auto p-8"><Skeleton className="h-[400px] w-full bg-white/5" /></div>;
  }

  const score = rep?.onChain?.reputationScore ?? rep?.offChain?.accuracyRate ?? agent.accuracyRate;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header Profile Card */}
      <div className="glass-panel p-8 rounded-xl border border-white/10 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Activity className="w-64 h-64 text-cyan-500" />
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <h1 className="text-4xl font-bold font-mono tracking-tight text-foreground">{agent.name}</h1>
              <Badge variant={agent.status === 'active' ? 'default' : 'secondary'} className="font-mono uppercase bg-emerald-500/20 text-emerald-400">
                {agent.status}
              </Badge>
            </div>
            
            <div className="flex items-center gap-4 text-sm font-mono text-muted-foreground">
              <span className="flex items-center gap-1 bg-background px-3 py-1.5 rounded-md border border-white/5">
                {truncateAddress(agent.walletAddress)}
              </span>
              {agent.vaultAddress && (
                <span className="flex items-center gap-1 bg-background px-3 py-1.5 rounded-md border border-white/5">
                  Vault: {truncateAddress(agent.vaultAddress)}
                </span>
              )}
            </div>
            <p className="mt-4 max-w-2xl text-slate-400">{agent.description || "Autonomous trading agent on Kite network."}</p>
          </div>
          
          <div className="flex flex-col items-end">
            <div className="text-sm font-mono text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Reputation Score
            </div>
            <ReputationBadge score={score} className="text-4xl px-4 py-2" />
            <div className="mt-4">
              {rep && <OnChainBadge onChain={!rep.registryNotDeployed} />}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Total Signals" value={stats?.totalSignals ?? agent.totalSignals} />
        <StatCard label="Settled" value={stats?.settledSignals ?? agent.settledSignals} />
        <StatCard label="Accurate" value={stats?.accurateSignals ?? 0} />
        <StatCard label="Accuracy" value={formatBps(stats?.accuracyRate ?? agent.accuracyRate)} />
        <StatCard label="Avg PnL" value={formatBps(stats?.avgPnlBps ?? 0)} />
        <StatCard label="Pending" value={stats?.pendingSignals ?? 0} />
      </div>

      <div className="grid lg:grid-cols-3 gap-8 mb-8">
        {/* Reputation Comparison */}
        <div className="glass-panel border-white/10 rounded-xl p-6 lg:col-span-1">
          <h3 className="text-lg font-bold font-mono mb-4 border-b border-white/10 pb-2">Reputation Proof</h3>
          <div className="space-y-6">
            <div>
              <div className="text-sm text-muted-foreground font-mono mb-1">On-Chain State</div>
              {!rep?.registryNotDeployed ? (
                <div className="flex items-center gap-2 font-mono text-xl text-emerald-400">
                  <ShieldCheck className="w-5 h-5" /> Verified
                  <span className="text-sm text-slate-500 ml-auto">Score: {formatBps(rep?.onChain?.reputationScore)}</span>
                </div>
              ) : (
                <div className="text-amber-500 font-mono text-sm border border-amber-500/20 bg-amber-500/10 p-2 rounded">
                  Registry not deployed. Stats are off-chain.
                </div>
              )}
            </div>
            
            <div>
               <div className="text-sm text-muted-foreground font-mono mb-1">Off-Chain State</div>
               <div className="font-mono text-slate-300">
                 Accurate: {rep?.offChain?.accurateSignals} / {rep?.offChain?.settledSignals}
               </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="glass-panel border-white/10 rounded-xl p-6 lg:col-span-2">
           <h3 className="text-lg font-bold font-mono mb-4">Accuracy Trend</h3>
           <div className="h-[200px] w-full">
             <ResponsiveContainer width="100%" height="100%">
               <LineChart data={chartData}>
                 <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                 <XAxis dataKey="name" stroke="#ffffff50" fontSize={12} tickLine={false} />
                 <YAxis domain={[0, 100]} stroke="#ffffff50" fontSize={12} tickLine={false} tickFormatter={val => `${val}%`} />
                 <Tooltip 
                   contentStyle={{ backgroundColor: '#0a0f1e', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'Space Mono' }}
                   itemStyle={{ color: '#06b6d4' }}
                 />
                 <Line type="monotone" dataKey="accuracy" stroke="#06b6d4" strokeWidth={2} dot={false} />
               </LineChart>
             </ResponsiveContainer>
           </div>
        </div>
      </div>

      {/* Signal History */}
      <div className="glass-panel border-white/10 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h3 className="text-lg font-bold font-mono">Signal History</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="font-mono">ASSET</TableHead>
              <TableHead className="font-mono">DIR</TableHead>
              <TableHead className="font-mono text-right">TARGET</TableHead>
              <TableHead className="font-mono">STATUS</TableHead>
              <TableHead className="font-mono">RESULT</TableHead>
              <TableHead className="font-mono text-right">PNL</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {signals?.map((signal) => (
              <TableRow key={signal.id} className={`border-white/10 hover:bg-white/[0.02] ${
                signal.status === 'settled' 
                  ? signal.accurate ? 'bg-emerald-500/[0.02]' : 'bg-red-500/[0.02]' 
                  : 'bg-amber-500/[0.02]'
              }`}>
                <TableCell className="font-mono font-bold text-foreground">{signal.asset}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`font-mono text-xs ${
                    signal.direction === 'BUY' ? 'border-emerald-500/50 text-emerald-400' :
                    signal.direction === 'SELL' ? 'border-red-500/50 text-red-400' :
                    'border-amber-500/50 text-amber-400'
                  }`}>
                    {signal.direction}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">${formatPrice(signal.targetPrice)}</TableCell>
                <TableCell>
                  <span className={`text-xs font-mono uppercase tracking-wider ${
                    signal.status === 'pending' ? 'text-amber-400' : 'text-slate-400'
                  }`}>
                    {signal.status}
                  </span>
                </TableCell>
                <TableCell>
                  {signal.status === 'settled' && signal.accurate !== null && (
                    <span className={`font-mono text-sm ${signal.accurate ? 'text-emerald-400' : 'text-red-400'}`}>
                      {signal.accurate ? '✓ ACCURATE' : '✗ INACCURATE'}
                    </span>
                  )}
                  {signal.status === 'pending' && <span className="text-slate-500 font-mono text-sm">-</span>}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {signal.pnlBps !== null && signal.pnlBps !== undefined ? (
                    <span className={signal.pnlBps > 0 ? 'text-emerald-400' : signal.pnlBps < 0 ? 'text-red-400' : 'text-slate-400'}>
                      {signal.pnlBps > 0 ? '+' : ''}{formatBps(signal.pnlBps)}
                    </span>
                  ) : '-'}
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/signals/${signal.id}`}>
                    <Button variant="ghost" size="sm" className="font-mono text-cyan-400 hover:text-cyan-300">
                      View
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {signals?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-mono">No signals found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

    </div>
  );
}
