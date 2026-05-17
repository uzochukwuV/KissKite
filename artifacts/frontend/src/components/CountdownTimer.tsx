import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

export function CountdownTimer({ targetDate, className }: { targetDate: string, className?: string }) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const target = new Date(targetDate).getTime();
    
    const update = () => {
      const now = new Date().getTime();
      const diff = target - now;
      
      if (diff <= 0) {
        setTimeLeft('00:00:00');
        setIsExpired(true);
        return;
      }
      
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeLeft(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
      setIsExpired(false);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return (
    <span className={cn("font-mono", isExpired ? "text-muted-foreground" : "text-amber-500", className)}>
      {timeLeft}
    </span>
  );
}
