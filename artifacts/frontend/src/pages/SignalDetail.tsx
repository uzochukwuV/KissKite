import { useGetSignal, useGetAgent } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { formatPrice, formatBps, truncateAddress } from "@/lib/utils";
import { CountdownTimer } from "@/components/CountdownTimer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Copy, CheckCircle2, XCircle, Clock, ShieldCheck } from "lucide-react";
import { KITE_EXPLORER } from "@/lib/contracts";

export default function SignalDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);

  const { data: signal, isLoading } = useGetSignal(id, { query: { enabled: !!id } });
  const { data: agent } = useGetAgent(signal?.agentId ?? 0, { query: { enabled: !!signal?.agentId } });

  if (isLoading || !signal) {
    return <div className="container mx-auto p-8 font-mono animate-pulse">Loading signal data...</div>;
  }

  const isBuy = signal.direction === 'BUY';
  const isSell = signal.direction === 'SELL';
  
  const dirColor = isBuy ? 'text-emerald-400 border-emerald-500/50' : 
                   isSell ? 'text-red-400 border-red-500/50' : 
                   'text-amber-400 border-amber-500/50';

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/signals">
          <Button variant="ghost" className="font-mono text-cyan-500 hover:text-cyan-400 pl-0">&larr; Back to Feed</Button>
        </Link>
        <Badge variant="outline" className={`font-mono uppercase ${
          signal.status === 'settled' ? 'border-slate-500 text-slate-400' : 'border-amber-500/50 text-amber-500'
        }`}>
          {signal.status}
        </Badge>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Main Prediction Panel */}
        <div className="md:col-span-2 space-y-6">
          <div className="glass-panel border-white/10 rounded-xl p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
            
            <div className="flex items-center gap-4 mb-8">
              <div className="text-4xl font-bold font-mono tracking-wider">{signal.asset}</div>
              <Badge variant="outline" className={`text-lg px-4 py-1 ${dirColor} bg-background`}>
                {signal.direction}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <div className="text-sm font-mono text-slate-500 uppercase tracking-wider mb-2">Target Price</div>
                <div className="text-3xl font-mono text-foreground">${formatPrice(signal.targetPrice)}</div>
              </div>
              <div>
                <div className="text-sm font-mono text-slate-500 uppercase tracking-wider mb-2">Expiration</div>
                <div className="text-2xl font-mono text-foreground">
                  {signal.status === 'pending' ? (
                    <CountdownTimer targetDate={signal.expiration} />
                  ) : (
                    <span className="text-slate-400">{new Date(signal.expiration).toLocaleString()}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Outcome Panel */}
            {signal.status === 'settled' && (
              <div className={`p-6 rounded-lg border ${signal.accurate ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {signal.accurate ? <CheckCircle2 className="w-8 h-8 text-emerald-500" /> : <XCircle className="w-8 h-8 text-red-500" />}
                    <div>
                      <div className={`font-mono font-bold text-xl ${signal.accurate ? 'text-emerald-500' : 'text-red-500'}`}>
                        {signal.accurate ? 'ACCURATE PREDICTION' : 'INACCURATE PREDICTION'}
                      </div>
                      <div className="text-sm font-mono text-slate-400 mt-1">
                        Settled at {new Date(signal.settledAt!).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {signal.pnlBps !== null && signal.pnlBps !== undefined && (
                    <div className="text-right">
                      <div className="text-xs font-mono text-slate-400 mb-1">REALIZED PNL</div>
                      <div className={`font-mono text-2xl font-bold ${signal.pnlBps > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {signal.pnlBps > 0 ? '+' : ''}{formatBps(signal.pnlBps)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {signal.status === 'pending' && (
              <div className="p-6 rounded-lg border border-amber-500/30 bg-amber-500/5 flex items-center justify-center gap-3 text-amber-500 font-mono">
                <Clock className="w-5 h-5 animate-pulse" />
                Waiting for market resolution...
              </div>
            )}
          </div>

          {/* Cryptographic Proof */}
          <div className="glass-panel border-white/10 rounded-xl p-6">
            <h3 className="font-mono font-bold text-lg mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-cyan-500" /> Cryptographic Proof
            </h3>
            <div className="space-y-4">
              <div>
                <div className="text-xs font-mono text-slate-500 mb-1">SIGNAL HASH (COMMITTED)</div>
                <div className="bg-black/50 p-3 rounded border border-white/5 font-mono text-sm text-cyan-400 break-all flex items-start gap-2">
                  {signal.signalHash}
                  <button className="text-slate-500 hover:text-cyan-400" onClick={() => navigator.clipboard.writeText(signal.signalHash)}><Copy className="w-4 h-4" /></button>
                </div>
              </div>
              
              {signal.onChainTxHash && (
                <div>
                  <div className="text-xs font-mono text-slate-500 mb-1">ON-CHAIN TX</div>
                  <a href={`${KITE_EXPLORER}/tx/${signal.onChainTxHash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-mono text-sm text-cyan-500 hover:text-cyan-400 hover:underline">
                    {truncateAddress(signal.onChainTxHash)} <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Agent Card */}
          <div className="glass-panel border-white/10 rounded-xl p-6">
            <h3 className="font-mono text-sm text-slate-500 mb-4 uppercase tracking-wider">Generated By</h3>
            {agent ? (
              <div>
                <div className="font-mono font-bold text-lg mb-1">{agent.name}</div>
                <div className="font-mono text-xs text-slate-400 mb-4">{truncateAddress(agent.walletAddress)}</div>
                
                <div className="grid grid-cols-2 gap-2 mb-6">
                  <div className="bg-white/5 p-3 rounded">
                    <div className="text-xs font-mono text-slate-500 mb-1">ACCURACY</div>
                    <div className="font-mono text-emerald-400">{formatBps(agent.accuracyRate)}</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded">
                    <div className="text-xs font-mono text-slate-500 mb-1">SIGNALS</div>
                    <div className="font-mono text-slate-300">{agent.totalSignals}</div>
                  </div>
                </div>
                
                <Link href={`/agents/${agent.id}`}>
                  <Button className="w-full font-mono bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30">
                    View Full Profile
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="animate-pulse space-y-4">
                <div className="h-6 w-32 bg-white/10 rounded"></div>
                <div className="h-20 w-full bg-white/10 rounded"></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
