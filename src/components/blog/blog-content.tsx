import sanitizeHtml from "sanitize-html";

import { ADMIN_HOST } from "@/lib/hosts";

/** Blog bodies are authored as HTML in the CMS, so sanitize at the public boundary. */
const adminOrigin = (process.env.ADMIN_URL ?? `https://${ADMIN_HOST}`).replace(/\/+$/, "");

function publicImageUrl(url: string | undefined) {
  return url?.startsWith("/uploads/") ? `${adminOrigin}${url}` : url;
}

export function sanitizeBlogHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "h2", "h3", "h4", "strong", "em", "b", "i", "ul", "ol", "li",
      "blockquote", "a", "img", "hr",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      img: (tagName, attributes) => {
        const src = publicImageUrl(attributes.src);
        return {
          tagName,
          attribs: src ? { ...attributes, src } : attributes,
        };
      },
      a: (tagName, attributes) => ({
        tagName,
        attribs: attributes.target === "_blank"
          ? { ...attributes, rel: "noopener noreferrer" }
          : attributes,
      }),
    },
  });
}

export function BlogContent({ html }: { html: string }) {
  return (
    <div
      className="text-ink-700 text-[1.0625rem] leading-8 [&_a]:text-navy-800 [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:border-navy-200 [&_blockquote]:text-ink-600 [&_blockquote]:my-8 [&_blockquote]:border-l-4 [&_blockquote]:pl-5 [&_h2]:text-display-sm [&_h2]:mt-12 [&_h2]:mb-4 [&_h3]:text-2xl [&_h3]:mt-10 [&_h3]:mb-3 [&_img]:rounded-card [&_img]:my-8 [&_img]:h-auto [&_img]:max-w-full [&_li]:my-2 [&_ol]:my-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-6 [&_ul]:my-6 [&_ul]:list-disc [&_ul]:pl-6"
      dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(html) }}
    />
  );
}
