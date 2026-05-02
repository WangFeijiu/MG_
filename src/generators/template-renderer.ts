/**
 * 基于模板的 Section 渲染器
 *
 * 替代逐节点渲染：从 DSL 提取语义数据，用预设计模板生成高质量 HTML。
 * 产出与 Kimi 风格一致：语义化类名、CSS 变量、响应式布局。
 */

import type { MachineDSL, DSLNode } from "../types/machine-dsl.js";
import type { Section } from "./section-splitter.js";
import type { OriginalDslData } from "../converters/original-dsl-extractor.js";
import type { DSLAnalysis } from "./dsl-analyzer.js";
import { renderSvgIcon } from "./svg-renderer.js";
import { getLayout, px, fb, padOr, brOr, childAt, directChildren, verticalGap } from "./layout-extractor.js";

export type SectionRenderResult = { html: string; css: string };

// ========== 类型定义 ==========

type TextItem = { text: string; fontSize: number; fontWeight: number; color: string; lineHeight?: number };
type ImageItem = { src: string; alt: string; width: number; height: number };
type IconItem = { svgHtml: string; width: number; height: number };

type SectionType =
  | "navbar" | "hero" | "heroSection" | "features" | "featureRow" | "process"
  | "gridRow" | "cta" | "showcase" | "testimonials" | "splitCta"
  | "videos" | "faq" | "contact" | "footer" | "content";

// ========== 主入口 ==========

export function renderPageProgrammatic(
  dsl: MachineDSL,
  sections: Section[],
  _originalData: OriginalDslData | null,
  analysis: DSLAnalysis,
): SectionRenderResult {
  const nodeMap = new Map<string, DSLNode>();
  for (const node of dsl.nodes) nodeMap.set(node.id, node);

  const allHTML: string[] = [];
  const cssSet = new Set<string>();

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const sectionAnalysis = analysis.sections[i];
    const secType = classifySection(i, sections.length, section, sectionAnalysis, nodeMap);
    const data = extractSectionData(secType, section, nodeMap);
    const result = renderTemplate(secType, data, i);

    allHTML.push(result.html);
    if (result.css) cssSet.add(result.css);
  }

  return { html: allHTML.join("\n\n"), css: [...cssSet].join("\n\n") };
}

// ========== Section 分类 ==========

function classifySection(
  index: number,
  total: number,
  section: Section,
  analysis: { semanticGuess: string; nodeCount: number; hasImages: boolean; textSummary: string[]; childDirection: string; height: number; yPosition: number },
  nodeMap: Map<string, DSLNode>,
): SectionType {
  const texts = analysis.textSummary.map(t => t.toLowerCase());
  const root = nodeMap.get(section.nodeId);
  const guess = analysis.semanticGuess;

  // Navbar
  if (guess === "navbar" || (index === 0 && root && Number(root.layout.height ?? 0) < 120)) return "navbar";

  // Footer
  if (guess === "footer" || index === total - 1) return "footer";

  // CTA (action text, centered, small section)
  if (texts.some(t => t.includes("start your project") || t.includes("clean beauty"))) return "cta";

  // Showcase (product cards with prices)
  if (texts.some(t => t.includes("$") || t.includes("¥")) && texts.some(t => t.includes("showcase") || t.includes("product"))) return "showcase";

  // Testimonials (cards with names, dates, many icons for stars)
  if (texts.some(t => t.includes("customer stories") || t.includes("reviews") || t.includes("testimonials"))) return "testimonials";

  // FAQ
  if (texts.some(t => t.includes("help center") || t.includes("faq") || t.includes("frequently asked"))) return "faq";

  // Contact (split layout with contact/email text) — check BEFORE process to avoid purple-bg misclassification
  if (texts.some(t => t.includes("contact") || t.includes("email")) && (texts.some(t => t.includes("question")) || texts.some(t => t.includes("message")))) return "contact";

  // Process (3 steps with icons, purple-ish background)
  if (root?.style.background?.includes("87, 71, 244") && analysis.nodeCount >= 15 && analysis.nodeCount <= 40) return "process";

  // Videos
  if (texts.some(t => t.includes("tutorial") || t.includes("watch"))) return "videos";

  // Hero section header (large title + subtitle)
  if (guess === "hero" || (texts.length >= 1 && !analysis.hasImages && analysis.nodeCount <= 5)) return "heroSection";

  // Features (4 alternating rows)
  if (guess === "features") return "features";

  // Cards / grid rows (similar repeating blocks)
  if (guess === "cards") return "gridRow";

  // Split CTA (text + image side by side, moderate size)
  if (analysis.hasImages && analysis.nodeCount <= 15 && analysis.nodeCount >= 8) return "splitCta";

  // Feature row (image + text pair)
  if (analysis.hasImages && analysis.nodeCount >= 20) return "featureRow";

  return "content";
}

// ========== 数据提取 ==========

function extractSectionData(secType: SectionType, section: Section, nodeMap: Map<string, DSLNode>) {
  const root = nodeMap.get(section.nodeId);
  const allNodes = section.nodeIds.map(id => nodeMap.get(id)).filter(Boolean) as DSLNode[];

  const texts: TextItem[] = [];
  const images: ImageItem[] = [];
  const icons: IconItem[] = [];

  for (const node of allNodes) {
    if (node.type === "text" && node.content?.text) {
      texts.push({
        text: node.content.text,
        fontSize: node.style.fontSize ?? 16,
        fontWeight: node.style.fontWeight ?? 400,
        color: node.style.color ?? "inherit",
        lineHeight: node.style.lineHeight,
      });
    }
    if (node.type === "image" && node.content?.src) {
      images.push({ src: node.content.src, alt: node.name || "", width: node.layout.width as number ?? 200, height: node.layout.height as number ?? 200 });
    }
    // Also detect containers with backgroundImage (used as image placeholders)
    if (node.type === "container" && (node.style as any)?.backgroundImage) {
      images.push({ src: (node.style as any).backgroundImage, alt: node.name || "", width: node.layout.width as number ?? 200, height: node.layout.height as number ?? 200 });
    }
    if (node.type === "icon" && node.meta?.svgPaths) {
      const w = typeof node.layout.width === "number" ? node.layout.width : 24;
      const h = typeof node.layout.height === "number" ? node.layout.height : 24;
      icons.push({ svgHtml: renderSvgIcon(node.meta.svgPaths, w, h), width: w, height: h });
    }
  }

  return { secType, root, allNodes, texts, images, icons, section, nodeMap };
}

// ========== 模板路由 ==========

type SectionContext = {
  secType: SectionType;
  root: DSLNode | undefined;
  allNodes: DSLNode[];
  texts: TextItem[];
  images: ImageItem[];
  icons: IconItem[];
  section: Section;
  nodeMap: Map<string, DSLNode>;
};

function renderTemplate(secType: SectionType, ctx: SectionContext, index: number): SectionRenderResult {
  switch (secType) {
    case "navbar": return renderNavbar(ctx);
    case "hero": case "heroSection": return renderHeroSection(ctx);
    case "features": return renderFeatures(ctx);
    case "featureRow": return renderFeatureRow(ctx);
    case "process": return renderProcess(ctx);
    case "gridRow": return renderGridRow(ctx);
    case "cta": return renderCta(ctx);
    case "showcase": return renderShowcase(ctx);
    case "testimonials": return renderTestimonials(ctx);
    case "splitCta": return renderSplitCta(ctx);
    case "videos": return renderVideos(ctx);
    case "faq": return renderFaq(ctx);
    case "contact": return renderContact(ctx);
    case "footer": return renderFooter(ctx);
    default: return renderGeneric(ctx);
  }
}

// ========== 模板函数 ==========

