import { Link, useLocation } from "wouter";
import { WalletButton } from "./WalletButton";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [location] = useLocation();

  const links = [
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/signals", label: "Live Feed" },
    { href: "/subscribe", label: "Subscribe" },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors">
            <Activity className="w-6 h-6" />
            <span className="font-mono font-bold tracking-widest text-lg">KITE SIGNAL</span>
          </Link>
          
          <div className="hidden md:flex items-center gap-6">
            {links.map(link => (
              <Link key={link.href} href={link.href}>
                <span className={cn(
                  "text-sm font-mono uppercase tracking-wider transition-colors hover:text-cyan-400 cursor-pointer",
                  location.startsWith(link.href) ? "text-cyan-400 font-bold" : "text-muted-foreground"
                )}>
                  {link.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <WalletButton />
        </div>
      </div>
    </nav>
  );
}
