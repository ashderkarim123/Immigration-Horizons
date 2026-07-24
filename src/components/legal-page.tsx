import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/section";
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
      <section className="bg-navy-900 relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.12),transparent_60%)]"
        />
        <Container width="wide" className="relative py-14 sm:py-16">
          <Breadcrumbs trail={trail} tone="dark" className="mb-8" />
          <Eyebrow className="text-gold-300">Legal</Eyebrow>
          <h1 className="text-display-lg mt-4 font-semibold text-white">
            {title}
          </h1>
          <p className="text-navy-200 mt-4 max-w-2xl text-pretty">{intro}</p>
          <p className="text-navy-400 mt-4 font-sans text-xs">
            Last updated: {updated}
          </p>
        </Container>
      </section>

      <Container width="default" className="py-16 sm:py-20">
        <div className="mx-auto flex max-w-[68ch] flex-col gap-10">
          {blocks.map((block) => (
            <section key={block.heading}>
              <h2 className="font-display text-navy-800 text-xl font-semibold">
                {block.heading}
              </h2>
              <div className="mt-3 flex flex-col gap-3">
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

          <p className="text-ink-500 border-ink-200 border-t pt-8 text-sm leading-relaxed">
            {site.disclaimer}
          </p>
        </div>
      </Container>
    </>
  );
}
