import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

/* eslint-disable @next/next/no-img-element -- CMS images use runtime external URLs. */

import { CtaBanner } from "@/components/sections/cta-banner";
import { PageHero } from "@/components/layout/page-hero";
import { JsonLd, breadcrumbSchema } from "@/components/seo/json-ld";
import { Badge, Card, CardBody, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

      <PageHero
        trail={trail}
        eyebrow="Immigration insights"
        title="The Immigration Horizons blog"
        description="Practical, profession-specific articles on employment-based US immigration, including eligibility, evidence strategy, and common petition mistakes."
      >
        <div className="flex flex-wrap gap-3">
          <Button href="#articles" variant="primary" size="lg">
            Read the latest articles
          </Button>
          <Button href="/consultation" variant="outline" size="lg">
            Book a free consultation
          </Button>
        </div>
      </PageHero>

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
