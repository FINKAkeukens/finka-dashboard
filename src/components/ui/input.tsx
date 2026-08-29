import * as React from "react"

import { cn, selectOnFocus } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onFocus, ...props }, ref) => {
    return (
      <input
        type={type}
        // Bij type="number" de hele waarde selecteren bij focus, anders
        // blijft een "0"-standaardwaarde ervoor staan zodra je gaat typen
        // (zie selectOnFocus in lib/utils.ts).
        onFocus={
          type === "number"
            ? (e) => { selectOnFocus(e); onFocus?.(e) }
            : onFocus
        }
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
