/**
 * 全局动画系统
 *
 * 提供流畅的动画效果：
 * - 页面加载动画
 * - 元素渐入效果
 * - Hover 动画
 * - 过渡效果
 */

export const GLOBAL_ANIMATIONS_CSS = `
/* ========== 页面加载动画 ========== */

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInLeft {
  from {
    opacity: 0;
    transform: translateX(-30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* ========== 工具类 ========== */

.animate-fade-in {
  animation: fadeIn 0.6s ease-out forwards;
}

.animate-slide-in-left {
  animation: slideInLeft 0.6s ease-out forwards;
}

.animate-slide-in-right {
  animation: slideInRight 0.6s ease-out forwards;
}

.animate-scale-in {
  animation: scaleIn 0.6s ease-out forwards;
}

/* 延迟动画 */
.delay-100 { animation-delay: 0.1s; }
.delay-200 { animation-delay: 0.2s; }
.delay-300 { animation-delay: 0.3s; }
.delay-400 { animation-delay: 0.4s; }
.delay-500 { animation-delay: 0.5s; }

/* ========== Hover 效果 ========== */

.hover-lift {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.hover-lift:hover {
  transform: translateY(-4px);
}

.hover-scale {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.hover-scale:hover {
  transform: scale(1.05);
}

.hover-glow {
  transition: box-shadow 0.3s ease;
}

.hover-glow:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

/* ========== 平滑滚动 ========== */

html {
  scroll-behavior: smooth;
}

/* ========== 通用过渡 ========== */

* {
  transition-property: background-color, border-color, color, fill, stroke, opacity, box-shadow, transform;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}

/* ========== 加载骨架屏 ========== */

@keyframes shimmer {
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
}

.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 1000px 100%;
  animation: shimmer 2s infinite;
}

/* ========== 交互反馈 ========== */

.interactive {
  cursor: pointer;
  user-select: none;
}

.interactive:active {
  transform: scale(0.98);
}

/* ========== 焦点样式 ========== */

:focus-visible {
  outline: 2px solid var(--primary, #5747F4);
  outline-offset: 2px;
  border-radius: 4px;
}

/* ========== 滚动条样式 ========== */

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}
`;

// ========== 动画工具函数 ==========

export function addAnimationClass(index: number): string {
  const animations = ["animate-fade-in", "animate-slide-in-left", "animate-slide-in-right", "animate-scale-in"];
  const delays = ["", "delay-100", "delay-200", "delay-300"];

  const animClass = animations[index % animations.length];
  const delayClass = delays[Math.floor(index / 4) % delays.length];

  return `${animClass} ${delayClass}`.trim();
}

export function addHoverEffect(type: "lift" | "scale" | "glow" = "lift"): string {
  return `hover-${type}`;
}
