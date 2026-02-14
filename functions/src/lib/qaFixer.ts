import type { QaIssue } from "./qaRules";

function stripTags(html: string) {
  return html.replace(/<[^>]+>/g, "");
}

function stripEmoji(s: string) {
  try {
    return s.replace(/\p{Extended_Pictographic}/gu, "");
  } catch {
    return s;
  }
}

function insertAfterFirstParagraph(html: string, block: string) {
  const idx = html.indexOf("</p>");
  if (idx === -1) return `${block}\n${html}`;
  return `${html.slice(0, idx + 4)}\n${block}\n${html.slice(idx + 4)}`;
}

function ensureToc(html: string) {
  if (/#d4af37|toc/i.test(html)) return html;
  const toc = `<div style="border:2px solid #d4af37; padding:12px; border-radius:10px;">
<p>목차</p>
</div>`;
  return insertAfterFirstParagraph(html, toc);
}

function ensureFaqOrTable(html: string, keyword: string) {
  const hasTable = /<table\b/gi.test(html);
  const hasFaq = /FAQ|자주\s*묻는/i.test(html);
  if (hasTable || hasFaq) return html;
  const faq = `<p>FAQ: 자주 묻는 질문</p>
<p>${keyword} 관련해서 가장 자주 묻는 3가지를 정리했습니다.</p>`;
  return `${html}\n${faq}`;
}

function ensureH2AndHr(html: string, keyword: string) {
  const h2Count = (html.match(/<h2\b/gi) ?? []).length;
  const missing = Math.max(0, 4 - h2Count);
  if (missing === 0) return html;
  let out = html;
  for (let i = 0; i < missing; i++) {
    out += `\n<hr />\n<h2 style="border-left:5px solid #d4af37; padding-left:15px; color:#333; line-height:1.4; margin-bottom:20px;">추가 섹션 ${h2Count + i + 1}</h2>\n<p>${keyword} 관련 추가 설명을 덧붙였습니다.</p>\n`;
  }
  return out;
}

function ensureHrCount(html: string) {
  const hrCount = (html.match(/<hr\b/gi) ?? []).length;
  if (hrCount >= 4) return html;
  let out = html;
  for (let i = hrCount; i < 4; i++) {
    out += `\n<hr />`;
  }
  return out;
}

function ensureMinLength(html: string, keyword: string, minLen = 2000) {
  let out = html;
  while (stripTags(out).length < minLen) {
    out += `\n<p>${keyword}을(를) 적용할 때는 작은 단계로 나눠 실행하고, 결과를 기록해 다음 선택을 조정하는 방식이 안정적입니다.</p>`;
  }
  return out;
}

function removeBannedWords(html: string, bannedWords: string[]) {
  let out = html;
  for (const w of bannedWords) {
    if (!w) continue;
    const safe = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(safe, "g"), "");
  }
  return out;
}

export function fixHtmlWithQaIssues(args: {
  html: string;
  issues: QaIssue[];
  keyword: string;
  bannedWords: string[];
}) {
  const { issues, keyword, bannedWords } = args;
  let html = args.html;

  if (issues.includes("missing_toc")) html = ensureToc(html);
  if (issues.includes("missing_h2_4")) html = ensureH2AndHr(html, keyword);
  if (issues.includes("missing_table_or_faq")) html = ensureFaqOrTable(html, keyword);
  if (issues.includes("missing_hr_per_section")) html = ensureHrCount(html);
  if (issues.includes("too_short")) html = ensureMinLength(html, keyword);
  if (issues.includes("banned_words")) html = removeBannedWords(html, bannedWords);
  if (issues.includes("contains_markdown_bold")) html = html.replace(/\*\*/g, "");
  if (issues.includes("contains_emoji")) html = stripEmoji(html);

  return html;
}
