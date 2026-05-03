# 自动优化系统架构文档

## 系统概述

本系统实现了一个完全自动化的DSL到HTML转换优化流程，能够通过截图对比自动发现并修复生成代码与设计稿之间的差异，最终实现像素级还原。

## 核心设计理念

### 1. 自主执行、自我优化、自我检测

系统采用闭环优化架构：

```
DSL → HTML生成 → 截图 → 差异分析 → 修复策略 → 更新DSL → 重新生成
  ↑                                                              ↓
  └──────────────────────── 收敛检查 ←──────────────────────────┘
```

### 2. 拒绝硬编码

所有优化策略都是基于通用规则和启发式算法，不针对特定设计稿：

- **布局检测**：基于子元素位置关系判断水平/垂直布局
- **间距分析**：计算平均间距并检测一致性
- **颜色对比**：采样对比，不依赖具体颜色值
- **字体检测**：基于合理范围判断，不硬编码字号

### 3. 通用化设计

系统可以处理任意DSL结构：

```typescript
// 不依赖特定节点ID或名称
// 不依赖特定布局结构
// 不依赖特定样式值

// 而是基于：
- 节点类型（type）
- 布局关系（layout）
- 样式属性（style）
- 视觉差异（diff analysis）
```

## 技术架构

### 核心模块

#### 1. AutoOptimizer（自动优化器）

**职责**：
- 管理优化流程
- 协调各个子模块
- 控制迭代次数和收敛条件

**关键方法**：
```typescript
class AutoOptimizer {
  // 主优化流程
  async optimize(dsl, sections, originalData): Promise<OptimizationResult[]>
  
  // 单Section优化
  private async optimizeSection(...): Promise<OptimizationResult>
  
  // 差异分析
  private analyzeDiff(...): DiffAnalysis
  
  // 生成修复策略
  private generateFixes(...): Fix[]
  
  // 应用修复
  private applyFix(dsl, nodeId, fix): MachineDSL
}
```

#### 2. 差异检测系统

**布局检测**：
```typescript
detectLayoutIssues() {
  // 宽度/高度差异
  // Flex方向判断
  // 对齐方式检查
}
```

**颜色检测**：
```typescript
detectColorIssues() {
  // 采样点对比
  // 颜色距离计算
  // 大面积差异识别
}
```

**字体检测**：
```typescript
detectTypographyIssues() {
  // 字号合理性
  // 字重检查
  // 行高分析
}
```

**间距检测**：
```typescript
detectSpacingIssues() {
  // 子元素间距计算
  // 一致性检查
  // 平均值推荐
}
```

#### 3. 修复策略生成器

基于检测到的问题，生成可执行的修复策略：

```typescript
generateFixes(analysis) {
  const fixes = [];
  
  // 布局修复
  if (shouldUseRow) {
    fixes.push({
      type: "update-style",
      payload: { flexDirection: "row" }
    });
  }
  
  // 间距修复
  if (inconsistentGap) {
    fixes.push({
      type: "update-style",
      payload: { gap: `${avgGap}px` }
    });
  }
  
  return fixes;
}
```

#### 4. DSL更新器

安全地更新DSL，保持数据完整性：

```typescript
applyFix(dsl, nodeId, fix) {
  const newDSL = deepClone(dsl);
  const node = findNode(newDSL, nodeId);
  
  if (fix.type === "update-style") {
    node.style = { ...node.style, ...fix.payload };
  }
  
  return newDSL;
}
```

### 数据流

```
输入：
  - MachineDSL（机器可读的DSL）
  - OriginalDslData（原始设计数据）
  - design-baseline.png（设计稿截图）

处理：
  1. Section分割
  2. 逐Section优化：
     a. 生成HTML
     b. Puppeteer截图
     c. pixelmatch对比
     d. 差异分析
     e. 生成修复
     f. 应用修复
     g. 检查收敛
  3. 迭代直到收敛或达到最大次数

输出：
  - OptimizationResult[]（优化结果）
  - optimized-machine-dsl.json（优化后的DSL）
  - preview-optimized.html（优化后的HTML）
```

## 优化策略详解

### 布局优化

#### 水平/垂直布局判断

```typescript
isHorizontalLayout(children) {
  const first = children[0];
  const second = children[1];
  
  const firstRight = first.layout.x + first.layout.width;
  const secondLeft = second.layout.x;
  
  // 第二个元素在第一个右侧 → 水平布局
  return secondLeft >= firstRight - 10;
}
```

#### Flex方向修正

```typescript
if (isHorizontal && currentDirection === "column") {
  // 应该水平但当前垂直 → 修正为row
  fix = { flexDirection: "row" };
}
```

### 间距优化

#### 间距一致性检查

