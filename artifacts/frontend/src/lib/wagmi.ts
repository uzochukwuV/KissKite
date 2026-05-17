import { createConfig, http } from 'wagmi'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'

export const kiteTestnet = defineChain({
  id: 2368,
  name: 'Kite Testnet',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-testnet.gokite.ai'] } },
})

export const wagmiConfig = createConfig({
  chains: [kiteTestnet],
  transports: { [kiteTestnet.id]: http() },
  connectors: [injected()],
})
