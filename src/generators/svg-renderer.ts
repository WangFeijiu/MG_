/**
 * SVG 渲染器
 *
 * 从原始 PATH 数据渲染内联 SVG
 * 保留原始 fill 颜色和 path data
 */

/**
 * 从 path 数据渲染内联 SVG
 */
export function renderSvgIcon(
  paths: Array<{ fill: string; data: string }>,
  width: number,
  height: number,
): string {
  if (!paths || paths.length === 0) return "";

  const viewBox = `0 0 ${width} ${height}`;

  const pathElements = paths
    .map(p => {
      const fillAttr = p.fill ? ` fill="${escapeAttr(p.fill)}"` : ' fill="currentColor"';
      return `<path d="${escapeAttr(p.data)}"${fillAttr} />`;
    })
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" style="display:block;width:100%;height:100%">\n    ${pathElements}\n  </svg>`;
}

/**
 * 渲染 SVG 图标为 CSS background-image（用于装饰性图标）
 */
export function renderSvgAsBackground(
  paths: Array<{ fill: string; data: string }>,
  width: number,
  height: number,
): string {
  if (!paths || paths.length === 0) return "";

  const pathElements = paths
    .map(p => {
      const fill = p.fill || "currentColor";
      // URL-encode SVG for CSS background
      return `<path d='${p.data}' fill='${fill}'/>`;
    })
    .join("");

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>${pathElements}</svg>`;

  // 简单 URL 编码（不需要完整的 encodeURIComponent，只要处理关键字符）
  const encoded = svg
    .replace(/"/g, "'")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/#/g, "%23")
    .replace(/\{/g, "%7B")
    .replace(/\}/g, "%7D");

  return `url("data:image/svg+xml,${encoded}")`;
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
