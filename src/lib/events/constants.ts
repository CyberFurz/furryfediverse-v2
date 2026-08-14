export interface Category {
  code: string;
  name: string;
  emoji: string;
  regex: string;
  image?: string;
}

export const CATEGORIES: Category[] = [
  { code: "furry", name: "Furry", emoji: "🐾", regex: "furry|fursuit|anthro|fursona" },
  { code: "art", name: "Art", emoji: "🎨", regex: "art|artist|drawing|illustration|digital art" },
  { code: "gaming", name: "Gaming", emoji: "🎮", regex: "gaming|game|esports|video game" },
  { code: "music", name: "Music", emoji: "🎵", regex: "music|concert|performance|band|dj" },
  { code: "tech", name: "Tech", emoji: "💻", regex: "tech|programming|software|developer|foss" },
  { code: "writing", name: "Writing", emoji: "✍️", regex: "writing|author|story|literature" },
  { code: "science", name: "Science", emoji: "🔬", regex: "science|biology|research|academic" },
  { code: "social", name: "Social", emoji: "💬", regex: "social|meetup|community|party|bar" },
  { code: "charity", name: "Charity", emoji: "❤️", regex: "charity|fundraiser|donation|volunteer" },
  { code: "other", name: "Other", emoji: "📋", regex: ".*" },
];

export const DAY_STYLES = ["blue", "red", "green", "purple", "orange", "teal", "pink", "yellow"];

export const CONVENTION_STATUSES = ["draft", "pending", "approved", "rejected"] as const;
export type ConventionStatus = (typeof CONVENTION_STATUSES)[number];

export function matchCategory(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.code === "other") continue;
    const regex = new RegExp(cat.regex, "i");
    if (regex.test(text)) return cat.code;
  }
  return "other";
}
