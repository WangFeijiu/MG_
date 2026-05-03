# 自动优化引擎使用指南

## 概述

自动优化引擎能够通过截图对比，自动分析并修复生成的HTML与设计稿之间的差异，实现像素级还原。

## 核心功能

1. **自动截图对比**：分段对比生成的HTML与设计稿
2. **智能差异分析**：识别布局、颜色、字体、间距等问题
3. **自动修复策略**：根据差异自动调整Flex布局、占比、间距等
4. **迭代优化**：持续优化直到达到目标阈值
5. **通用化设计**：支持任意DSL，无硬编码

## 使用方法

### 准备工作

1. 确保已经运行过基础流程生成了DSL：
   ```bash
   npm run dev
   ```

2. 将设计稿截图放到 `output` 目录，命名为 `design-baseline.png`

### 运行自动优化

#### 方式一：独立运行优化器

```bash
npm run auto-optimize
```

这会读取现有的DSL，进行自动优化，并保存优化后的结果。

#### 方式二：集成流程（推荐）

```bash
npm run dev:auto:rebuild
```

这会：
1. 读取现有DSL
2. 生成初始HTML
3. 自动优化迭代
4. 保存最终结果

### 输出文件

- `output/preview-optimized.html` - 优化后的HTML
- `output/optimized-machine-dsl.json` - 优化后的DSL
- `output/preview.html` - 会被更新为优化后的版本

## 工作原理

### 1. 差异检测

引擎会对每个Section进行截图对比，检测：

- **布局问题**：宽度、高度、位置、对齐方式、Flex方向
- **颜色问题**：背景色、文字颜色、边框颜色
- **字体问题**：字号、字重、行高、字间距
- **间距问题**：margin、padding、gap

### 2. 修复策略生成

根据检测到的问题，自动生成修复策略：

```typescript
// 示例：检测到子元素应该水平排列
{
  type: "update-style",
  description: "调整布局方向为 row",
  payload: { flexDirection: "row" }
}

// 示例：统一子元素间距
{
  type: "update-style",
  description: "统一子元素间距为 24px",
  payload: { gap: "24px" }
}
```

### 3. 迭代优化

每次迭代：
1. 应用修复策略到DSL
2. 重新生成HTML
3. 截图对比
4. 计算新的差异
5. 如果差异低于阈值，收敛；否则继续

### 4. 收敛条件

- 差异百分比 < 2%（可配置）
- 或达到最大迭代次数（默认10次）

## 配置选项

在代码中可以调整优化器参数：

```typescript
const optimizer = new AutoOptimizer({
  maxIterations: 10,           // 最大迭代次数
  targetDiffThreshold: 0.02,   // 目标差异阈值（2%）
  outputDir: "output",         // 输出目录
});
```

## 示例输出

```
🚀 自动优化引擎启动

📖 读取 DSL 文件...
✓ 已加载原始 DSL 数据
✓ 已分割 12 个 Section

[AutoOptimizer] 开始自动优化 — 12 个 Section
[AutoOptimizer] 目标差异阈值: 2.0%
[AutoOptimizer] 最大迭代次数: 10

[AutoOptimizer] Section 1/12: Navbar
  [Iteration 1/10]
    Diff: 5.23%
    应用修复: 调整布局方向为 row
  [Iteration 2/10]
    Diff: 1.87%
  ✓ 已收敛 (diff: 1.87%)

[AutoOptimizer] Section 2/12: Hero Section
  [Iteration 1/10]
    Diff: 3.45%
    应用修复: 统一子元素间距为 32px
  [Iteration 2/10]
    Diff: 1.92%
  ✓ 已收敛 (diff: 1.92%)

...

============================================================
优化结果汇总
============================================================

[Section 1] Navbar
  状态: ✓ 已收敛
  迭代次数: 2
  最终差异: 1.87%
  应用修复: 1 个
  修复列表:
    - 调整布局方向为 row

[Section 2] Hero Section
  状态: ✓ 已收敛
  迭代次数: 2
  最终差异: 1.92%
  应用修复: 1 个
  修复列表:
    - 统一子元素间距为 32px

...

============================================================
总计: 11/12 个 Section 已收敛
平均迭代次数: 2.3
============================================================

✓ 优化后的 DSL 已保存: output/optimized-machine-dsl.json

🎉 自动优化完成！
```

## 注意事项

1. **设计稿质量**：确保 `design-baseline.png` 是高质量的截图，尺寸与DSL中的页面宽度一致

2. **迭代次数**：如果某个Section一直无法收敛，可能需要手动调整DSL或增加迭代次数

3. **性能**：每次迭代都需要重新生成HTML和截图，对于复杂页面可能需要较长时间

4. **通用性**：引擎设计为通用化，可以处理任意DSL，不依赖特定的设计稿结构

## 扩展开发

### 添加新的差异检测

在 `AutoOptimizer` 类中添加新的检测方法：

```typescript
private detectNewIssue(
  baseline: PNG,
  screenshot: PNG,
  sectionRoot: DSLNode,
  nodeMap: Map<string, DSLNode>,
): NewIssue[] {
  // 实现检测逻辑
}
```

### 添加新的修复策略

在 `generateFixes` 方法中添加新的修复逻辑：

```typescript
// 新问题类型的修复
for (const issue of analysis.newIssues) {
  fixes.push({
    type: "update-something",
    description: "修复描述",
    payload: { /* 修复数据 */ },
  });
}
```

## 故障排查

### 问题：Puppeteer 启动失败

**解决方案**：
```bash
# 重新安装 Puppeteer
npm install puppeteer --force
```

### 问题：截图尺寸不匹配

**解决方案**：
- 检查 `design-baseline.png` 的宽度是否与DSL中的 `page.width` 一致
- 调整设计稿截图尺寸

### 问题：优化效果不明显

**解决方案**：
- 增加 `maxIterations`
- 降低 `targetDiffThreshold`
- 检查是否有颜色问题（当前版本颜色修复较简单）

## 未来改进

- [ ] 更智能的颜色修复
- [ ] 支持响应式布局优化
- [ ] 支持动画效果优化
- [ ] 并行优化多个Section
- [ ] 可视化差异热力图
- [ ] 机器学习辅助修复策略选择
