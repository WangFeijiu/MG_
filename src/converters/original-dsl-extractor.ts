/**
 * 原始 DSL 数据提取器
 *
 * 从 MasterGo 原始 DSL 中提取精确的查找映射表：
 * - colorMap: paint ref → {value, tokenName}
 * - fontMap: font ref → 完整字体属性
 * - imageMap: paint ref → 图片 URL
 * - effectMap: effect ref → CSS box-shadow
 * - styles: 原始 styles dict
 *
 * 用于程序化渲染引擎获取精确数据（阴影、SVG、多色文本等）
 */

export type OriginalDslData = {
  /** 颜色映射: styleRef → {value, tokenName?} */
  colorMap: Map<string, { value: string; tokenName?: string }>;
  /** 字体映射: styleRef → 完整字体属性 */
  fontMap: Map<string, {
    family: string;
    size: number;
    weight: number;
    style: string;
    decoration: string;
    textCase: string;
    lineHeight: string;
    letterSpacing: string;
  }>;
  /** 图片映射: styleRef → URL */
  imageMap: Map<string, string>;
  /** 效果映射: styleRef → CSS box-shadow 字符串 */
  effectMap: Map<string, string>;
  /** 原始 styles dict */
  styles: Record<string, any>;
};

/**
 * 从原始 MasterGo DSL 提取查找映射表
 */
export function extractOriginalDslData(originalDSL: any): OriginalDslData {
  const colorMap = new Map<string, { value: string; tokenName?: string }>();
  const fontMap = new Map<string, OriginalDslData["fontMap"] extends Map<string, infer V> ? V : never>();
  const imageMap = new Map<string, string>();
  const effectMap = new Map<string, string>();

  const dsl = originalDSL?.dsl ?? originalDSL;
  const styles: Record<string, any> = dsl?.styles ?? {};

  // 遍历 styles 字典，构建查找表
  for (const [ref, style] of Object.entries(styles)) {
    if (!style?.value) continue;

    const value = style.value;

    // 字体样式
    if (value.family && value.size !== undefined) {
      fontMap.set(ref, {
        family: value.family || "",
        size: value.size || 14,
        weight: parseFontWeight(value.style),
        style: value.style || "",
        decoration: value.textDecoration || "",
        textCase: value.textCase || "",
        lineHeight: value.lineHeight || "auto",
        letterSpacing: value.letterSpacing || "0",
      });
      continue;
    }

    // 效果/阴影
    if (value.type === "drop-shadow" || Array.isArray(value)) {
      const shadow = resolveEffectToCSS(value);
      if (shadow) {
        effectMap.set(ref, shadow);
      }
      continue;
    }

    // 图片
    if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] === "object" && value[0].url) {
        imageMap.set(ref, value[0].url);
        continue;
      }
      // 颜色数组
      if (value.length > 0 && typeof value[0] === "string") {
        colorMap.set(ref, {
          value: value[0],
          tokenName: style.name || undefined,
        });
        continue;
      }
    }

    // 字符串颜色值
    if (typeof value === "string") {
      colorMap.set(ref, {
        value,
        tokenName: style.name || undefined,
      });
      continue;
    }

    // 单个对象 { url } → 图片
    if (typeof value === "object" && value.url) {
      imageMap.set(ref, value.url);
      continue;
    }

    // 阴影效果对象
    if (typeof value === "object" && (value.type === "drop-shadow" || value.shadowColor !== undefined)) {
      const shadow = resolveEffectToCSS(value);
      if (shadow) {
        effectMap.set(ref, shadow);
      }
    }
  }

  return { colorMap, fontMap, imageMap, effectMap, styles };
}

/**
 * 解析效果为 CSS box-shadow
 */
function resolveEffectToCSS(effect: any): string | null {
  // 数组形式（多个阴影）
  if (Array.isArray(effect)) {
    const shadows = effect
      .map(e => singleShadowToCSS(e))
      .filter(Boolean) as string[];
    return shadows.length > 0 ? shadows.join(", ") : null;
  }

  return singleShadowToCSS(effect);
}

function singleShadowToCSS(e: any): string | null {
  if (!e) return null;

  // 标准格式: { offsetX, offsetY, blur, spread, color }
  if (e.offsetX !== undefined || e.blur !== undefined) {
    const x = e.offsetX || 0;
    const y = e.offsetY || 0;
    const blur = e.blur || 0;
    const spread = e.spread || 0;
    const color = e.color || e.shadowColor || "rgba(0,0,0,0.15)";
    return `${x}px ${y}px ${blur}px ${spread}px ${color}`;
  }

  // MasterGo 格式: { shadowColor, shadowOffset, shadowBlur, shadowSpread }
  if (e.shadowColor !== undefined) {
    const offset = e.shadowOffset || { x: 0, y: 0 };
    const x = offset.x || 0;
    const y = offset.y || 0;
    const blur = e.shadowBlur || 0;
    const spread = e.shadowSpread || 0;
    return `${x}px ${y}px ${blur}px ${spread}px ${e.shadowColor}`;
  }

  return null;
}

/**
 * 从 font style 字符串解析 weight
 */
function parseFontWeight(styleStr: string): number {
  if (!styleStr) return 400;
  try {
    const obj = typeof styleStr === "string" && styleStr.startsWith("{")
      ? JSON.parse(styleStr)
      : {};
    const fontStyle = obj.fontStyle;
    if (!fontStyle) return 400;

    const weightMap: Record<string, number> = {
      "Thin": 100, "ExtraLight": 200, "Light": 300,
      "Regular": 400, "Medium": 500, "SemiBold": 600,
      "Bold": 700, "ExtraBold": 800, "Black": 900,
    };
    return weightMap[fontStyle] || 400;
  } catch {
    return 400;
  }
}
