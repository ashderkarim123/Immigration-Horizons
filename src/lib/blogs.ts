import "server-only";

import { connection } from "next/server";

import { getDb } from "@/lib/db";
import { ADMIN_HOST } from "@/lib/hosts";
import { BlogPost } from "@/lib/models/BlogPost";

export type PublishedBlogPost = {
  id: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  coverImage: string;
  author: string;
  tags: string[];
  readingTime: number;
  publishedAt: Date;
  updatedAt: Date;
};

const adminOrigin = (process.env.ADMIN_URL ?? `https://${ADMIN_HOST}`).replace(/\/+$/, "");

function publicImageUrl(url: string): string {
  return url.startsWith("/uploads/") ? `${adminOrigin}${url}` : url;
}

function toPublishedPost(post: {
  _id: { toString(): string };
  title: string;
  slug: string;
  category?: string;
  excerpt: string;
  content: string;
  coverImage?: string;
  author?: string;
  tags?: string[];
  readingTime?: number;
  publishDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PublishedBlogPost {
  return {
    id: post._id.toString(),
    title: post.title,
    slug: post.slug,
    category: post.category ?? "Immigration Tips",
    excerpt: post.excerpt,
    content: post.content,
    coverImage: publicImageUrl(post.coverImage ?? ""),
    author: post.author ?? "Immigration Horizons Team",
    tags: post.tags ?? [],
    readingTime: post.readingTime ?? 0,
    publishedAt: post.publishDate ?? post.createdAt,
    updatedAt: post.updatedAt,
  };
}

function visiblePublishedFilter(now: Date) {
  return {
    published: true,
    $or: [{ publishDate: null }, { publishDate: { $lte: now } }],
  };
}

/** CMS content is request-time: publishing in Express cannot invalidate Next. */
async function ensureRequestDatabase() {
  await connection();
  return getDb();
}

export async function getPublishedBlogPosts(): Promise<PublishedBlogPost[]> {
  if (!(await ensureRequestDatabase())) return [];
  const posts = await BlogPost.find(visiblePublishedFilter(new Date()))
    .sort({ publishDate: -1, createdAt: -1 })
    .lean();
  return posts.map((post) => toPublishedPost(post));
}

export async function getPublishedBlogPost(slug: string): Promise<PublishedBlogPost | null> {
  if (!(await ensureRequestDatabase())) return null;
  const post = await BlogPost.findOne({ ...visiblePublishedFilter(new Date()), slug }).lean();
  return post ? toPublishedPost(post) : null;
}
