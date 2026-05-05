/**
 * CSS Class Extractor — 将重复的 inline style 自动抽取为 CSS class
 *
 * 策略：
 * 1. 扫描 HTML 中所有 style="..." 属性
 * 2. Normalize 每个 style (排序+去空格) 作为 key
 * 3. 重复 >= 2 次的抽成 .sN class
 * 4. 替换原始 style="..." 为 class="sN"
 */

export type ExtractionResult = {
  html: string;
  extractedClasses: number;
  eliminatedInlines: number;
  cssBlock: string;
};

const CLASS_PREFIX = "s";

export function extractCSSClasses(html: string): ExtractionResult {
  // 收集所有 style="..." 属性，记录原始文本和 normalized key
  const styleEntries: Array<{ original: string; normalized: string; index: number }> = [];
  const re = /style="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1];
    const normalized = normalizeStyle(raw);
    styleEntries.push({ original: raw, normalized, index: m.index });
  }

  if (styleEntries.length === 0) {
    return { html, extractedClasses: 0, eliminatedInlines: 0, cssBlock: "" };
  }

  // 按 normalized key 分组计数
  const styleCounts = new Map<string, number>();
  for (const entry of styleEntries) {
    styleCounts.set(entry.normalized, (styleCounts.get(entry.normalized) || 0) + 1);
  }

  // 重复 >= 2 的 → 抽取
  const toExtract = new Map<string, string>();
  let classIndex = 1;
  for (const [normalized, count] of styleCounts) {
    if (count >= 2) {
      toExtract.set(normalized, `${CLASS_PREFIX}${classIndex}`);
      classIndex++;
    }
  }

  if (toExtract.size === 0) {
    return { html, extractedClasses: 0, eliminatedInlines: 0, cssBlock: "" };
  }

  // 生成 CSS 块
  const cssRules: string[] = [];
  for (const [normalized, className] of toExtract) {
    cssRules.push(`.${className}{${normalized}}`);
  }
  const cssBlock = cssRules.join("\n");

  // 构建 index → className 映射 (用 normalized key 匹配)
  const indexToClass = new Map<number, string>();
  for (const entry of styleEntries) {
    const className = toExtract.get(entry.normalized);
    if (className) {
      indexToClass.set(entry.index, className);
    }
  }

  // 替换 HTML — 从后向前替换避免 index 偏移
  const sortedReplacements = [...indexToClass.entries()]
    .sort((a, b) => b[0] - a[0]);

  let newHTML = html;
  let eliminated = 0;

  for (const [index, className] of sortedReplacements) {
    // 找到 style="..." 的范围
    const styleStart = html.indexOf("style=\"", index);
    if (styleStart === -1) continue;

    const valueStart = styleStart + 7; // after style="
    const valueEnd = html.indexOf("\"", valueStart);
    if (valueEnd === -1) continue;

    // 检查原始 HTML 和 newHTML 的 index 是否还对应
    // 因为是后向前替换，前面的内容还没变
    const originalSegment = newHTML.substring(styleStart, valueEnd + 1);

    // 替换 style="..." 为 class="sN"
    newHTML = newHTML.substring(0, styleStart) +
      `class="${className}"` +
      newHTML.substring(valueEnd + 1);
    eliminated++;
  }

  // 合并相邻的 class 属性: class="foo" class="s1" → class="foo s1"
  newHTML = newHTML.replace(/class="([^"]*)"\s+class="([^"]*)"/g, 'class="$1 $2"');

  // 插入 <style> 块
  if (newHTML.includes("</head>")) {
    newHTML = newHTML.replace("</head>", `<style>\n/* Auto-extracted: ${toExtract.size} classes */\n${cssBlock}\n</style>\n</head>`);
  } else if (newHTML.includes("<body")) {
    newHTML = newHTML.replace(/<body/, `<style>\n${cssBlock}\n</style>\n<body`);
  }

  return {
    html: newHTML,
    extractedClasses: toExtract.size,
    eliminatedInlines: eliminated,
    cssBlock,
  };
}

function normalizeStyle(style: string): string {
  return style
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => {
      const colonIdx = s.indexOf(":");
      if (colonIdx === -1) return s;
      const prop = s.substring(0, colonIdx).trim();
      const val = s.substring(colonIdx + 1).trim();
      return `${prop}:${val}`;
    })
    .sort()
    .join(";");
}