function esc(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// --- Navbar ---

function renderNavbar(ctx: SectionContext): TemplateResult {
  const brandText = ctx.texts.find(t => t.fontSize >= 20) ?? ctx.texts[0];
  const brandIcon = ctx.icons[0];
  const actionIcons = ctx.icons.slice(1);
  const loginText = ctx.texts.find(t => t.text.length < 10 && t.text !== brandText?.text);

  // Layout extraction
  const root = getLayout(ctx.root);
  const innerNode = childAt(ctx.root, 0, ctx.nodeMap);
  const inner = getLayout(innerNode);
  const loginNode = ctx.allNodes.find(n => n.type === "container" && n.children?.length === 0 && n.style?.background);

  const navHeight = px(root.height, "70px");
  const navBg = root.background ?? "rgba(255,255,255,0.6)";
  const innerPad = padOr(inner.padding, "0 120px");
  const brandSize = px(brandText?.fontSize, "24px");
  const brandWeight = `${fb(brandText?.fontWeight, 500)}`;
  const loginPad = padOr(getLayout(loginNode).padding, "8px 12px");
  const loginBr = brOr(getLayout(loginNode).borderRadius, "100px");
  const loginSize = px(loginText?.fontSize, "12px");

  const brandSvg = brandIcon ? `<div style="width:${brandIcon.width}px;height:${brandIcon.height}px">${brandIcon.svgHtml}</div>` : "";
  const actionsHTML = actionIcons.map(ic =>
    `<button class="btn-icon" aria-label="Action"><div style="width:${ic.width}px;height:${ic.height}px">${ic.svgHtml}</div></button>`
  ).join("\n      ");

  const loginBtn = loginText ? `
      <button class="btn-login">
        ${actionIcons.length > 0 ? `<div style="width:16px;height:18px">${actionIcons[actionIcons.length - 1].svgHtml}</div>` : ""}
        ${esc(loginText.text)}
      </button>` : "";

  return {
    html: `<nav class="navbar">
  <div class="navbar-inner">
    <a href="#" class="brand">${brandSvg}
      ${brandText ? esc(brandText.text) : ""}
    </a>
    <div class="nav-actions">
      ${actionsHTML}
      ${loginBtn}
    </div>
  </div>
</nav>`,
    css: `.navbar { position: sticky; top: 0; z-index: 100; background: ${navBg}; backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
.navbar-inner { max-width: var(--max-width,1440px); margin: 0 auto; padding: ${innerPad}; height: ${navHeight}; display: flex; align-items: center; justify-content: space-between; }
.brand { display: flex; align-items: center; gap: 8px; font-size: ${brandSize}; font-weight: ${brandWeight}; color: var(--text-primary); text-decoration: none; }
.nav-actions { display: flex; align-items: center; gap: 8px; }
.btn-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: none; background: none; cursor: pointer; }
.btn-icon:hover { background: var(--surface-6); }
.btn-login { display: flex; align-items: center; gap: 4px; background: var(--text-primary); color: var(--white); padding: ${loginPad}; border-radius: ${loginBr}; font-size: ${loginSize}; font-weight: 500; border: none; cursor: pointer; }
.btn-login:hover { opacity: 0.85; }
@media (max-width: 1024px) { .navbar-inner { padding: 0 24px; } }`,
  };
}

// --- Hero Section Header (title + subtitle) ---

function renderHeroSection(ctx: SectionContext): TemplateResult {
  const title = ctx.texts.find(t => t.fontSize >= 24) ?? ctx.texts[0];
  const subtitle = ctx.texts.find(t => t !== title);
  const root = getLayout(ctx.root);

  const secPad = padOr(root.padding, "64px 24px");
  const titleSize = px(title?.fontSize, "48px");
  const titleWeight = `${fb(title?.fontWeight, 600)}`;
  const subSize = px(subtitle?.fontSize, "24px");
  const headerMaxW = root.width ? `${Math.round(root.width * 0.8)}px` : "960px";

  return {
    html: `<section class="container" style="padding: ${secPad};">
  <div class="section-header">
    ${title ? `<h2 class="section-title">${esc(title.text)}</h2>` : ""}
    ${subtitle ? `<p class="section-subtitle">${esc(subtitle.text).replace(/\n/g, "<br>")}</p>` : ""}
  </div>
</section>`,
    css: `.section-header { text-align: center; max-width: ${headerMaxW}; margin: 0 auto 48px; }
.section-title { font-size: ${titleSize}; font-weight: ${titleWeight}; line-height: 1.25; color: var(--text-primary); margin-bottom: 16px; }
.section-subtitle { font-size: ${subSize}; line-height: 1.4; color: var(--text-secondary); }`,
  };
}

// --- Hero (product banner with bg image + buttons) ---

function renderHero(ctx: SectionContext): TemplateResult {
  const bgImage = ctx.images[0];
  const title = ctx.texts.find(t => t.fontSize >= 24);
  const desc = ctx.texts.find(t => t !== title && t.text.length > 20);
  const buttons = ctx.texts.filter(t => t.text.length <= 25 && t !== title);

  // Layout extraction
  const root = getLayout(ctx.root);
  const secPad = padOr(root.padding, "40px 0");
  const cardNode = ctx.root ? childAt(ctx.root, 0, ctx.nodeMap) : undefined;
  const cardInner = cardNode ? childAt(cardNode, 0, ctx.nodeMap) : undefined;
  const cardL = getLayout(cardInner);
  const cardPad = padOr(cardL.padding, "60px 80px");
  const cardBr = brOr(cardL.borderRadius, "18px");
  const contentNode = cardInner ? (() => {
    const children = directChildren(cardInner, ctx.nodeMap);
    return children.find(n => n.type !== "image");
  })() : undefined;
  const contentL = getLayout(contentNode);
  const contentMaxW = contentL.width ? `${Math.round(contentL.width)}px` : "560px";
  const titleSize = px(title?.fontSize, "32px");
  const titleWeight = `${fb(title?.fontWeight, 600)}`;
  const descSize = px(desc?.fontSize, "16px");
  const descMaxW = contentL.width ? `${Math.round(contentL.width * 0.85)}px` : "480px";

  const bgStyle = bgImage ? `background-image: url('${bgImage.src}'); background-size: cover; background-position: center;` : "";
  const buttonsHTML = buttons.map((b, i) =>
    `<button class="${i === 0 ? "btn-primary" : "btn-secondary"}">${esc(b.text)}</button>`
  ).join("\n          ");

  return {
    html: `<section class="hero" style="padding: ${secPad};">
  <div class="container">
    <div class="hero-card">
      <div class="hero-bg" style="${bgStyle}"></div>
      <div class="hero-content">
        ${title ? `<h1 class="hero-title">${esc(title.text)}</h1>` : ""}
        ${desc ? `<p class="hero-desc">${esc(desc.text)}</p>` : ""}
        ${buttonsHTML ? `<div class="hero-actions">\n          ${buttonsHTML}\n        </div>` : ""}
      </div>
    </div>
  </div>
</section>`,
    css: `.hero-card { position: relative; border-radius: ${cardBr}; overflow: hidden; min-height: 400px; display: flex; align-items: center; padding: ${cardPad}; }
.hero-bg { position: absolute; right: 0; top: 0; bottom: 0; width: 55%; mask-image: linear-gradient(to right, transparent 0%, black 40%); -webkit-mask-image: linear-gradient(to right, transparent 0%, black 40%); }
.hero-content { position: relative; z-index: 2; max-width: ${contentMaxW}; }
.hero-title { font-size: ${titleSize}; font-weight: ${titleWeight}; line-height: 1.25; margin-bottom: 24px; }
.hero-desc { font-size: ${descSize}; line-height: 1.5; color: var(--text-tertiary); margin-bottom: 32px; max-width: ${descMaxW}; }
.hero-actions { display: flex; gap: 16px; flex-wrap: wrap; }`,
  };
}

// --- Features (4 alternating rows) ---

function renderFeatures(ctx: SectionContext): TemplateResult {
  const root = ctx.root;
  if (!root) return { html: "", css: "" };

  // Layout extraction
  const rootL = getLayout(root);
  const secPad = padOr(rootL.padding, "80px 0");
  const rowNodes = directChildren(root, ctx.nodeMap);
  // Gap within a row (media ↔ body) from first row's layout
  const firstRowL = getLayout(rowNodes[0]);
  const rowGap = px(firstRowL.gap, "69px");
  // Vertical gap between rows
  const vGap = rowNodes.length >= 2 ? verticalGap(rowNodes[0], rowNodes[1]) : undefined;
  const marginBottom = vGap !== undefined ? `${Math.round(vGap)}px` : "100px";
  // Media container from first row
  const mediaNode = rowNodes[0] ? childAt(rowNodes[0], 0, ctx.nodeMap) : undefined;
  const mediaL = getLayout(mediaNode);
  const mediaFlex = px(mediaL.width, "432px");
  const mediaGap = px(mediaL.gap, "32px");
  // Image dimensions from DSL images
  const imgBr = (() => {
    const imgNode = ctx.allNodes.find(n => n.type === "image" && n.style?.borderRadius);
    return brOr(typeof imgNode?.style?.borderRadius?.topLeft === "number" ? imgNode.style.borderRadius.topLeft : undefined, "18px");
  })();
  const smallImg = ctx.images[0];
  const largeImg = ctx.images[1];
  const smallW = px(smallImg?.width, "160px");
  const smallH = px(smallImg?.height, "160px");
  const largeW = px(largeImg?.width, "240px");
  const largeH = px(largeImg?.height, "240px");
  // Body width
  const bodyNode = rowNodes[0] ? childAt(rowNodes[0], 1, ctx.nodeMap) : undefined;
  const bodyW = px(getLayout(bodyNode).width, "495px");
  // Text styles
  const titleText = ctx.texts.find(t => t.fontSize >= 20);
  const descText = ctx.texts.find(t => t !== titleText && t.text.length > 30);
  const titleSize = px(titleText?.fontSize, "24px");
  const titleWeight = `${fb(titleText?.fontWeight, 500)}`;
  const textSize = px(descText?.fontSize, "16px");

  // Each child of root is a feature row
  const rows = root.children.map((id, idx) => {
    const child = ctx.allNodes.find(n => n.id === id);
    if (!child) return "";
    const childTexts: TextItem[] = [];
    const childImages: ImageItem[] = [];
    collectDescendantData(child, new Map(ctx.allNodes.map(n => [n.id, n])), childTexts, childImages);

    const title = childTexts.find(t => t.fontSize >= 20);
    const desc = childTexts.find(t => t !== title && t.text.length > 30);
    const link = childTexts.find(t => t.text.toLowerCase().includes("view"));
    const reverse = idx % 2 === 1;

    const imgsHTML = childImages.map((img, j) =>
      j === 0
        ? `<img class="feature-img-small" src="${img.src}" alt="${esc(img.alt)}" />`
        : `<div class="feature-img-large" style="background:url('${img.src}') center/cover;"></div>`
    ).join("\n          ");

    return `<div class="feature-row${reverse ? " reverse" : ""}">
      <div class="feature-media">
        ${imgsHTML}
      </div>
      <div class="feature-body">
        ${title ? `<h3 class="feature-title">${esc(title.text)}</h3>` : ""}
        ${desc ? `<p class="feature-text">${esc(desc.text)}</p>` : ""}
        ${link ? `<a href="#" class="link-arrow">${esc(link.text)} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></a>` : ""}
      </div>
    </div>`;
  });

  return {
    html: `<section class="features">\n  <div class="container">\n${rows.join("\n")}\n  </div>\n</section>`,
    css: `.features { padding: ${secPad}; }
.feature-row { display: flex; align-items: center; gap: ${rowGap}; margin-bottom: ${marginBottom}; }
.feature-row:last-child { margin-bottom: 0; }
.feature-row.reverse { flex-direction: row-reverse; }
.feature-media { flex: 0 0 ${mediaFlex}; display: flex; align-items: center; gap: ${mediaGap}; }
.feature-img-small { width: ${smallW}; height: ${smallH}; border-radius: ${imgBr}; object-fit: cover; }
.feature-img-large { width: ${largeW}; height: ${largeH}; border-radius: ${imgBr}; }
.feature-body { flex: 1; max-width: ${bodyW}; }
.feature-title { font-size: ${titleSize}; font-weight: ${titleWeight}; line-height: 1.5; margin-bottom: 12px; }
.feature-text { font-size: ${textSize}; line-height: 1.5; color: var(--text-tertiary); margin-bottom: 16px; }
.link-arrow { display: inline-flex; align-items: center; gap: 8px; font-size: ${textSize}; font-weight: 500; color: var(--text-secondary); text-decoration: none; }
.link-arrow:hover { color: var(--primary); }
@media (max-width: 1024px) { .feature-row { flex-direction: column !important; gap: 40px; } }`,
  };
}

function collectDescendantData(node: DSLNode, nodeMap: Map<string, DSLNode>, texts: TextItem[], images: ImageItem[]) {
  if (node.type === "text" && node.content?.text) {
    texts.push({ text: node.content.text, fontSize: node.style.fontSize ?? 16, fontWeight: node.style.fontWeight ?? 400, color: node.style.color ?? "" });
  }
  if (node.type === "image" && node.content?.src) {
    images.push({ src: node.content.src, alt: node.name || "", width: node.layout.width as number ?? 200, height: node.layout.height as number ?? 200 });
  }
  // Also detect containers with backgroundImage (used as image placeholders in some designs)
  if (node.type === "container" && (node.style as any)?.backgroundImage) {
    images.push({ src: (node.style as any).backgroundImage, alt: node.name || "", width: node.layout.width as number ?? 200, height: node.layout.height as number ?? 200 });
  }
  for (const cid of node.children) {
    const child = nodeMap.get(cid);
    if (child) collectDescendantData(child, nodeMap, texts, images);
  }
}

function collectDescendantTexts(node: DSLNode, nodeMap: Map<string, DSLNode>, texts: TextItem[]) {
  if (node.type === "text" && node.content?.text) {
    texts.push({ text: node.content.text, fontSize: node.style.fontSize ?? 16, fontWeight: node.style.fontWeight ?? 400, color: node.style.color ?? "" });
  }
  for (const cid of node.children) {
    const child = nodeMap.get(cid);
    if (child) collectDescendantTexts(child, nodeMap, texts);
  }
}

// --- Feature Row (single image+text pair) ---

function renderFeatureRow(ctx: SectionContext): TemplateResult {
  const title = ctx.texts.find(t => t.fontSize >= 20);
  const desc = ctx.texts.find(t => t !== title && t.text.length > 20);
  const link = ctx.texts.find(t => t.text.toLowerCase().includes("view"));

  // Layout extraction
  const rootL = getLayout(ctx.root);
  const secPad = padOr(rootL.padding, "80px 0");
  const rowNode = ctx.root ? childAt(ctx.root, 0, ctx.nodeMap) : undefined;
  const rowL = getLayout(rowNode);
  const rowGap = px(rowL.gap, "69px");
  // Media container
  const mediaNode = rowNode ? childAt(rowNode, 0, ctx.nodeMap) : undefined;
  const mediaL = getLayout(mediaNode);
  const mediaFlex = px(mediaL.width, "432px");
  const mediaGap = px(mediaL.gap, "32px");
  // Images
  const smallImg = ctx.images[0];
  const largeImg = ctx.images[1];
  const smallW = px(smallImg?.width, "160px");
  const smallH = px(smallImg?.height, "160px");
  const largeW = px(largeImg?.width, "240px");
  const largeH = px(largeImg?.height, "240px");
  const imgBr = (() => {
    const imgNode = ctx.allNodes.find(n => n.type === "image" && n.style?.borderRadius);
    return brOr(typeof imgNode?.style?.borderRadius?.topLeft === "number" ? imgNode.style.borderRadius.topLeft : undefined, "18px");
  })();
  const titleSize = px(title?.fontSize, "24px");
  const titleWeight = `${fb(title?.fontWeight, 500)}`;
  const textSize = px(desc?.fontSize, "16px");
  // Body width
  const bodyNode = rowNode ? childAt(rowNode, 1, ctx.nodeMap) : undefined;
  const bodyW = px(getLayout(bodyNode).width, "495px");

  const imgsHTML = ctx.images.map((img, j) =>
    j === 0
      ? `<img class="feature-img-small" src="${img.src}" alt="${esc(img.alt)}" />`
      : `<div class="feature-img-large" style="background:url('${img.src}') center/cover;"></div>`
  ).join("\n      ");

  return {
    html: `<section class="features">
  <div class="container">
    <div class="feature-row">
      <div class="feature-media">${imgsHTML}
      </div>
      <div class="feature-body">
        ${title ? `<h3 class="feature-title">${esc(title.text)}</h3>` : ""}
        ${desc ? `<p class="feature-text">${esc(desc.text)}</p>` : ""}
        ${link ? `<a href="#" class="link-arrow">${esc(link.text)} →</a>` : ""}
      </div>
    </div>
  </div>
</section>`,
    css: `.features { padding: ${secPad}; }
.feature-row { display: flex; align-items: center; gap: ${rowGap}; margin-bottom: 100px; }
.feature-media { flex: 0 0 ${mediaFlex}; display: flex; align-items: center; gap: ${mediaGap}; }
.feature-img-small { width: ${smallW}; height: ${smallH}; border-radius: ${imgBr}; object-fit: cover; }
.feature-img-large { width: ${largeW}; height: ${largeH}; border-radius: ${imgBr}; }
.feature-body { flex: 1; max-width: ${bodyW}; }
.feature-title { font-size: ${titleSize}; font-weight: ${titleWeight}; margin-bottom: 12px; }
.feature-text { font-size: ${textSize}; line-height: 1.5; color: var(--text-tertiary); margin-bottom: 16px; }`,
  };
}

// --- Process (3 steps with icons) ---

function renderProcess(ctx: SectionContext): TemplateResult {
  const title = ctx.texts[0];
  const stepTexts = ctx.texts.slice(1);
  const stepIcons = ctx.icons;

  // Layout extraction
  const root = getLayout(ctx.root);
  const rootPad = padOr(root.padding, "80px 0");
  // root → child[1] (inner container) → child[1] (grid)
  const innerNode = childAt(ctx.root, 1, ctx.nodeMap);
  const gridNode = childAt(innerNode, 1, ctx.nodeMap);
  const grid = getLayout(gridNode);
  const gridGap = px(grid.gap, "101px");
  const gridWidth = px(grid.width, "1105px");
  // Each step card is a child of the grid
  const stepCard = directChildren(gridNode, ctx.nodeMap)[0];
  const card = getLayout(stepCard);
  const cardWidth = px(card.width, "301px");
  // Step text fontSize from first step text
  const stepFontSize = px(stepTexts[0]?.fontSize, "24px");

  const stepsHTML = stepTexts.map((t, i) => `
      <div class="process-card">
        ${stepIcons[i] ? `<div class="process-icon"><div style="width:72px;height:72px">${stepIcons[i].svgHtml}</div></div>` : ""}
        <p class="process-text">${esc(t.text)}</p>
      </div>`).join("");

  return {
    html: `<section class="process">
  <div class="container">
    ${title ? `<div class="section-header"><h2 class="section-title">${esc(title.text)}</h2></div>` : ""}
    <div class="process-grid">${stepsHTML}
    </div>
  </div>
</section>`,
    css: `.process { background: var(--primary-10); padding: ${rootPad}; }
.process-grid { display: flex; justify-content: center; gap: ${gridGap}; max-width: ${gridWidth}; margin: 0 auto; }
.process-card { flex: 1; max-width: ${cardWidth}; text-align: center; }
.process-icon { width: 72px; height: 72px; margin: 0 auto 32px; }
.process-text { font-size: ${stepFontSize}; line-height: 1.35; color: var(--text-secondary); }
@media (max-width: 1024px) { .process-grid { flex-direction: column; align-items: center; gap: 48px; } }`,
  };
}

// --- Grid Row (3-column cards) ---

function renderGridRow(ctx: SectionContext): TemplateResult {
  const root = ctx.root;
  if (!root) return { html: "", css: "" };

  // Layout extraction
  const rootL = getLayout(root);
  const secPad = padOr(rootL.padding, "80px 0");
  const rowNodes = directChildren(root, ctx.nodeMap);
  // Gap between image and text from first row's layout
  const firstRow = rowNodes[0];
  const rowL = getLayout(firstRow);
  const rowGap = px(rowL.gap, "69px");
  // Vertical gap between rows
  const vGap = rowNodes.length >= 2 ? verticalGap(rowNodes[0], rowNodes[1]) : undefined;
  const marginBottom = vGap !== undefined ? `${Math.round(vGap)}px` : "100px";
  // Image container from first row's first child (image container)
  const imgContainer = firstRow ? childAt(firstRow, 0, ctx.nodeMap) : undefined;
  const imgL = getLayout(imgContainer);
  const imgFlex = px(imgL.width, "432px");
  const imgH = px(imgL.height, "300px");
  const imgBr = brOr(imgL.borderRadius, "18px");

  const rows = root.children.map((id, idx) => {
    const child = ctx.nodeMap.get(id);
    if (!child) return "";
    const childTexts: TextItem[] = [];
    const childImages: ImageItem[] = [];
    collectDescendantData(child, ctx.nodeMap, childTexts, childImages);
    const title = childTexts.find(t => t.fontSize >= 20);
    const desc = childTexts.find(t => t !== title && t.text.length > 20);
    const link = childTexts.find(t => t.text.toLowerCase().includes("view"));
    const reverse = idx % 2 === 1;
    const imgHTML = childImages[0] ? `<div class="grid-img"><img src="${childImages[0].src}" alt="${esc(childImages[0].alt)}" /></div>` : "";

    return `<div class="grid-row${reverse ? " reverse" : ""}">
      ${imgHTML}
      <div class="feature-body">
        ${title ? `<h3 class="feature-title">${esc(title.text)}</h3>` : ""}
        ${desc ? `<p class="feature-text">${esc(desc.text)}</p>` : ""}
        ${link ? `<a href="#" class="link-arrow">${esc(link.text)} →</a>` : ""}
      </div>
    </div>`;
  });

  return {
    html: `<section class="product-grid"><div class="container">${rows.join("\n")}</div></section>`,
    css: `.product-grid { padding: ${secPad}; }
.grid-row { display: flex; align-items: center; gap: ${rowGap}; margin-bottom: ${marginBottom}; }
.grid-row:last-child { margin-bottom: 0; }
.grid-row.reverse { flex-direction: row-reverse; }
.grid-img { flex: 0 0 ${imgFlex}; height: ${imgH}; border-radius: ${imgBr}; overflow: hidden; }
.grid-img img { width: 100%; height: 100%; object-fit: cover; }`,
  };
}

// --- CTA Banner ---

function renderCta(ctx: SectionContext): TemplateResult {
  const label = ctx.texts[0];
  const title = ctx.texts.find(t => t !== label && t.text.length > 20) ?? ctx.texts[1];
  const btn = ctx.texts.find(t => t.text.length < 25 && t !== label && t !== title) ?? ctx.texts[2];

  // Layout extraction
  const root = getLayout(ctx.root);
  const ctaBg = root.background ?? "var(--surface-2)";
  const ctaPad = padOr(root.padding, "80px 120px");
  const labelSize = px(label?.fontSize, "24px");
  const labelWeight = `${fb(label?.fontWeight, 500)}`;
  const titleSize = px(title?.fontSize, "32px");
  const titleWeight = `${fb(title?.fontWeight, 600)}`;
  const btnNode = ctx.allNodes.find(n => n.type === "container" && n.children?.length === 0 && n.style?.background);
  const btnPad = padOr(getLayout(btnNode).padding, "18px 32px");
  const btnBr = brOr(getLayout(btnNode).borderRadius, "100px");
  const btnSize = px(btn?.fontSize, "24px");
  const btnWeight = `${fb(btn?.fontWeight, 600)}`;

  return {
    html: `<section class="cta-banner">
  <div>
    ${label ? `<p class="cta-label">${esc(label.text)}</p>` : ""}
    ${title ? `<h2 class="cta-title">${esc(title.text)}</h2>` : ""}
    ${btn ? `<a href="#" class="btn-cta">${esc(btn.text)}</a>` : ""}
  </div>
</section>`,
    css: `.cta-banner { background: ${ctaBg}; padding: ${ctaPad}; text-align: center; }
.cta-label { font-size: ${labelSize}; font-weight: ${labelWeight}; margin-bottom: 16px; }
.cta-title { font-size: ${titleSize}; font-weight: ${titleWeight}; line-height: 1.5; max-width: 1026px; margin: 0 auto 64px; }
.btn-cta { display: inline-block; background: var(--text-primary); color: var(--white); padding: ${btnPad}; border-radius: ${btnBr}; font-size: ${btnSize}; font-weight: ${btnWeight}; text-transform: uppercase; text-decoration: none; }
.btn-cta:hover { transform: translateY(-2px); opacity: 0.9; }
@media (max-width: 1024px) { .cta-banner { padding: 60px 24px; } }`,
  };
}

// --- Showcase (5-column product cards) ---

function renderShowcase(ctx: SectionContext): TemplateResult {
  const label = ctx.texts[0];
  const desc = ctx.texts[1];
  // Products: image + name + price + unit pattern
  const products: Array<{ image: string; name: string; price: string; unit: string }> = [];
  for (let i = 0; i < ctx.images.length; i++) {
    const base = 1 + i * 3; // skip label + desc
    products.push({
      image: ctx.images[i].src,
      name: ctx.texts[base + 1]?.text ?? "Product",
      price: ctx.texts[base + 2]?.text ?? "",
      unit: ctx.texts[base + 3]?.text ?? "",
    });
  }

  // Layout extraction
  const root = getLayout(ctx.root);
  const showcasePad = padOr(root.padding, "80px 0");
  const gridContainer = childAt(ctx.root, 1, ctx.nodeMap);
  const gridLayout = getLayout(gridContainer);
  const gridGap = px(gridLayout.gap, "12px");
  // Product cards are direct children of the grid container
  const cardNodes = directChildren(gridContainer, ctx.nodeMap);
  const cardWidth = px(cardNodes[0] ? getLayout(cardNodes[0]).width : undefined, "200px");
  // Thumbnail is the image inside the first card
  const thumbNode = cardNodes[0] ? childAt(cardNodes[0], 0, ctx.nodeMap) : undefined;
  const thumbLayout = getLayout(thumbNode);
  const thumbW = px(thumbLayout.width, "200px");
  const thumbH = px(thumbLayout.height, "250px");
  const thumbBr = brOr(thumbLayout.borderRadius, "10px");
  // Text sizes from DSL text items
  const nameText = ctx.texts.find(t => products.some(p => p.name === t.text));
  const priceText = ctx.texts.find(t => products.some(p => p.price === t.text));
  const unitText = ctx.texts.find(t => products.some(p => p.unit === t.text));
  const nameSize = px(nameText?.fontSize, "16px");
  const nameWeight = `${fb(nameText?.fontWeight, 500)}`;
  const priceSize = px(priceText?.fontSize, "24px");
  const priceWeight = `${fb(priceText?.fontWeight, 500)}`;
  const unitSize = px(unitText?.fontSize, "12px");

  const cardsHTML = products.map(p => `
      <div class="product-card">
        <div class="product-thumb"><img src="${p.image}" alt="${esc(p.name)}" /></div>
        <p class="product-name">${esc(p.name)}</p>
        <div class="product-meta">
          <span class="product-price">${esc(p.price)}</span>
          <span class="product-unit">${esc(p.unit)}</span>
        </div>
      </div>`).join("");

  return {
    html: `<section class="showcase">
  <div class="container">
    <div class="showcase-header">
      ${label ? `<p class="showcase-label">${esc(label.text)}</p>` : ""}
      ${desc ? `<p class="showcase-desc">${esc(desc.text)}</p>` : ""}
    </div>
    <div class="showcase-grid">${cardsHTML}
    </div>
  </div>
</section>`,
    css: `.showcase { padding: ${showcasePad}; }
.showcase-header { margin-bottom: 48px; }
.showcase-label { font-size: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
.showcase-desc { font-size: 16px; color: var(--text-tertiary); }
.showcase-grid { display: flex; gap: ${gridGap}; justify-content: space-between; }
.product-card { width: ${cardWidth}; }
.product-thumb { width: ${thumbW}; height: ${thumbH}; border-radius: ${thumbBr}; overflow: hidden; margin-bottom: 10px; }
.product-thumb img { width: 100%; height: 100%; object-fit: cover; }
.product-name { font-size: ${nameSize}; font-weight: ${nameWeight}; margin-bottom: 8px; padding: 0 12px; }
.product-meta { display: flex; justify-content: space-between; align-items: flex-end; padding: 0 12px; }
.product-price { font-size: ${priceSize}; font-weight: ${priceWeight}; }
.product-unit { font-size: ${unitSize}; color: var(--text-tertiary); }
@media (max-width: 1024px) { .showcase-grid { flex-wrap: wrap; justify-content: center; } }`,
  };
}

// --- Testimonials ---

function renderTestimonials(ctx: SectionContext): TemplateResult {
  const title = ctx.texts[0];

  // Layout extraction
  const rootL = getLayout(ctx.root);
  const rootChild = childAt(ctx.root, 0, ctx.nodeMap);
  const scrollContainer = childAt(rootChild, 0, ctx.nodeMap);
  const scrollL = getLayout(scrollContainer);
  const cardNode = ctx.allNodes.find(n => n.style?.padding && n.style?.borderRadius);
  const cardL = getLayout(cardNode);
  const avatarImg = ctx.images.find(img => img.width < 100 || img.height < 100);
  const bodyText = ctx.texts.find(t => t !== title && ctx.texts.indexOf(t) > 0);
  const nameText = ctx.texts.find(t => t !== title && t !== bodyText);

  const secBg = rootL.background ?? "var(--primary-10)";
  const secPad = padOr(rootL.padding, "80px 120px");
  const scrollGap = px(scrollL.gap, "56px");
  const cardWidth = px(cardL.width, "380px");
  const cardBr = brOr(cardL.borderRadius, "10px");
  const cardPad = padOr(cardL.padding, "24px");
  const cardGap = px(cardL.gap, "24px");
  const avatarW = px(avatarImg?.width, "56px");
  const avatarH = px(avatarImg?.height, "56px");
  const nameSize = px(nameText?.fontSize, "16px");
  const bodySize = px(bodyText?.fontSize, "16px");

  // Pattern: name, date, body repeating
  const cards: Array<{ name: string; body: string; date: string; avatar: string }> = [];
  const avatarImages = ctx.images.filter(img => img.width < 100 || img.height < 100);
  const remainingTexts = ctx.texts.slice(1);
  for (let i = 0; i < remainingTexts.length; i += 3) {
    cards.push({
      name: remainingTexts[i]?.text ?? "",
      body: remainingTexts[i + 1]?.text ?? "",
      date: remainingTexts[i + 2]?.text ?? "",
      avatar: avatarImages[Math.floor(i / 3) % avatarImages.length]?.src ?? "",
    });
  }

  const starsHTML = Array(5).fill(`<svg viewBox="0 0 18 17" fill="#5747F4"><path d="M9 0l2.5 5.5L17 6.3l-4 4.2L14 17 9 14l-5 3 1-6.5L1 6.3l5.5-.8L9 0z"/></svg>`).join("");

  const cardsHTML = cards.map(c => `
      <div class="testimonial-card">
        <div class="testimonial-header">
          <div class="testimonial-author">
            ${c.avatar ? `<img class="avatar" src="${c.avatar}" alt="${esc(c.name)}" />` : ""}
            <span class="author-name">${esc(c.name)}</span>
          </div>
          <div class="stars">${starsHTML}</div>
        </div>
        <p class="testimonial-body">${esc(c.body)}</p>
        <span class="testimonial-date">${esc(c.date)}</span>
      </div>`).join("");

  return {
    html: `<section class="testimonials">
  ${title ? `<div class="section-header" style="margin-bottom: 48px;"><h2 class="section-title">${esc(title.text)}</h2></div>` : ""}
  <div class="testimonials-scroll">${cardsHTML}
  </div>
</section>`,
    css: `.testimonials { background: ${secBg}; padding: ${secPad}; }
.testimonials-scroll { display: flex; gap: ${scrollGap}; overflow-x: auto; padding-bottom: 16px; scrollbar-width: none; }
.testimonials-scroll::-webkit-scrollbar { display: none; }
.testimonial-card { flex: 0 0 ${cardWidth}; background: var(--white); border-radius: ${cardBr}; padding: ${cardPad}; display: flex; flex-direction: column; gap: ${cardGap}; }
.testimonial-header { display: flex; justify-content: space-between; align-items: center; }
.testimonial-author { display: flex; align-items: center; gap: 16px; }
.avatar { width: ${avatarW}; height: ${avatarH}; border-radius: 50%; object-fit: cover; }
.author-name { font-size: ${nameSize}; font-weight: 500; }
.stars { display: flex; gap: 5px; }
.stars svg { width: 18px; height: 18px; }
.testimonial-body { font-size: ${bodySize}; line-height: 1.5; color: var(--text-secondary); flex: 1; }
.testimonial-date { font-size: ${nameSize}; font-weight: 500; }
@media (max-width: 1024px) { .testimonials { padding: 60px 24px; } }`,
  };
}

// --- Split CTA (text + image side by side, or hero card with bg image) ---

function renderSplitCta(ctx: SectionContext): TemplateResult {
  const title = ctx.texts[0];
  const desc = ctx.texts[1];
  const btn = ctx.texts[2];
  const img = ctx.images[0];

  // Layout extraction
  const rootL = getLayout(ctx.root);
  const rootW = rootL.width ?? 0;
  const rootH = rootL.height ?? 0;
  const imgW = img?.width ?? 0;
  const imgH = img?.height ?? 0;
  const isBgImage = img && rootW > 0 && imgW >= rootW * 0.9 && imgH >= rootH * 0.9;

  if (isBgImage) {
    // Hero card with background image
    const btn2 = ctx.texts.find(t => t !== title && t !== desc && t.text.length <= 20);
    // Extract card layout from DSL
    const cardNode = ctx.root ? childAt(ctx.root, 0, ctx.nodeMap) : undefined;
    const cardInner = cardNode ? childAt(cardNode, 0, ctx.nodeMap) : undefined;
    const cardL = getLayout(cardInner);
    const cardPad = padOr(cardL.padding, "60px 80px");
    const cardBr = brOr(cardL.borderRadius, "18px");
    const contentNode = cardInner ? (() => {
      const children = directChildren(cardInner, ctx.nodeMap);
      return children.find(n => n.type !== "image");
    })() : undefined;
    const contentL = getLayout(contentNode);
    const contentMaxW = contentL.width ? `${Math.round(contentL.width)}px` : "560px";
    const titleSize = px(title?.fontSize, "32px");
    const titleWeight = `${fb(title?.fontWeight, 500)}`;
    const descSize = px(desc?.fontSize, "16px");

    return {
      html: `<section class="hero" style="padding: 40px 0;">
  <div class="container">
    <div class="hero-card">
      <div class="hero-bg" style="background-image: url('${img.src}'); background-size: cover; background-position: center;"></div>
      <div class="hero-content">
        ${title ? `<h1 class="hero-title">${esc(title.text)}</h1>` : ""}
        ${desc ? `<p class="hero-desc">${esc(desc.text)}</p>` : ""}
        <div class="hero-actions">
          ${btn ? `<button class="btn-primary">${esc(btn.text)}</button>` : ""}
          ${btn2 ? `<button class="btn-secondary">${esc(btn2.text)}</button>` : ""}
        </div>
      </div>
    </div>
  </div>
</section>`,
      css: `.hero-card { position: relative; border-radius: ${cardBr}; overflow: hidden; min-height: 400px; display: flex; align-items: center; padding: ${cardPad}; }
.hero-bg { position: absolute; right: 0; top: 0; bottom: 0; width: 55%; mask-image: linear-gradient(to right, transparent 0%, black 40%); -webkit-mask-image: linear-gradient(to right, transparent 0%, black 40%); }
.hero-content { position: relative; z-index: 2; max-width: ${contentMaxW}; }
.hero-title { font-size: ${titleSize}; font-weight: ${titleWeight}; line-height: 1.25; margin-bottom: 24px; }
.hero-desc { font-size: ${descSize}; line-height: 1.5; color: var(--text-tertiary); margin-bottom: 32px; max-width: 480px; }
.hero-actions { display: flex; gap: 16px; flex-wrap: wrap; }`,
    };
  }

  // Standard split CTA (text left, image right)
  const splitPad = padOr(rootL.padding, "0 120px");
  const splitW = px(rootL.width, "1440px");
  const splitMinH = px(rootL.height, "406px");
  const contentMaxW = (() => {
    const contentNode = ctx.root ? childAt(ctx.root, 0, ctx.nodeMap) : undefined;
    return px(getLayout(contentNode).width, "560px");
  })();
  const imgContainer = ctx.root ? childAt(ctx.root, 1, ctx.nodeMap) : undefined;
  const imgContainerL = getLayout(imgContainer);
  const imgFlexW = px(imgContainerL.width, "532px");
  const imgFlexH = px(imgContainerL.height, "406px");
  const imgBr = brOr(imgContainerL.borderRadius, "18px");

  return {
    html: `<section class="split-cta">
  <div class="split-cta-content">
    ${title ? `<h2 class="hero-title">${esc(title.text)}</h2>` : ""}
    ${desc ? `<p class="hero-desc">${esc(desc.text)}</p>` : ""}
    ${btn ? `<button class="btn-primary">${esc(btn.text)}</button>` : ""}
  </div>
  ${img ? `<div class="split-cta-img"><img src="${img.src}" alt="" /></div>` : ""}
</section>`,
    css: `.split-cta { padding: ${splitPad}; display: flex; align-items: center; justify-content: space-between; gap: 40px; max-width: ${splitW}; margin: 0 auto; min-height: ${splitMinH}; }
.split-cta-content { max-width: ${contentMaxW}; }
.split-cta-img { width: ${imgFlexW}; height: ${imgFlexH}; border-radius: ${imgBr}; overflow: hidden; }
.split-cta-img img { width: 100%; height: 100%; object-fit: cover; }`,
  };
}

// --- Videos ---

function renderVideos(ctx: SectionContext): TemplateResult {
  const title = ctx.texts[0];

  // Layout extraction
  const rootL = getLayout(ctx.root);
  const gridContainer = childAt(ctx.root, 1, ctx.nodeMap);
  const gridL = getLayout(gridContainer);
  const gridChildren = directChildren(gridContainer, ctx.nodeMap);
  const videoCardNode = gridChildren[0];
  const videoCardL = getLayout(videoCardNode);
  const thumbNode = videoCardNode ? childAt(videoCardNode, 0, ctx.nodeMap) : undefined;
  const thumbL = getLayout(thumbNode);
  const videoTitle = ctx.texts.find(t => t !== title && ctx.texts.indexOf(t) > 0);
  const videoDesc = ctx.texts.find(t => t !== title && t !== videoTitle);

  const secBg = rootL.background ?? "var(--surface-2)";
  const secPad = padOr(rootL.padding, "80px 120px");
  const gridGap = px(gridL.gap, "89px");
  const cardWidth = px(videoCardL.width, "500px");
  const thumbW = px(thumbL.width, "500px");
  const thumbH = px(thumbL.height, "300px");
  const thumbBr = brOr(thumbL.borderRadius, "18px");
  const vTitleSize = px(videoTitle?.fontSize, "24px");
  const vDescSize = px(videoDesc?.fontSize, "16px");

  const videoData: Array<{ title: string; desc: string; thumb: string }> = [];
  const remainingTexts = ctx.texts.slice(1);
  for (let i = 0; i < remainingTexts.length; i += 2) {
    videoData.push({
      title: remainingTexts[i]?.text ?? "",
      desc: remainingTexts[i + 1]?.text ?? "",
      thumb: ctx.images[Math.floor(i / 2)]?.src ?? "",
    });
  }

  const cardsHTML = videoData.map(v => `
    <div class="video-card">
      <div class="video-thumb">
        <img src="${v.thumb}" alt="${esc(v.title)}" />
        <div class="video-overlay">
          <button class="play-btn" aria-label="Play"><svg viewBox="0 0 24 24" fill="rgba(0,0,0,0.88)" width="24" height="24"><path d="M8 5v14l11-7z"/></svg></button>
        </div>
      </div>
      ${v.title ? `<h3 class="video-title">${esc(v.title)}</h3>` : ""}
      ${v.desc ? `<p class="video-desc">${esc(v.desc)}</p>` : ""}
    </div>`).join("");

  return {
    html: `<section class="videos">
  ${title ? `<div class="section-header" style="margin-bottom: 56px;"><h2 class="section-title">${esc(title.text)}</h2></div>` : ""}
  <div class="videos-grid">${cardsHTML}
  </div>
</section>`,
    css: `.videos { background: ${secBg}; padding: ${secPad}; }
.videos-grid { display: flex; gap: ${gridGap}; justify-content: center; }
.video-card { width: ${cardWidth}; }
.video-thumb { width: ${thumbW}; height: ${thumbH}; border-radius: ${thumbBr}; overflow: hidden; margin-bottom: 32px; position: relative; }
.video-thumb img { width: 100%; height: 100%; object-fit: cover; }
.video-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; }
.play-btn { width: 64px; height: 64px; background: rgba(255,255,255,0.9); border-radius: 50%; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; }
.video-title { font-size: ${vTitleSize}; font-weight: 500; line-height: 1.5; margin-bottom: 8px; }
.video-desc { font-size: ${vDescSize}; line-height: 1.5; color: var(--text-tertiary); }`,
  };
}

// --- FAQ ---

function renderFaq(ctx: SectionContext): TemplateResult {
  const title = ctx.texts[0];
  const items: Array<{ q: string; a: string }> = [];
  const remaining = ctx.texts.slice(1);
  for (let i = 0; i < remaining.length; i += 2) {
    items.push({ q: remaining[i]?.text ?? "", a: remaining[i + 1]?.text ?? "" });
  }

  // Layout extraction
  const root = getLayout(ctx.root);
  const rootPad = padOr(root.padding, "80px 0");
  // FAQ list container is the child after section-header
  const containerNode = childAt(ctx.root, 0, ctx.nodeMap);
  const faqListNode = containerNode ? childAt(containerNode, 1, ctx.nodeMap) : undefined;
  const faqList = getLayout(faqListNode);
  const listWidth = px(faqList.width, "800px");
  // Trigger (question) text styles
  const triggerFontSize = px(remaining[0]?.fontSize, "24px");
  const triggerFontWeight = `${fb(remaining[0]?.fontWeight, 500)}`;
  // Content (answer) text styles
  const contentFontSize = px(remaining[1]?.fontSize, "16px");

  const itemsHTML = items.map((item, i) => `
    <div class="faq-item${i === 1 ? " active" : ""}">
      <button class="faq-trigger">${esc(item.q)}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </button>
      <div class="faq-content">${esc(item.a)}</div>
    </div>`).join("");

  return {
    html: `<section class="help">
  <div class="container">
    ${title ? `<div class="section-header"><h2 class="section-title">${esc(title.text)}</h2></div>` : ""}
    <div class="faq-list">${itemsHTML}
    </div>
  </div>
</section>
<script>
document.querySelectorAll('.faq-trigger').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const wasActive = item.classList.contains('active');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
    if (!wasActive) item.classList.add('active');
  });
});
</script>`,
    css: `.help { padding: ${rootPad}; }
.faq-list { max-width: ${listWidth}; margin: 0 auto; }
.faq-item { border-bottom: 1px solid var(--border); }
.faq-trigger { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 16px 0; font-size: ${triggerFontSize}; font-weight: ${triggerFontWeight}; color: var(--text-primary); text-align: left; background: none; border: none; cursor: pointer; font-family: inherit; }
.faq-trigger svg { transition: transform 0.3s; flex-shrink: 0; }
.faq-item.active .faq-trigger svg { transform: rotate(90deg); }
.faq-content { max-height: 0; overflow: hidden; transition: max-height 0.3s ease, padding 0.3s ease; font-size: ${contentFontSize}; line-height: 1.5; color: var(--text-tertiary); }
.faq-item.active .faq-content { max-height: 300px; padding-bottom: 16px; }`,
  };
}

// --- Contact ---

function renderContact(ctx: SectionContext): TemplateResult {
  const root = ctx.root;
  // Contact has two halves: left (message + button) and right (email + text)
  // Root children: [left-container, divider-icon, right-container]
  const leftChild = root?.children ? ctx.nodeMap.get(root.children[0]) : undefined;
  const rightChild = root?.children ? ctx.nodeMap.get(root.children[root.children.length - 1]) : undefined;

  let leftTexts: TextItem[] = [];
  let rightTexts: TextItem[] = [];
  if (leftChild) collectDescendantTexts(leftChild, ctx.nodeMap, leftTexts);
  if (rightChild) collectDescendantTexts(rightChild, ctx.nodeMap, rightTexts);

  // Left: title, description, button
  const lTitle = leftTexts.find(t => t.fontSize >= 24);
  const lDesc = leftTexts.find(t => t !== lTitle && t.text.length > 20);
  const lBtn = leftTexts.find(t => t !== lTitle && t !== lDesc);

  // Right: title, description, email
  const rTitle = rightTexts.find(t => t.fontSize >= 24);
  const rDesc = rightTexts.find(t => t !== rTitle && t.text.length > 20);
  const rEmail = rightTexts.find(t => t !== rTitle && t !== rDesc);

  // Divider icon between halves
  const dividerIcon = ctx.icons.length > 0 ? ctx.icons[0] : null;

  // Layout extraction
  const rootL = getLayout(root);
  const secPad = padOr(rootL.padding, "80px 0");
  const cardNode = root ? childAt(root, 0, ctx.nodeMap) : undefined;
  const cardL = getLayout(cardNode);
  const cardW = px(cardL.width, "1256px");
  const cardBg = cardL.background ?? "var(--primary-10)";
  const cardBr = brOr(cardL.borderRadius, "18px");
  const cardPad = padOr(cardL.padding, "56px 64px");
  const cardGap = px(cardL.gap, "64px");
  const titleSize = px(lTitle?.fontSize ?? rTitle?.fontSize, "32px");
  const titleWeight = `${fb(lTitle?.fontWeight ?? rTitle?.fontWeight, 600)}`;
  const textSize = px(lDesc?.fontSize ?? rDesc?.fontSize, "16px");
  // Button styles from the button container node
  const btnNode = ctx.allNodes.find(n => n.type === "container" && n.children?.length === 0 && n.style?.background);
  const btnPad = padOr(getLayout(btnNode).padding, "14px 28px");
  const btnBr = brOr(getLayout(btnNode).borderRadius, "80px");
  const btnSize = px(lBtn?.fontSize ?? rEmail?.fontSize, "16px");

  return {
    html: `<section class="contact">
  <div class="container">
    <div class="contact-card">
      <div class="contact-half">
        ${lTitle ? `<h3 class="contact-title">${esc(lTitle.text)}</h3>` : ""}
        ${lDesc ? `<p class="contact-text">${esc(lDesc.text)}</p>` : ""}
        ${lBtn ? `<button class="btn-contact">${esc(lBtn.text)}</button>` : ""}
      </div>
      ${dividerIcon ? `<div class="contact-divider"><div style="width:24px;height:200px">${dividerIcon.svgHtml}</div></div>` : '<div class="contact-divider"></div>'}
      <div class="contact-half">
        ${rTitle ? `<h3 class="contact-title">${esc(rTitle.text)}</h3>` : ""}
        ${rDesc ? `<p class="contact-text">${esc(rDesc.text)}</p>` : ""}
        ${rEmail ? `<a href="mailto:${rEmail.text}" class="btn-contact">${esc(rEmail.text)}</a>` : ""}
      </div>
    </div>
  </div>
</section>`,
    css: `.contact { padding: ${secPad}; }
.contact-card { max-width: ${cardW}; margin: 0 auto; background: ${cardBg}; border-radius: ${cardBr}; padding: ${cardPad}; display: flex; align-items: center; gap: ${cardGap}; }
.contact-half { flex: 1; }
.contact-divider { width: 1px; height: 200px; background: var(--border); flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.contact-title { font-size: ${titleSize}; font-weight: ${titleWeight}; line-height: 1.25; margin-bottom: 24px; }
.contact-text { font-size: ${textSize}; line-height: 1.5; color: var(--text-tertiary); margin-bottom: 32px; }
.btn-contact { display: inline-flex; align-items: center; gap: 8px; background: var(--text-primary); color: var(--white); padding: ${btnPad}; border-radius: ${btnBr}; font-size: ${btnSize}; font-weight: 600; border: none; cursor: pointer; text-decoration: none; }
.btn-contact:hover { opacity: 0.85; }
@media (max-width: 1024px) { .contact-card { flex-direction: column; } .contact-divider { display: none; } }`,
  };
}

// --- Footer ---

function renderFooter(ctx: SectionContext): TemplateResult {
  // Layout extraction
  const rootL = getLayout(ctx.root);
  const footerBg = rootL.background ?? "var(--surface-4)";
  const footerPad = padOr(rootL.padding, "80px 120px 40px");
  const gridNode = ctx.root ? childAt(ctx.root, 0, ctx.nodeMap) : undefined;
  const gridL = getLayout(gridNode);
  const gridGap = px(gridL.gap, "50px");
  // Vertical gap between grid and bottom
  const bottomNode = ctx.root ? childAt(ctx.root, 1, ctx.nodeMap) : undefined;
  const gridMarginBottom = (() => {
    if (gridNode && bottomNode) {
      const gap = verticalGap(gridNode, bottomNode);
      return gap !== undefined ? `${Math.round(gap)}px` : "80px";
    }
    return "80px";
  })();
  const titleText = ctx.texts.find(t => t.fontSize >= 20);
  const titleSize = px(titleText?.fontSize, "24px");
  const titleWeight = `${fb(titleText?.fontWeight, 600)}`;

  // Group texts into columns by detecting title patterns (short, bold) followed by links
  const columns: Array<{ title: string; links: string[] }> = [];
  let currentCol: { title: string; links: string[] } | null = null;

  for (const t of ctx.texts) {
    if (t.fontSize >= 20 || t.fontWeight >= 600) {
      if (currentCol) columns.push(currentCol);
      currentCol = { title: t.text, links: [] };
    } else if (currentCol) {
      currentCol.links.push(t.text);
    }
  }
  if (currentCol) columns.push(currentCol);

  const copyright = ctx.texts.find(t => t.text.toLowerCase().includes("copyright"));

  const colsHTML = columns.map(col => `
    <div class="footer-col">
      <p class="footer-title">${esc(col.title)}</p>
      <div class="footer-links">
        ${col.links.map(l => `<a href="#">${esc(l)}</a>`).join("\n        ")}
      </div>
    </div>`).join("");

  // Social icons (last few icons)
  const socialIcons = ctx.icons.slice(-3);
  const socialsHTML = socialIcons.map(ic =>
    `<a href="#" aria-label="Social"><div style="width:18px;height:18px">${ic.svgHtml}</div></a>`
  ).join("\n      ");

  return {
    html: `<footer class="footer">
  <div class="footer-grid">${colsHTML}
  </div>
  <div class="footer-bottom">
    ${copyright ? `<p class="copyright">${esc(copyright.text)}</p>` : ""}
    ${socialsHTML ? `<div class="socials">${socialsHTML}</div>` : ""}
  </div>
</footer>`,
    css: `.footer { background: ${footerBg}; padding: ${footerPad}; }
.footer-grid { display: flex; gap: ${gridGap}; justify-content: flex-end; margin-bottom: ${gridMarginBottom}; }
.footer-col { min-width: 160px; }
.footer-title { font-size: ${titleSize}; font-weight: ${titleWeight}; margin-bottom: 20px; padding-top: 20px; border-top: 1px solid var(--text-disabled); }
.footer-links { display: flex; flex-direction: column; gap: 4px; }
.footer-links a { font-size: 16px; color: var(--text-primary); padding: 4px 0; text-decoration: none; }
.footer-links a:hover { color: var(--primary); }
.footer-bottom { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 24px; }
.copyright { font-size: 16px; color: var(--text-muted); }
.socials { display: flex; gap: 16px; }
.socials a { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
.socials a:hover { background: var(--surface-6); }
@media (max-width: 1024px) { .footer { padding: 60px 24px 30px; } .footer-grid { justify-content: flex-start; flex-wrap: wrap; } }`,
  };
}

// --- Generic Content (fallback) ---

function renderGeneric(ctx: SectionContext): TemplateResult {
  const root = getLayout(ctx.root);
  const bg = ctx.root?.style.background;
  const bgStyle = bg ? `background: ${bg};` : "";
  const secPad = padOr(root.padding, "80px 0");
  const titleSize = px(ctx.texts.find(t => t.fontSize >= 32)?.fontSize, "32px");
  const h3Size = px(ctx.texts.find(t => t.fontSize >= 20 && t.fontSize < 32)?.fontSize, "20px");

  const contentHTML = ctx.texts.map(t => {
    if (t.fontSize >= 32) return `<h2 class="section-title">${esc(t.text)}</h2>`;
    if (t.fontSize >= 20) return `<h3>${esc(t.text)}</h3>`;
    return `<p>${esc(t.text)}</p>`;
  }).join("\n    ");

  const imgsHTML = ctx.images.map(img =>
    `<img src="${img.src}" alt="${esc(img.alt)}" style="max-width:100%;border-radius:10px;" />`
  ).join("\n    ");

  return {
    html: `<section class="generic-content" style="${bgStyle}">
  <div class="container">
    ${contentHTML}
    ${imgsHTML}
  </div>
</section>`,
    css: `.generic-content { padding: ${secPad}; }
.generic-content h2 { font-size: ${titleSize}; }
.generic-content h3 { font-size: ${h3Size}; }`,
  };
}

type TemplateResult = { html: string; css: string };
