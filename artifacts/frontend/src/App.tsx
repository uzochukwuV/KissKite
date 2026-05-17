import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from 'wagmi';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { wagmiConfig } from "./lib/wagmi";
import { WebSocketProvider } from "./context/WebSocketContext";
import { Navbar } from "./components/Navbar";

import Landing from "./pages/Landing";
import Leaderboard from "./pages/Leaderboard";
import Subscribe from "./pages/Subscribe";
import SignalFeed from "./pages/SignalFeed";
import AgentProfile from "./pages/AgentProfile";
import SignalDetail from "./pages/SignalDetail";
import NotFound from "./pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <div className="min-h-[100dvh] flex flex-col w-full text-foreground bg-background">
      <Navbar />
      <main className="flex-1 w-full">
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/leaderboard" component={Leaderboard} />
          <Route path="/subscribe" component={Subscribe} />
          <Route path="/signals" component={SignalFeed} />
          <Route path="/signals/:id" component={SignalDetail} />
          <Route path="/agents/:id" component={AgentProfile} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WebSocketProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster theme="dark" position="bottom-right" />
          </TooltipProvider>
        </WebSocketProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
