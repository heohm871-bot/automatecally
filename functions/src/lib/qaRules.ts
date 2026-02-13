export type QaIssue =
  | "missing_toc"
  | "missing_h2_4"
  | "missing_hashtags_12"
  | "missing_table_or_faq"
  | "too_short"
  | "banned_words"
  | "missing_hr_per_section"
  | "contains_emoji"
  | "contains_markdown_bold";

export type QaResult = {
  pass: boolean;
  issues: QaIssue[];
};

function countMatches(html: string, re: RegExp) {
  return (html.match(re) ?? []).length;
}

function hasEmoji(s: string) {
  try {
    return /\p{Extended_Pictographic}/u.test(s);
  } catch {
    return false;
  }
}

export function runQaRules(args: {
  html: string;
  hashtags12: string[];
  bannedWords: string[];
}): QaResult {
  const issues: QaIssue[] = [];
  const html = args.html ?? "";

  const hasToc = /#d4af37|toc/i.test(html);
  if (!hasToc) issues.push("missing_toc");

  const h2Count = countMatches(html, /<h2\b/gi);
  if (h2Count < 4) issues.push("missing_h2_4");

  if (!args.hashtags12 || args.hashtags12.length !== 12) issues.push("missing_hashtags_12");

  const hasTable = /<table\b/gi.test(html);
  const hasFaq = /FAQ|자주\s*묻는/i.test(html);
  if (!hasTable && !hasFaq) issues.push("missing_table_or_faq");

  const textLen = html.replace(/<[^>]+>/g, "").length;
  if (textLen < 1800) issues.push("too_short");

  const hrCount = countMatches(html, /<hr\b/gi);
  if (hrCount < 4) issues.push("missing_hr_per_section");

  const bannedHit = (args.bannedWords ?? []).some((w) => w && html.includes(w));
  if (bannedHit) issues.push("banned_words");

  if (html.includes("**")) issues.push("contains_markdown_bold");
  if (hasEmoji(html)) issues.push("contains_emoji");

  return { pass: issues.length === 0, issues };
}
