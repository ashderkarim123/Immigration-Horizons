import "server-only";

import mongoose, { Schema } from "mongoose";

/**
 * Public-site mirror of server/models/BlogPost.js. The admin CMS owns blog
 * authoring; this model only reads published posts from the shared database.
 */
export const BLOG_CATEGORIES = [
  "EB-2 NIW",
  "EB-1A",
  "USCIS Updates",
  "Success Stories",
  "Immigration Tips",
] as const;

const BlogPostSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true },
    category: { type: String, enum: BLOG_CATEGORIES, default: "Immigration Tips" },
    excerpt: { type: String, required: true, trim: true, maxlength: 300 },
    content: { type: String, required: true },
    coverImage: { type: String, default: "" },
    author: { type: String, default: "Immigration Horizons Team" },
    tags: { type: [String], default: [] },
    readingTime: { type: Number, default: 0 },
    published: { type: Boolean, default: true },
    publishDate: { type: Date, default: null },
  },
  { timestamps: true },
);

export const BlogPost =
  mongoose.models.BlogPost || mongoose.model("BlogPost", BlogPostSchema);
