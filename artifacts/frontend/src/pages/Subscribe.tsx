import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useState } from "react";
import { SubscriptionPassABI, SUBSCRIPTION_PASS_ADDRESS, USDT_ADDRESS, MinimalERC20ABI } from "@/lib/contracts";
import { useRegisterSubscriber } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Zap, Shield, Crown, Loader2 } from "lucide-react";
import confetti from "canvas-confetti";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { formatUnits, parseUnits } from "viem";

export default function Subscribe() {
  const { address, isConnected } = useAccount();
  const [, setLocation] = useLocation();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  const { data: isActive, refetch: refetchStatus } = useReadContract({
    address: SUBSCRIPTION_PASS_ADDRESS,
    abi: SubscriptionPassABI,
    functionName: "isActive",
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDT_ADDRESS,
    abi: MinimalERC20ABI,
    functionName: "allowance",
    args: address ? [address, SUBSCRIPTION_PASS_ADDRESS] : undefined,
    query: { enabled: !!address }
  });

  const registerSubscriber = useRegisterSubscriber();

  const { writeContractAsync, isPending } = useWriteContract();

  const tiers = [
    { id: "basic", name: "Basic", price: 1, duration: 7, icon: Shield, desc: "Essential signal access" },
    { id: "pro", name: "Pro", price: 5, duration: 7, icon: Zap, desc: "Real-time WebSocket stream", recommended: true },
    { id: "elite", name: "Elite", price: 15, duration: 30, icon: Crown, desc: "Unrestricted API access" },
  ];

  const handleSubscribe = async (tier: typeof tiers[0]) => {
    if (!address) return;
    setSelectedTier(tier.id);
    
    try {
      const priceWei = parseUnits(tier.price.toString(), 6); // Assuming USDT has 6 decimals, but let's use 18 for mock
      
      // Step 1: Approve if needed
      if ((allowance ?? 0n) < priceWei) {
        toast.info("Approving USDT...");
        const approveTx = await writeContractAsync({
          address: USDT_ADDRESS,
          abi: MinimalERC20ABI,
          functionName: "approve",
          args: [SUBSCRIPTION_PASS_ADDRESS, priceWei],
        });
        toast.success("Approval submitted, waiting for confirmation...");
        // In a real app we'd wait for receipt here
      }

      // Step 2: Purchase
      toast.info("Purchasing subscription...");
      let tierEnum = 0; // basic
      if (tier.id === 'pro') tierEnum = 1;
      if (tier.id === 'elite') tierEnum = 2;

      const purchaseTx = await writeContractAsync({
        address: SUBSCRIPTION_PASS_ADDRESS,
        abi: SubscriptionPassABI,
        functionName: "purchase",
        args: [tierEnum],
      });
      
      toast.success("Purchase submitted!");

      // Step 3: Backend registration
      const sessionToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + tier.duration * 24 * 60 * 60 * 1000).toISOString();
      
      await registerSubscriber.mutateAsync({
        data: {
          sessionToken,
          walletAddress: address,
          tier: tier.id,
          expiresAt
        }
      });

      localStorage.setItem('kite_session_token', sessionToken);
      
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#06b6d4', '#10b981', '#f59e0b']
      });

      setTimeout(() => {
        setLocation('/signals');
      }, 2000);

    } catch (err: any) {
      console.error(err);
      toast.error(err.shortMessage || err.message || "Transaction failed");
    } finally {
      setSelectedTier(null);
    }
  };

  if (isActive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-6 border border-emerald-500/30">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-mono font-bold mb-4">Active Subscription</h1>
        <p className="text-muted-foreground max-w-md mb-8">
          Your wallet holds an active Kite Subscription Pass. You have full access to the live signal feed.
        </p>
        <Button onClick={() => setLocation('/signals')} className="bg-cyan-500 hover:bg-cyan-600 font-mono">
          Go to Terminal
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-mono font-bold mb-4">Terminal Access</h1>
        <p className="text-muted-foreground font-mono">Unlock real-time verified AI trading signals.</p>
      </div>

      {!isConnected ? (
        <div className="glass-panel max-w-md mx-auto p-8 text-center rounded-xl border border-white/10">
          <Shield className="w-12 h-12 text-cyan-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold font-mono mb-2">Connect Wallet</h3>
          <p className="text-muted-foreground text-sm mb-6">You need to connect your Web3 wallet to purchase a subscription pass.</p>
          {/* We rely on the Navbar WalletButton for connection right now */}
          <p className="text-cyan-400 font-mono text-sm">Please use the connect button in the navigation bar.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-8">
          {tiers.map((tier) => (
            <Card key={tier.id} className={`glass-panel border-white/10 relative overflow-hidden ${tier.recommended ? 'border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.1)]' : ''}`}>
              {tier.recommended && (
                <div className="absolute top-0 right-0 bg-cyan-500 text-slate-900 text-xs font-bold font-mono px-3 py-1 rounded-bl-lg">
                  RECOMMENDED
                </div>
              )}
              <CardHeader>
                <tier.icon className={`w-10 h-10 mb-4 ${tier.recommended ? 'text-cyan-400' : 'text-slate-400'}`} />
                <CardTitle className="font-mono text-2xl">{tier.name}</CardTitle>
                <CardDescription className="font-mono">{tier.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2 mb-6">
                  <span className="text-4xl font-bold font-mono">{tier.price}</span>
                  <span className="text-muted-foreground font-mono">USDT</span>
                </div>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-center gap-2 text-sm text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {tier.duration} Days Access
                  </li>
                  <li className="flex items-center gap-2 text-sm text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Verified On-Chain
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button 
                  className={`w-full font-mono ${tier.recommended ? 'bg-cyan-500 hover:bg-cyan-600 text-slate-900' : 'bg-white/10 hover:bg-white/20'}`}
                  onClick={() => handleSubscribe(tier)}
                  disabled={isPending || selectedTier !== null}
                  data-testid={`button-subscribe-${tier.id}`}
                >
                  {selectedTier === tier.id ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                  ) : (
                    'Subscribe'
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
