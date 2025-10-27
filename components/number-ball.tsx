import { getNumberColorClass } from "@/lib/utils/number-colors"
import { cn } from "@/lib/utils"

interface NumberBallProps {
  number: number
  size?: "sm" | "md" | "lg"
  className?: string
}

export function NumberBall({ number, size = "md", className }: NumberBallProps) {
  const sizeClasses = {
    sm: "w-8 h-8 text-sm",
    md: "w-10 h-10 text-base",
    lg: "w-12 h-12 text-lg",
  }

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-bold",
        getNumberColorClass(number),
        sizeClasses[size],
        className,
      )}
    >
      {number}
    </div>
  )
}
