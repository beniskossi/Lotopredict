
import { getBallColor } from '@/lib/lotoUtils';
import { cn } from '@/lib/utils';

interface LotoBallProps {
  number: number;
  size?: 'sm' | 'md' | 'lg';
}

export function LotoBall({ number, size = 'md' }: LotoBallProps) {
  const colorClasses = getBallColor(number);
  
  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
  };

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full font-bold border-2 shadow-md transition-all duration-300 ease-in-out transform hover:scale-110',
        colorClasses,
        sizeClasses[size]
      )}
      aria-label={`Numéro ${number}`}
    >
      {number}
    </div>
  );
}
