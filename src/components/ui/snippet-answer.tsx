import { cn } from "@/lib/utils";

/**
 * A direct, self-contained answer placed immediately under a question-form
 * heading. Kept to roughly 40–60 words and free of pronouns that depend on
 * surrounding text, which is what makes a passage liftable as a featured
 * snippet. The gold rule marks it visually as the definition.
 */
export function SnippetAnswer({
  children,
  tone = "light",
  className,
}: {
  children: React.ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "border-gold-500 border-l-3 py-1 pl-5 text-[1.0625rem] leading-relaxed font-medium text-pretty",
        tone === "light" ? "text-navy-800" : "text-white",
        className,
      )}
    >
      {children}
    </p>
  );
}
