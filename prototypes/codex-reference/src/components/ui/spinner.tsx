import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon } from "@hugeicons/core-free-icons"

function Spinner({ className, strokeWidth, ...props }: React.ComponentProps<"svg">) {
  return (
    <HugeiconsIcon icon={Loading03Icon} strokeWidth={strokeWidth === undefined ? 2 : Number(strokeWidth)} data-slot="spinner" role="status" aria-label="Carregando" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
