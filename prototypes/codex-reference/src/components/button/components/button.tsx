import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { type ComponentProps, useId } from "react";

import {
  Button as ShadcnButton,
  buttonVariants as shadcnButtonVariants,
} from "@/components/ui/button";

import { ButtonContent } from "./button-content";

const depthVariants = cva("relative", {
  variants: {
    variant: {
      default:
        "border-primary bg-primary text-primary-foreground shadow-sm [corner-shape:squircle] hover:bg-primary/90 supports-[corner-shape:squircle]:rounded-[0.75rem]",
      outline:
        "border-border bg-background text-foreground shadow-sm aria-expanded:bg-secondary hover:bg-muted [corner-shape:squircle] supports-[corner-shape:squircle]:rounded-[0.75rem]",
      secondary:
        "border-foreground bg-foreground text-background shadow-sm hover:bg-foreground/90 [corner-shape:squircle] supports-[corner-shape:squircle]:rounded-[0.75rem]",
      ghost: "",
      destructive:
        "border-destructive bg-destructive text-white shadow-sm focus-visible:border-destructive/40 focus-visible:ring-destructive/20 hover:bg-destructive/90 [corner-shape:squircle] supports-[corner-shape:squircle]:rounded-[0.75rem]",
      link: "text-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

type ButtonVariantProps = VariantProps<typeof shadcnButtonVariants>;

function buttonVariants({
  className,
  ...props
}: ButtonVariantProps & { className?: string } = {}) {
  return cn(shadcnButtonVariants(props), depthVariants(props), className);
}

type ButtonProps = ComponentProps<typeof ShadcnButton> & {
  /** Swaps the label for bouncing dots while an action runs. */
  loading?: boolean;
  /**
   * Fills the button from the left, from 0 to 100, e.g. while a file
   * uploads. Set it back to `undefined` when the work is done: the bar fills
   * up and fades out. For work you can't measure, use `loading`.
   */
  progress?: number;
};

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  progress,
  disabled,
  focusableWhenDisabled,
  "aria-describedby": ariaDescribedBy,
  children,
  ...props
}: ButtonProps) {
  const hasProgress = progress !== undefined;
  const busy = loading || hasProgress;
  const progressTextId = useId();

  return (
    <ShadcnButton
      aria-busy={busy || undefined}
      aria-describedby={
        hasProgress
          ? [ariaDescribedBy, progressTextId].filter(Boolean).join(" ")
          : ariaDescribedBy
      }
      className={cn(
        depthVariants({ variant }),
        "has-data-[clip]:overflow-hidden",
        busy && "cursor-progress",
        className
      )}
      data-loading={loading ? "" : undefined}
      disabled={disabled || busy}
      focusableWhenDisabled={focusableWhenDisabled ?? busy}
      size={size}
      variant={variant}
      {...props}
    >
      <ButtonContent
        loading={loading}
        progress={progress}
        progressTextId={progressTextId}
      >
        {children}
      </ButtonContent>
    </ShadcnButton>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
