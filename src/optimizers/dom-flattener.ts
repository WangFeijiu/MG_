/**
 * DOM Flattener — 消除无语义的单子节点 wrapper 嵌套
 *
 * 策略:
 * 1. 找到只有唯一子元素的 <div> (无 class/id/data-dsl-id)
 * 2. 将其子元素提升，替换该 div
 * 3. 重复直到无更多合并
 *
 * 目标: maxDepth <= 7, avgDepth <= 4.5
 */

const MAX_FLATTEN_ROUNDS = 5;
const SEMANTIC_TAGS = new Set([
  "section", "article", "aside", "nav", "main", "header", "footer",
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "button",
  "ul", "ol", "li", "figure", "figcaption", "form", "input", "label",
  "table", "thead", "tbody", "tr", "td", "th", "img", "svg", "video",
]);

export function flattenDOM(html: string): { html: string; removed: number } {
  let result = html;
  let totalRemoved = 0;

  for (let round = 0; round < MAX_FLATTEN_ROUNDS; round++) {
    const { html: next, removed } = flattenSinglePass(result);
    if (removed === 0) break;
    result = next;
    totalRemoved += removed;
  }

  return { html: result, removed: totalRemoved };
}

function flattenSinglePass(html: string): { html: string; removed: number } {
  let removed = 0;
  let result = html;

  // Pattern: <div> with only whitespace/attributes that has exactly one block child
  // Match: <div[attrs]>\s*<child-tag ...>...</child-tag>\s*</div>
  // Where the div has no class, id, data-dsl-id, or style attributes that matter

  const re = /<div(\s[^>]*)?>\s*\n?\s*(<(\w+)(\s[^>]*)?>[\s\S]*?<\/\3>)\s*\n?\s*<\/div>/g;

  result = result.replace(re, (fullMatch, attrs: string | undefined, innerContent: string) => {
    // Skip if div has meaningful attributes
    if (attrs && hasMeaningfulAttrs(attrs)) return fullMatch;

    // Skip if inner element is a semantic tag (don't unwrap around semantic elements unnecessarily)
    // Actually we WANT to unwrap — the div wrapper is useless around a semantic element
    // Only skip if the inner element would lose something

    removed++;
    return innerContent;
  });

  return { html: result, removed };
}

function hasMeaningfulAttrs(attrs: string): boolean {
  // These attributes mean the div is meaningful and should not be removed
  if (/\bclass=/.test(attrs)) return true;
  if (/\bid=/.test(attrs)) return true;
  if (/\bdata-dsl-id=/.test(attrs)) return true;
  if (/\bstyle=/.test(attrs)) return true;
  if (/\brole=/.test(attrs)) return true;
  if (/\baria-/.test(attrs)) return true;
  return false;
}
