import sanitizeHtml from "sanitize-html";

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
