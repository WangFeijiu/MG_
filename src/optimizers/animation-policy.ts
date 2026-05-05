/**
 * 动画策略 — 按结构组件类型映射动画
 *
 * button → hover lift / press
 * card → hover shadow / fade-up
 * grid / card-list → stagger fade-up
 * section → fade-in / fade-up
 * accordion → expand-collapse
 * image → zoom-fade
 * icon → subtle pulse
 */

import type { UIComponent, ComponentRecognition } from "../generators/component-recognizer.js";

export type AnimationPolicy = {
  component: UIComponent;
  animations: string[];
  css: string;
};

const POLICIES: Record<string, AnimationPolicy> = {
  button: {
    component: "button",
    animations: ["hover-lift", "press"],
    css: `
[data-dsl-id] > .anim-button,
.anim-button {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  cursor: pointer;
}
[data-dsl-id] > .anim-button:hover,
.anim-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
[data-dsl-id] > .anim-button:active,
.anim-button:active {
  transform: translateY(0);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}`,
  },

  card: {
    component: "card",
    animations: ["hover-shadow", "fade-up"],
    css: `
.anim-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.anim-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
}`,
  },

  "grid": {
    component: "grid",
    animations: ["stagger-fade-up"],
    css: `
.anim-grid > *:nth-child(1) { animation: fadeUp 0.4s ease both; animation-delay: 0.0s; }
.anim-grid > *:nth-child(2) { animation: fadeUp 0.4s ease both; animation-delay: 0.08s; }
.anim-grid > *:nth-child(3) { animation: fadeUp 0.4s ease both; animation-delay: 0.16s; }
.anim-grid > *:nth-child(4) { animation: fadeUp 0.4s ease both; animation-delay: 0.24s; }
.anim-grid > *:nth-child(5) { animation: fadeUp 0.4s ease both; animation-delay: 0.32s; }
.anim-grid > *:nth-child(6) { animation: fadeUp 0.4s ease both; animation-delay: 0.40s; }
.anim-grid > *:nth-child(n+7) { animation: fadeUp 0.4s ease both; animation-delay: 0.48s; }`,
  },

  "card-list": {
    component: "card-list",
    animations: ["stagger-fade-up"],
    css: `
.anim-card-list > *:nth-child(1) { animation: fadeUp 0.4s ease both; animation-delay: 0.0s; }
.anim-card-list > *:nth-child(2) { animation: fadeUp 0.4s ease both; animation-delay: 0.1s; }
.anim-card-list > *:nth-child(3) { animation: fadeUp 0.4s ease both; animation-delay: 0.2s; }
.anim-card-list > *:nth-child(n+4) { animation: fadeUp 0.4s ease both; animation-delay: 0.3s; }`,
  },

  section: {
    component: "section",
    animations: ["fade-in"],
    css: `
.anim-section {
  animation: fadeIn 0.5s ease both;
}`,
  },

  accordion: {
    component: "accordion",
    animations: ["expand-collapse"],
    css: `
.anim-accordion-item {
  overflow: hidden;
  transition: max-height 0.3s ease;
}`,
  },

  image: {
    component: "image",
    animations: ["zoom-fade"],
    css: `
.anim-image {
  transition: transform 0.3s ease, opacity 0.3s ease;
  overflow: hidden;
}
.anim-image:hover {
  transform: scale(1.03);
}`,
  },

  icon: {
    component: "icon",
    animations: ["pulse"],
    css: `
.anim-icon {
  transition: transform 0.2s ease;
}
.anim-icon:hover {
  transform: scale(1.1);
}`,
  },

  link: {
    component: "link",
    animations: ["hover-underline"],
    css: `
.anim-link {
  transition: opacity 0.15s ease;
  cursor: pointer;
}
.anim-link:hover {
  opacity: 0.7;
}`,
  },
};

// Keyframes (shared)
const KEYFRAMES = `
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

// Test mode override: disable all animations during diff
const TEST_MODE_CSS = `
[data-test-mode] *,
[data-test-mode] *::before,
[data-test-mode] *::after {
  animation: none !important;
  transition: none !important;
}
`;

export function getAnimationCSS(components: ComponentRecognition[]): {
  css: string;
  animatableCount: number;
  totalCount: number;
  classMap: Map<string, string>;
} {
  const usedPolicies = new Set<string>();
  const classMap = new Map<string, string>(); // nodeId → anim-class

  for (const comp of components) {
    if (!comp.animatable) continue;
    const policy = POLICIES[comp.component];
    if (!policy) continue;
    usedPolicies.add(comp.component);
    classMap.set(comp.nodeId, `anim-${comp.component}`);
  }

  let css = KEYFRAMES;
  for (const componentName of usedPolicies) {
    const policy = POLICIES[componentName];
    if (policy) css += policy.css + "\n";
  }
  css += TEST_MODE_CSS;

  const animatable = components.filter(c => c.animatable).length;

  return {
    css,
    animatableCount: animatable,
    totalCount: components.length,
    classMap,
  };
}

export function injectAnimationClasses(html: string, classMap: Map<string, string>): string {
  let result = html;

  // Inject animation CSS into <head>
  const animationCSS = getAnimationCSSFromMap(classMap);
  if (animationCSS && result.includes("</head>")) {
    result = result.replace("</head>", `<style>\n/* Component animations */\n${animationCSS}\n</style>\n</head>`);
  }

  // Add animation classes to matching elements
  for (const [nodeId, animClass] of classMap) {
    const marker = `data-dsl-id="${nodeId}"`;
    const idx = result.indexOf(marker);
    if (idx === -1) continue;

    // Find the opening tag containing this marker
    const tagStart = result.lastIndexOf("<", idx);
    const tagEnd = result.indexOf(">", idx);
    if (tagStart === -1 || tagEnd === -1) continue;

    // Check if already has class attribute
    const tag = result.substring(tagStart, tagEnd + 1);
    if (tag.includes('class="')) {
      // Append to existing class attribute value
      const classIdx = result.indexOf('class="', tagStart);
      if (classIdx !== -1 && classIdx < tagEnd) {
        const valueStart = classIdx + 7; // after 'class="'
        result = result.substring(0, valueStart) + animClass + " " + result.substring(valueStart);
      }
    } else {
      // Add class attribute
      result = result.substring(0, tagEnd) + ` class="${animClass}"` + result.substring(tagEnd);
    }
  }

  return result;
}

function getAnimationCSSFromMap(classMap: Map<string, string>): string {
  const usedComponents = new Set<string>();
  for (const [, animClass] of classMap) {
    // anim-button → button, anim-card → card, etc.
    const comp = animClass.replace("anim-", "");
    usedComponents.add(comp);
  }

  let css = KEYFRAMES;
  for (const comp of usedComponents) {
    const policy = POLICIES[comp];
    if (policy) css += policy.css + "\n";
  }
  css += TEST_MODE_CSS;
  return css;
}
