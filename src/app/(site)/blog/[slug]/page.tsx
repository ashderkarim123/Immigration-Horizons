import type { Metadata } from "next";
import { notFound } from "next/navigation";

/* eslint-disable @next/next/no-img-element -- CMS images use runtime external URLs. */

import { BlogContent } from "@/components/blog/blog-content";
import { CtaBanner } from "@/components/sections/cta-banner";
import { Breadcrumbs } from "@/components/service/breadcrumbs";
import { JsonLd, breadcrumbSchema } from "@/components/seo/json-ld";
import { Badge } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { getPublishedBlogPost } from "@/lib/blogs";
import { site } from "@/lib/content/site";
import { articleOpenGraph } from "@/lib/seo/og";

type RouteProps = { params: Promise<{ slug: string }> };

function displayDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedBlogPost(slug);
  if (!post) return {};

  return {
    title: { absolute: `${post.title} | ${site.name}` },
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      ...articleOpenGraph,
      title: `${post.title} | ${site.name}`,
      description: post.excerpt,
      url: `/blog/${post.slug}`,
      publishedTime: post.publishedAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      authors: [post.author],
      images: post.coverImage
        ? [{ url: post.coverImage, alt: post.title }]
        : articleOpenGraph.images,
    },
  };
}

export default async function BlogPostPage({ params }: RouteProps) {
  const { slug } = await params;
  const post = await getPublishedBlogPost(slug);
  if (!post) notFound();

  const trail = [
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: post.title, path: `/blog/${post.slug}` },
  ];
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: { "@type": "Organization", name: post.author },
    publisher: { "@type": "Organization", name: site.name },
    mainEntityOfPage: `${site.url}/blog/${post.slug}`,
    ...(post.coverImage ? { image: post.coverImage } : {}),
  };

  return (
    <>
      <JsonLd data={[breadcrumbSchema(trail), articleSchema]} />
      <section className="bg-navy-950 relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(201,153,46,0.15),transparent_58%)]"
        />
        <Container width="wide" className="relative py-16 sm:py-24">
          <Breadcrumbs trail={trail} tone="dark" className="mb-8" />
          <div className="max-w-4xl">
            <Badge tone="gold">{post.category}</Badge>
            <h1 className="text-display-lg sm:text-display-xl mt-5 font-semibold text-white">
              {post.title}
            </h1>
            <p className="text-lead text-navy-200 mt-5 text-pretty">{post.excerpt}</p>
            <p className="text-navy-300 mt-7 font-sans text-sm">
              By {post.author} · {displayDate(post.publishedAt)}
              {post.readingTime > 0 ? ` · ${post.readingTime} min read` : ""}
            </p>
          </div>
        </Container>
      </section>

      <Container width="prose" className="py-14 sm:py-20">
        {post.coverImage ? (
          <img
            src={post.coverImage}
            alt=""
            className="rounded-panel mb-12 aspect-[2/1] w-full object-cover shadow-card"
          />
        ) : null}
        <article>
          <BlogContent html={post.content} />
          {post.tags.length ? (
            <div className="border-ink-200 mt-12 flex flex-wrap gap-2 border-t pt-8">
              {post.tags.map((tag) => (
                <Badge key={tag} tone="neutral">{tag}</Badge>
              ))}
            </div>
          ) : null}
        </article>
      </Container>
      <CtaBanner />
    </>
  );
}
