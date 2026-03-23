import * as React from "react"
import { cn } from "../../lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: 'default' | 'sm' | 'lg'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          {
            'default': "bg-primary text-primary-foreground hover:bg-primary/90",
            'secondary': "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            'outline': "border border-input bg-background hover:bg-accent",
            'ghost': "hover:bg-accent hover:text-accent-foreground",
            'destructive': "bg-destructive text-destructive-foreground hover:bg-destructive/90",
          }[variant],
          {
            'default': "h-10 px-4 py-2",
            'sm': "h-9 px-3 text-sm",
            'lg': "h-11 px-8",
          }[size],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)

export { Button }
