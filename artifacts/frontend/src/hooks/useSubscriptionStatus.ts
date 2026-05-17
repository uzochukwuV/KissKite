import { useAccount, useReadContract } from 'wagmi';
import { SubscriptionPassABI, SUBSCRIPTION_PASS_ADDRESS } from '../lib/contracts';

export function useSubscriptionStatus() {
  const { address } = useAccount();
  
  const { data: isActive, isLoading, refetch } = useReadContract({
    address: SUBSCRIPTION_PASS_ADDRESS,
    abi: SubscriptionPassABI,
    functionName: 'isActive',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    }
  });

  return {
    isActive: !!isActive,
    isLoading,
    refetch
  };
}
