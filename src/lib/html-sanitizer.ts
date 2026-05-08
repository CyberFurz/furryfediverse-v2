import sanitizeHtml from "sanitize-html";

const ARTICLE_IFRAME_HOSTNAMES = [
  "www.youtube.com",
  "youtube.com",
  "m.youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
];

const profileAllowedTags = [
  ...sanitizeHtml.defaults.allowedTags,
  "p",
  "br",
  "span",
  "div",
  "blockquote",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "a",
];

const articleAllowedTags = [
  ...profileAllowedTags,
  "img",
  "iframe",
  "figure",
  "figcaption",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "sup",
  "sub",
];

export function sanitizeProfileHtml(input: string | null | undefined): string {
  if (!input) return "";

  return sanitizeHtml(input, {
    allowedTags: profileAllowedTags,
    allowedAttributes: {
      a: ["href", "name", "target", "rel", "title"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      a: ["http", "https", "mailto"],
    },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
}

export function sanitizeArticleHtml(input: string | null | undefined): string {
  if (!input) return "";

  return sanitizeHtml(input, {
    allowedTags: articleAllowedTags,
    allowedAttributes: {
      a: ["href", "name", "target", "rel", "title"],
      img: ["src", "alt", "title", "width", "height", "loading", "referrerpolicy"],
      iframe: ["src", "title", "width", "height", "allow", "allowfullscreen", "referrerpolicy", "loading"],
      div: ["class"],
      span: ["class"],
      p: ["class"],
      pre: ["class"],
      code: ["class"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      a: ["http", "https", "mailto"],
      img: ["http", "https"],
      iframe: ["http", "https"],
    },
    allowedIframeHostnames: ARTICLE_IFRAME_HOSTNAMES,
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
}