```typescript
const gaps = calculateGapsBetweenChildren(children);
const avgGap = average(gaps);
const inconsistent = gaps.some(g => Math.abs(g - avgGap) > 5);

if (inconsistent) {
  fix = { gap: `${Math.round(avgGap)}px` };
}
```

### 颜色优化

#### 采样对比

```typescript
const samplePoints = 20;
for (let i = 0; i < samplePoints; i++) {
  const x = (width / samplePoints) * i;
  const y = height / 2;
  
  const colorDist = calculateColorDistance(
    baseline.getPixel(x, y),
    screenshot.getPixel(x, y)
  );
  
  if (colorDist > threshold) {
    colorDiffCount++;
  }
}
```

## 收敛机制

### 收敛条件

```typescript
converged = (
  diffPercent <= targetDiffThreshold ||  // 差异足够小
  iteration >= maxIterations ||          // 达到最大迭代
  fixes.length === 0                     // 无可用修复
);
```

### 早停机制

```typescript
if (currentDiff >= previousDiff) {
  // 差异没有改善，可能陷入震荡
  console.log("差异未改善，停止迭代");
  break;
}
```

## 性能优化

### 1. 增量更新

只更新变化的Section，避免全量重新生成：

```typescript
// 只重新生成当前Section的HTML
const sectionHTML = generateSectionHTML(section);
```

### 2. 并行处理（未来）

```typescript
// 可以并行优化多个独立的Section
const results = await Promise.all(
  sections.map(s => optimizeSection(s))
);
```

### 3. 缓存机制（未来）

```typescript
// 缓存已经收敛的Section
const cache = new Map<string, OptimizedSection>();
```

## 扩展性设计

### 添加新的检测器

```typescript
// 1. 定义问题类型
export type NewIssue = {
  type: string;
  severity: "critical" | "major" | "minor";
  description: string;
};

// 2. 实现检测方法
private detectNewIssue(...): NewIssue[] {
  // 检测逻辑
}

// 3. 集成到analyzeDiff
private analyzeDiff(...): DiffAnalysis {
  return {
    ...
    newIssues: this.detectNewIssue(...),
  };
}
```

### 添加新的修复策略

```typescript
// 在generateFixes中添加
for (const issue of analysis.newIssues) {
  if (issue.type === "new-problem") {
    fixes.push({
      type: "new-fix-type",
      description: "修复描述",
      payload: { /* 修复数据 */ },
    });
  }
}

// 在applyFix中处理
if (fix.type === "new-fix-type") {
  // 应用新的修复逻辑
}
```

## 使用示例

### 基础使用

```bash
# 1. 准备设计稿
cp design.png output/design-baseline.png

# 2. 运行优化
npm run auto-optimize

# 3. 查看结果
open output/preview-optimized.html
```

### 集成到工作流

```bash
# 完整流程：获取DSL → 生成HTML → 自动优化
npm run dev:auto:rebuild
```

### 编程接口

```typescript
import { AutoOptimizer } from "./optimizers/auto-optimizer";

const optimizer = new AutoOptimizer({
  maxIterations: 10,
  targetDiffThreshold: 0.02,
});

await optimizer.initialize();
const results = await optimizer.optimize(dsl, sections, originalData);
await optimizer.cleanup();

// 分析结果
for (const result of results) {
  console.log(`Section: ${result.converged ? "✓" : "✗"}`);
  console.log(`Diff: ${result.diffPercent * 100}%`);
  console.log(`Fixes: ${result.appliedFixes.join(", ")}`);
}
```

## 限制与未来改进

### 当前限制

1. **颜色修复**：当前只能检测颜色差异，无法自动修复
2. **复杂布局**：嵌套复杂的布局可能需要多次迭代
3. **动画效果**：暂不支持动画效果的优化
4. **响应式**：暂不支持多尺寸响应式优化

### 未来改进方向

1. **智能颜色修复**
   - 从设计稿中提取颜色
   - 自动应用到DSL

2. **机器学习辅助**
   - 训练模型预测最佳修复策略
   - 减少迭代次数

3. **可视化工具**
   - 差异热力图
   - 修复过程可视化

4. **并行优化**
   - 多Section并行处理
   - 提升整体性能

5. **增量优化**
   - 只优化变化的部分
   - 支持实时预览

## 总结

本系统实现了一个完全自动化、通用化、可扩展的DSL到HTML优化流程。通过截图对比、差异分析、策略生成、迭代优化的闭环，能够在无人工干预的情况下，将生成的HTML逐步优化到接近像素级还原的程度。

系统的核心优势：
- ✅ 完全自动化，无需人工干预
- ✅ 通用化设计，支持任意DSL
- ✅ 拒绝硬编码，基于规则和启发式
- ✅ 可扩展架构，易于添加新功能
- ✅ 闭环优化，持续改进直到收敛
