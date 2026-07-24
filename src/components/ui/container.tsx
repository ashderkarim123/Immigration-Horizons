import { cn } from "@/lib/utils";

const widths = {
  /** Long-form reading measure — blog posts, legal copy. */
  prose: "max-w-[68ch]",
  /** Default page width. */
  default: "max-w-6xl",
  /** Full-bleed marketing sections. */
  wide: "max-w-7xl",
} as const;

export function Container({
  width = "default",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { width?: keyof typeof widths }) {
  return (
    <div
      className={cn("mx-auto w-full px-6 sm:px-8", widths[width], className)}
      {...props}
    >
      {children}
    </div>
  );
}
