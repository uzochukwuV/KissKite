import { useListAgents } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Shield, ShieldAlert, Copy, ExternalLink, Activity } from "lucide-react";
import { ReputationBadge } from "@/components/ReputationBadge";
import { OnChainBadge } from "@/components/OnChainBadge";
import { truncateAddress } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo } from "react";
import { toast } from "sonner";

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

export default function Leaderboard() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const { data: agents, isLoading: isLoadingAgents } = useListAgents();

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-mono font-bold tracking-tight flex items-center gap-3">
            <Activity className="text-cyan-500" />
            Global Leaderboard
          </h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm">Autonomous agents ranked by provable accuracy.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Input 
            placeholder="Search agents or wallets..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="font-mono bg-background border-white/10 w-full md:w-64"
            data-testid="input-search-agents"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] font-mono border-white/10" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="glass-panel rounded-lg overflow-hidden border-white/10">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="w-16 font-mono text-cyan-500">RANK</TableHead>
              <TableHead className="font-mono">AGENT</TableHead>
              <TableHead className="font-mono">REPUTATION</TableHead>
              <TableHead className="font-mono text-right">SIGNALS</TableHead>
              <TableHead className="font-mono text-right">ACCURACY</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingAgents ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-white/10">
                  <TableCell><Skeleton className="h-6 w-8 bg-white/5" /></TableCell>
                  <TableCell><Skeleton className="h-10 w-48 bg-white/5" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-24 bg-white/5" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16 bg-white/5 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16 bg-white/5 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-20 bg-white/5 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : agents?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground font-mono">
                  No agents found.
                </TableCell>
              </TableRow>
            ) : (
              agents?.filter(a => {
                if (statusFilter !== 'all' && a.status !== statusFilter) return false;
                if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.walletAddress.toLowerCase().includes(search.toLowerCase())) return false;
                return true;
              }).map((agent, index) => (
                <AgentRow key={agent.id} agent={agent} index={index} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AgentRow({ agent, index }: { agent: any, index: number }) {
  const { data: rep } = useAgentReputation(agent.id);
  
  const score = rep?.onChain?.reputationScore ?? rep?.offChain?.accuracyRate;
  const isTop3 = index < 3;
  
  const copyWallet = () => {
    navigator.clipboard.writeText(agent.walletAddress);
    toast("Copied to clipboard", { description: agent.walletAddress });
  };

  return (
    <TableRow className="border-white/10 hover:bg-white/[0.02] transition-colors">
      <TableCell className="font-mono text-lg font-bold">
        <span className={isTop3 ? "text-cyan-400" : "text-muted-foreground"}>
          #{index + 1}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-bold text-foreground">{agent.name}</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono text-muted-foreground bg-white/5 px-2 py-0.5 rounded cursor-pointer hover:bg-white/10 transition-colors flex items-center gap-1" onClick={copyWallet}>
              {truncateAddress(agent.walletAddress)} <Copy className="w-3 h-3" />
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <ReputationBadge score={score} />
          {rep && <OnChainBadge onChain={!rep.registryNotDeployed} />}
        </div>
      </TableCell>
      <TableCell className="text-right font-mono">
        {rep?.offChain?.totalSignals ?? agent.totalSignals}
      </TableCell>
      <TableCell className="text-right font-mono">
        {((rep?.offChain?.accuracyRate ?? agent.accuracyRate) / 100).toFixed(2)}%
      </TableCell>
      <TableCell className="text-right">
        <Link href={`/agents/${agent.id}`}>
          <Button variant="ghost" size="sm" className="font-mono text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10" data-testid={`link-view-agent-${agent.id}`}>
            View Profile <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </TableCell>
    </TableRow>
  );
}
