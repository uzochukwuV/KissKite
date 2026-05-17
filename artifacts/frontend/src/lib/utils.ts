import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBps(bps: number | undefined | null): string {
  if (bps === undefined || bps === null) return "0.00%";
  return (bps / 100).toFixed(2) + "%";
}

export function truncateAddress(address: string | undefined | null): string {
  if (!address) return "";
  if (address.length < 10) return address;
  return address.slice(0, 6) + "..." + address.slice(-4);
}

export function formatPrice(priceStr: string | undefined | null): string {
  if (!priceStr) return "0.00";
  const num = parseFloat(priceStr);
  if (isNaN(num)) return priceStr;
  
  if (num > 1000) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (num > 1) {
    return num.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  } else {
    return num.toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 8 });
  }
}
