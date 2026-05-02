# 模板系统渲染不准确的原因分析

## 问题概述

你的 DSL（包材详情页面）被模板系统渲染得非常不准确，主要原因是：

1. **Section 切分不合理** - 将一个完整的产品详情页切分成了 10 个独立的 section
2. **Section 分类错误** - 很多 section 被错误地分类为 `content`、`cards` 等通用类型
3. **缺少产品详情页模板** - 模板系统没有针对产品详情页的专用模板

## 详细分析

### 1. Section 切分问题

**原始设计稿结构：**
```
包材详情页面 (1540x2977)
├── Header (Navbar)
├── Breadcrumb (home > formula)
├── 产品标题 (YF179-100ml)
├── 标签组 (100ml, Glass, PP)
├── 价格区 ($8.30)
├── MOQ (1000 pcs)
├── 产品图片 (大图 + 3D 按钮)
├── 适用品类
├── 按钮组 (Start Your Project, Get Sample)
├── Tab 导航 (包材详细 / 货期)
├── 产品案例 (4 个产品卡片)
├── 主要成分/泵头 (2 个图片区块)
└── 相似推荐 (6 个产品缩略图)
```

**实际切分结果：**
```
0. Rhinobird (navbar) - ✅ 正确
1. Glass (cards) - ❌ 错误：这是标签组，不是 cards
2. 包材详细 (content) - ❌ 错误：这是 Tab 导航
3. Start Your Project (content) - ❌ 错误：这是按钮组
4. 矩形 481 (content) - ❌ 错误：这是产品图片背景
5. image (content) - ❌ 错误：这是产品图片
6. 窄口瓶 (content) - ❌ 错误：这是成分区块
7. 组 1091 (content) - ❌ 错误：这是泵头区块
8. 产品案例 (features) - ⚠️ 部分正确：应该是 product-cards
9. 相似��荐 (content) - ❌ 错误：应该是 product-grid
```

### 2. 为什么切分不合理？

**Section Splitter 的逻辑：**
- 从页面根节点向下穿透，找到有 ≥2 个子节点的层级
- 每个直系子节点作为一个 section 候选
- 过大的节点（height > 1200px）会被递归拆分

**问题：**
你的 DSL 根节点有 **18 个直系子节点**，每个都被当作独立的 section：

```javascript
"children": [
  "26:05810",  // Header
  "26:03770",  // Breadcrumb
  "26:03774",  // 标题
  "26:03796",  // 标签组
  "26:03869",  // Tab 导航
  "26:03926",  // 按钮组
  "26:03939",  // 价格
  "26:03948",  // MOQ
  "26:03958",  // 产品图片背景
  "26:04130",  // 产品图片
  "26:04226",  // 3D 按钮
  "26:12425",  // 适用品类
  "26:12952",  // 窄口瓶
  "26:12954",  // 泵头
  "26:15096",  // 产品案例
  "68:00567",  // 相似推荐
  "82:04567",  // ?
  "82:04571"   // ?
]
```

这种扁平的结构导致 section splitter 无法识别出逻辑上的分组。

### 3. Section 分类问题

**分类器的逻辑：**
```typescript
function classifySection(section, analysis) {
  // 1. Navbar: index === 0 && height < 120
  // 2. Footer: index === total - 1
  // 3. CTA: 包含 "start your project" 等关键词
  // 4. Hero: 大标题 + 副标题，无图片
  // 5. Features: guess === "features"
  // 6. Cards: guess === "cards"
  // 7. 其他: content (fallback)
}
```

**问题：**
- **标签组** (100ml, Glass, PP) 被识别为 `cards`，因为它有 3 个相似的子节点
- **按钮组** 被识别为 `content`，因为没有匹配任何模板
- **产品图片** 被拆分成 2 个 section（背景 + 图片），完全破坏了布局
- **Tab 导航** 被识别为 `content`，没有专用的 tab 模板

### 4. 渲染结果问题

**GridRow 模板的问题：**
```html
<section class="product-grid">
  <div class="container">
    <div class="grid-row">
      <!-- 空的，因为没有找到图片和文本 -->
    </div>
    <div class="grid-row reverse">
      <!-- 空的 -->
    </div>
    <div class="grid-row">
      <!-- 空的 -->
    </div>
  </div>
</section>
```

原因：标签组 (Glass) 被分类为 `gridRow`，但它的结构不符合 gridRow 模板的预期（图片 + 文本的行）。

**CTA 模板的问题：**
```html
<section class="cta-banner">
  <div>
    <p class="cta-label">Start Your Project</p>
    <h2 class="cta-title">Get Sample</h2>
    <a href="#" class="btn-cta">PRICE / 1 PCS</a>
  </div>
</section>
```

原因：按钮组被分类为 `cta`，但模板把按钮文本当作了 label、title 和 button，完全错位。

## 根本原因总结

1. **DSL 结构过于扁平** - 18 个直系子节点，缺少逻辑分组
2. **Section Splitter 过于简单** - 只按层级切分，不理解语义
3. **Section 分类器过于粗糙** - 基于简单的启发式规则，容易误判
4. **缺少产品详情页模板** - 没有针对电商产品页的专用模板

## 对比：Kimi 的方法为什么准确？

Kimi 的方法：
```python
def build_node(node):
    # 直接遍历 DSL 树
    # 使用绝对定位 (position: absolute)
    # 精确还原每个节点的位置、尺寸、样式
    return html
```

优点：
- ✅ 100% 像素级精确
- ✅ 不需要理解语义
- ✅ 不需要模板匹配
- ✅ 适用于任何 DSL

缺点：
- ❌ 生成的 HTML 不语义化
- ❌ 不适合生产环境
- ❌ 无法响应式
- ❌ 难以维护和修改

## 解决方案

### 方案 A：改进 Section Splitter（推荐）

**目标：** 让 section splitter 能够识别产品详情页的逻辑分组

**实现：**
1. 添加语义分析 - 识别 header、product-info、product-images、product-details 等区域
2. 基于 Y 坐标分组 - 将垂直位置接近的节点合并为一个 section
3. 基于内容类型分组 - 将相同类型的内容（如多个按钮）合并为一个 section

### 方案 B：添加产品详情页模板

**目标：** 为产品详情页创建专用模板

**实现：**
1. 创建 `renderProductDetail` 模板
2. 识别产品页的特征：价格、MOQ、产品图片、规格标签等
3. 按照电商产品页的标准布局渲染

### 方案 C：混合渲染（最佳）

**目标：** 结合绝对定位和模板系统的优点

**实现：**
1. **预览阶段：** 使用绝对定位方法（100% 还原）
2. **生产阶段：** 使用模板系统（语义化、可维护）
3. **Fallback：** 对于无法匹配模板的 section，使用绝对定位渲染

## 下一步行动

你希望我：

1. **实现方案 A** - 改进 section splitter，让它能更好地理解产品详情页？
2. **实现方案 B** - 添加产品详情页专用模板？
3. **实现方案 C** - 创建混合渲染系统？
4. **其他方案** - 你有更好的想法？

请告诉我你的选择，我会立即开始实现。
