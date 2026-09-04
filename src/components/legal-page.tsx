import { PageHero } from "@/components/layout/page-hero";
import { Container } from "@/components/ui/container";
import type { LegalBlock } from "@/lib/content/legal";
import { site } from "@/lib/content/site";

/** Shared layout for Privacy and Terms — long-form legal reading measure. */
export function LegalPage({
  title,
  intro,
  updated,
  blocks,
  crumbName,
  crumbPath,
}: {
  title: string;
  intro: string;
  updated: string;
  blocks: LegalBlock[];
  crumbName: string;
  crumbPath: string;
}) {
  const trail = [
    { name: "Home", path: "/" },
    { name: crumbName, path: crumbPath },
  ];

  return (
    <>
      <PageHero
        trail={trail}
        eyebrow="Legal"
        title={title}
        description={<p>{intro}</p>}
      >
        <p className="text-navy-300 font-sans text-xs">
          Last updated: {updated}
        </p>
      </PageHero>

      <Container width="default" className="py-16 sm:py-20">
        <div className="mx-auto flex max-w-[68ch] flex-col gap-12">
          {blocks.map((block, index) => (
            <section key={block.heading} className="relative pl-8">
              <span
                aria-hidden
                className="text-gold-600 absolute top-1 left-0 font-sans text-xs font-bold tabular-nums"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2 className="font-display text-navy-800 text-xl font-semibold">
                {block.heading}
              </h2>
              <div className="mt-4 flex flex-col gap-3">
                {block.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph.slice(0, 40)}
                    className="text-ink-600 leading-[1.75] text-pretty"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}

          <p className="rounded-card border-ink-200 bg-ink-50 text-ink-600 border p-6 text-sm leading-relaxed">
            {site.disclaimer}
          </p>
        </div>
      </Container>
    </>
  );
}
