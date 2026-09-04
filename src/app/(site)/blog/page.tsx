import type { Metadata } from "next";
import { ArrowRight, BookOpen } from "lucide-react";

/* eslint-disable @next/next/no-img-element -- CMS images use runtime external URLs. */

import { CtaBanner } from "@/components/sections/cta-banner";
import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { JsonLd, breadcrumbSchema } from "@/components/seo/json-ld";
import { Badge, Card, CardBody, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section, SectionHeading } from "@/components/ui/section";
import { getPublishedBlogPosts } from "@/lib/blogs";
import { baseOpenGraph } from "@/lib/seo/og";

export const metadata: Metadata = {
  title: "Immigration Blog",
  description:
    "Practical, profession-specific articles on employment-based US immigration from Immigration Horizons.",
  alternates: { canonical: "/blog" },
  openGraph: {
    ...baseOpenGraph,
    title: "Immigration Blog | Immigration Horizons",
    description: "Practical, profession-specific articles on employment-based US immigration.",
    url: "/blog",
  },
};

const trail = [
  { name: "Home", path: "/" },
  { name: "Blog", path: "/blog" },
];

function displayDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default async function BlogPage() {
  const posts = await getPublishedBlogPosts();

  return (
    <>
      <JsonLd data={breadcrumbSchema(trail)} />

      <section className="bg-navy-950 relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.15),transparent_58%)]"
        />
        <Container width="wide" className="relative py-16 sm:py-24">
          <Breadcrumbs trail={trail} tone="dark" className="mb-8" />
          <div className="max-w-3xl">
            <span className="bg-gold-500/15 text-gold-300 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-sans text-xs font-semibold">
              <BookOpen size={14} aria-hidden />
              Immigration insights
            </span>
            <h1 className="text-display-lg sm:text-display-xl mt-5 font-semibold text-white">
              The Immigration Horizons blog
            </h1>
            <p className="text-lead text-navy-200 mt-5 text-pretty">
              Practical, profession-specific articles on employment-based US
              immigration, including eligibility, evidence strategy, and common
              petition mistakes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="#articles" variant="gold" size="lg">
                Read the latest articles
              </Button>
              <Button href="/consultation" variant="inverse" size="lg">
                Book a free consultation
              </Button>
            </div>
          </div>
        </Container>
      </section>

      <Section id="articles">
        <SectionHeading
          eyebrow="Latest articles"
          title="Immigration guidance you can use"
          description="Clear explanations to help you understand the process and prepare stronger evidence."
        />
        {posts.length ? (
          <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Card
                key={post.id}
                href={`/blog/${post.slug}`}
                className="group flex h-full flex-col gap-4 overflow-hidden p-0"
              >
                {post.coverImage ? (
                  <img src={post.coverImage} alt="" className="aspect-[16/9] w-full object-cover" />
                ) : null}
                <div className="flex h-full flex-col gap-4 p-7">
                  <div className="flex items-center justify-between gap-3">
                    <Badge tone="gold">{post.category}</Badge>
                    <span className="text-ink-500 font-sans text-xs">{displayDate(post.publishedAt)}</span>
                  </div>
                  <CardTitle className="text-2xl">{post.title}</CardTitle>
                  <CardBody className="text-sm">{post.excerpt}</CardBody>
                  <span className="text-navy-700 group-hover:text-navy-900 mt-auto inline-flex items-center gap-1.5 pt-2 font-sans text-sm font-semibold">
                    Read article <ArrowRight size={15} aria-hidden />
                  </span>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-ink-600 mx-auto mt-12 max-w-2xl text-center text-pretty">
            New articles will appear here as soon as they are published.
          </p>
        )}
      </Section>

      <CtaBanner />
    </>
  );
}
