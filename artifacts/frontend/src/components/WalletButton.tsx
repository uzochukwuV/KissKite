import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { Button } from '@/components/ui/button';
import { truncateAddress } from '@/lib/utils';
import { KITE_CHAIN_ID } from '@/lib/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut, Wallet } from 'lucide-react';

export function WalletButton() {
  const { address, isConnected, chain } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    return (
      <Button 
        variant="outline" 
        className="border-cyan-500 text-cyan-500 hover:bg-cyan-500/10 font-mono"
        onClick={() => connect({ connector: connectors[0] })}
      >
        <Wallet className="w-4 h-4 mr-2" />
        Connect Wallet
      </Button>
    );
  }

  if (chain?.id !== KITE_CHAIN_ID) {
    return (
      <Button 
        variant="destructive" 
        className="font-mono"
        onClick={() => switchChain({ chainId: KITE_CHAIN_ID })}
      >
        Switch to Kite Testnet
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-400 font-mono">
          <div className="w-2 h-2 rounded-full bg-cyan-500 mr-2 animate-pulse" />
          {truncateAddress(address)}
          <ChevronDown className="w-4 h-4 ml-2 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card border-border">
        <DropdownMenuItem onClick={() => disconnect()} className="text-destructive focus:bg-destructive/10 cursor-pointer font-mono">
          <LogOut className="w-4 h-4 mr-2" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
