/**
 * Whole-Page Single-Shot HTML Generator
 *
 * One LLM call generates the entire page HTML with:
 * - Semantic HTML5 structure
 * - CSS custom properties from design system
 * - Responsive breakpoints (1024px, 640px)
 * - Interactive elements (accordions, hover, scroll animations)
 * - BEM-lite class naming
 */

import type { Section } from "./section-splitter.js";
import type { DSLAnalysis, AnalyzedSection } from "./dsl-analyzer.js";
import { LLMClient } from "../llm/llm-client.js";

export type PageGenerationResult = {
  html: string;
  usage: { inputTokens: number; outputTokens: number };
};

const WHOLE_PAGE_SYSTEM_PROMPT = `You are an expert frontend developer converting a structured design DSL into a complete, production-quality HTML page.

CRITICAL RULES:
1. Output a COMPLETE HTML page with inline <style> and <script> tags.
2. Use semantic HTML5: <nav>, <header>, <section>, <article>, <main>, <aside>, <footer>, <h1>-<h6>, <p>, <button>, <a>, <img>, <ul>/<li>, <figure>/<figcaption>.
3. Use BEM-lite class naming: .navbar, .hero-title, .feature-card, .cta-banner, .footer-link, .testimonial-card, .process-step, etc.
4. Use CSS custom properties from the provided :root block — NEVER hardcode colors or spacing.
5. Responsive design: include @media breakpoints at 1024px and 640px. Use mobile-first approach.
6. Interactive elements:
   - FAQ/accordion: toggle .active class, one-open-at-a-time
   - Hover effects on buttons and cards (translateY, box-shadow)
   - Smooth scroll for anchor links
7. Images: if the URL is missing or empty, use a CSS gradient placeholder (linear-gradient with the page's primary colors).
8. Add IntersectionObserver fadeUp animation: sections start opacity:0, translateY(30px) and animate in on scroll.
9. If the first section is a navbar, make it sticky with backdrop-filter: blur() glass effect.
10. Preserve ALL text content EXACTLY as provided — do not paraphrase or truncate.
11. Use the exact typography sizes from the design (match fontSize values).
12. Wrap each logical section with <!-- Section: {semantic-name} --> HTML comments.
13. Return ONLY the HTML code block, no explanation text.
14. For alternating section backgrounds, use .reverse class to flip row direction or swap text/image order.
15. Use inline SVG icons where appropriate (arrows, play buttons, chevrons, etc.).
16. Be CONCISE in CSS: avoid redundant rules, combine selectors, use shorthand properties. Minimize comments in CSS/HTML.`;

export async function generatePageHTML(
  analysis: DSLAnalysis,
  _sections: Section[],
  options?: {
    maxTokens?: number;
  },
): Promise<PageGenerationResult> {
  const maxTokens = options?.maxTokens ??
    parseInt(process.env.LLM_MAX_TOKENS_PAGE || "16384", 10);

  // Whole-page generation needs longer timeout (15min)
  const timeout = parseInt(process.env.LLM_TIMEOUT_PAGE || "900000", 10);

  const llm = new LLMClient({ maxTokens, timeout });

  const userPrompt = buildWholePagePrompt(analysis);

  const response = await llm.chatWithRetry(
    [{ role: "user", content: userPrompt }],
    WHOLE_PAGE_SYSTEM_PROMPT,
    2,
  );

  const html = parsePageOutput(response.text);

  if (!html) {
    throw new Error("LLM output was not a valid HTML page");
  }

  // Check for truncation
  if (!html.includes("</html>")) {
    console.warn("[PageGen] ⚠️ Output may be truncated (missing </html> tag)");
  }

  return {
    html,
    usage: response.usage,
  };
}

function buildWholePagePrompt(analysis: DSLAnalysis): string {
  const { page, sections, typographyScale, designSystem } = analysis;

  const parts: string[] = [];

  // 1. Design System
  parts.push(`## Design System (CSS Custom Properties — USE THESE, do not hardcode colors/spacing)
${designSystem.rootCSS}

## Shared Utility Classes
${designSystem.utilityCSS}`);

  // 2. Page Info
  parts.push(`
## Page Info
- Name: "${page.name}"
- Dimensions: ${page.width}px × ${page.height}px
- Sections: ${sections.length}
- Content width: ${analysis.contentWidth}px`);

  // 3. Typography Scale
  if (typographyScale.length > 0) {
    const scaleStr = typographyScale
      .map(t => `${t.size}px — ${t.role} (${t.usage} uses)`)
      .join("\n");
    parts.push(`
## Typography Scale
${scaleStr}`);
  }

  // 4. Section-by-Section Structure
  parts.push("\n## Section-by-Section Structure\n");

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    parts.push(formatSectionBlock(sec, i, sections.length));
  }

  // 5. Instructions
  parts.push(`
## Instructions
Generate the complete HTML page now. Requirements:
- All CSS goes in a single <style> tag in <head>
- All JS goes in a single <script> tag before </body>
- Each section wrapped in <!-- Section: {name} --> comments
- Preserve every piece of text content exactly
- Use CSS custom properties for ALL colors and spacing
- Include responsive @media queries
- Add fadeUp scroll animation with IntersectionObserver
- If navbar section exists, make it sticky with glass effect`);

  return parts.join("\n");
}

function formatSectionBlock(sec: AnalyzedSection, index: number, total: number): string {
  const position = `position ${index + 1} of ${total}`;
  const lines: string[] = [];

  lines.push(`### Section ${index + 1}: "${sec.name}" (semantic guess: ${sec.semanticGuess})`);
  lines.push(`- Position: y=${sec.yPosition}px, height=${sec.height}px (${position})`);
  lines.push(`- Nodes: ${sec.nodeCount}, max depth: ${sec.maxDepth}`);
  lines.push(`- Layout: ${sec.childDirection}`);
  lines.push(`- Contains: ${sec.hasImages ? "images" : "no images"}, ${sec.hasButtons ? "buttons" : "no buttons"}`);

  if (sec.textSummary.length > 0) {
    lines.push(`- Text content:`);
    for (const t of sec.textSummary) {
      lines.push(`  - "${t}"`);
    }
  }

  lines.push(`- Tree:`);
  lines.push(sec.compactTree);
  lines.push("");

  return lines.join("\n");
}

function parsePageOutput(text: string): string | null {
  let html = text.trim();

  // Strip code fences
  html = html.replace(/^```html\s*\n?/i, "");
  html = html.replace(/^```\s*\n?/, "");
  html = html.replace(/\n?```\s*$/, "");
  html = html.trim();

  // Validate: must have at least <html> opening
  if (!html.includes("<html") && !html.includes("<!DOCTYPE")) {
    return null;
  }

  return html;
}
