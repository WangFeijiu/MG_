/**
 * MasterGo DSL 编辑器 - Content Script
 * 右键菜单直接在页面上编辑 DSL 元素
 */

let selectedElement = null;
let pendingPatches = [];
let currentLang = "en";
let styleInfoPanel = null;

const i18n = {
  en: {
    Radius: "Radius",
    Move: "Move",
    Padding: "Padding",
    "Size / Gap": "Size / Gap",
    Typography: "Typography",
    Overflow: "Overflow",
    "All children": "All children",
    Step: "Step",
    Link: "Link",
    Apply: "Apply",
    Reset: "Reset",
    MoveReset: "R",
    W: "W",
    H: "H",
    Gap: "Gap",
    Size: "Size",
    Weight: "Weight",
    Color: "Color",
    BgColor: "Bg",
    T: "T",
    B: "B",
    L: "L",
    R: "R",
    "Save Patch": "Save",
    "Export JSON": "Confirm & Rebuild",
    "Open Result": "Open Result",
    NoChanges: "No changes",
    Saved: "Saved",
    Exported: "Rebuilt",
    Export: "EN",
    CN: "CN",
    Info: "Info",
    ServerError: "Server error",
    ServerOffline: "Server offline",
    // Info panel labels
    r: "r", p: "p", w: "w", h: "h", gap: "gap",
    fs: "fs", fw: "fw", c: "c", bg: "bg",
  },
  zh: {
    Radius: "圆角",
    Move: "移动",
    Padding: "内边距",
    "Size / Gap": "尺寸 / 间距",
    Typography: "文字",
    Overflow: "裁剪",
    "All children": "包含子节点",
    Step: "步长",
    Link: "联动",
    Apply: "应用",
    Reset: "重置",
    MoveReset: "重",
    W: "宽",
    H: "高",
    Gap: "间距",
    Size: "字号",
    Weight: "字重",
    Color: "颜色",
    BgColor: "背景",
    T: "上",
    B: "下",
    L: "左",
    R: "右",
    "Save Patch": "保存",
    "Export JSON": "确认更新",
    "Open Result": "打开结果",
    NoChanges: "无改动",
    Saved: "已保存",
    Exported: "已重建",
    Export: "英",
    CN: "中",
    Info: "信息",
    ServerError: "服务器错误",
    ServerOffline: "服务未启动",
    // Info panel labels
    r: "圆", p: "边", w: "宽", h: "高", gap: "间",
    fs: "字", fw: "重", c: "色", bg: "背",
  },
};

function t(key) {
  return i18n[currentLang][key] || key;
}

init();

function init() {
  // 启动时从 storage 读取语言设置
  chrome.storage.local.get("lang", (result) => {
    if (result.lang) currentLang = result.lang;
  });

  // 监听 storage 变化，popup 切换语言时同步更新所有打开的面板
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.lang) {
      currentLang = changes.lang.newValue;
      // 同步更新信息浮层
      if (styleInfoPanel) {
        applyI18nToPanel(styleInfoPanel);
      }
      // 同步更新右键菜单
      document.querySelectorAll(".dsl-editor-menu").forEach(menu => {
        menu.querySelectorAll(".dsl-i18n, .dsl-i18n-text").forEach(el => {
          const key = el.dataset.key;
          if (key) el.textContent = t(key);
        });
      });
    }
  });

  document.addEventListener("contextmenu", handleContextMenu, true);
  document.addEventListener("click", handleLeftClick, true);
  document.addEventListener("keydown", handleKeyDown, true);
}

// 应用 i18n 到面板
function applyI18nToPanel(panel) {
  panel.querySelectorAll(".dsl-i18n, .dsl-i18n-text").forEach(el => {
    const key = el.dataset.key;
    if (key) el.textContent = t(key);
  });
}

// ============ 选中元素 ============

function handleLeftClick(e) {
  if (e.target.closest(".dsl-editor-menu")) return;
  closeAllMenus();

  const dslNode = e.target.closest("[data-dsl-id]");
  if (!dslNode) {
    closeStyleInfoPanel();
    return;
  }

  // 同一个元素重复点击不重复显示
  if (selectedElement === dslNode && styleInfoPanel) return;

  closeStyleInfoPanel();

  if (selectedElement) selectedElement.classList.remove("dsl-selected");
  selectedElement = dslNode;
  selectedElement.classList.add("dsl-selected");

  showStyleInfoPanel(e.pageX, e.pageY, dslNode);
}

function handleContextMenu(e) {
  const target = e.target;
  const dslNode = target.closest("[data-dsl-id]");
  if (!dslNode) return;

  e.preventDefault();
  e.stopPropagation();

  closeStyleInfoPanel();

  if (selectedElement) selectedElement.classList.remove("dsl-selected");

  selectedElement = dslNode;
  selectedElement.classList.add("dsl-selected");

  showContextMenu(e.pageX, e.pageY, dslNode);
}

function handleKeyDown(e) {
  if (e.key === "Escape") closeAllMenus();
}

// ============ 右键菜单 ============

function showContextMenu(x, y, element) {
  closeAllMenus();

  const menu = document.createElement("div");
  menu.className = "dsl-editor-menu";

  const nodeId = element.dataset.dslId;
  let nodeName = element.dataset.dslName || nodeId;
  if (nodeName.length > 18) nodeName = nodeName.slice(0, 18) + "…";
  const cs = getComputedStyle(element);
  const bgColor = getOwnBackgroundColor(element);

  // 头部信息
  menu.innerHTML = `
    <div class="dsl-menu-header">
      <span class="dsl-header-name">${nodeName}</span>
    </div>

    <!-- 圆角 - 默认展开 -->
    <div class="dsl-menu-section" data-section="radius">
      <div class="dsl-section-toggle" data-target="radius">
        <span class="dsl-section-arrow"></span><span class="dsl-i18n" data-key="Radius">${t("Radius")}</span>
      </div>
      <div class="dsl-section-body">
        <div class="dsl-menu-row">
          <input type="range" class="dsl-radius-slider" min="0" max="64" value="${getCurrentRadius(element)}" />
          <span class="dsl-radius-value">${getCurrentRadius(element)}px</span>
        </div>
        <div class="dsl-menu-presets">
          <button data-r="0">0</button>
          <button data-r="4">4</button>
          <button data-r="8">8</button>
          <button data-r="16">16</button>
          <button data-r="9999">Full</button>
        </div>
      </div>
    </div>

    <!-- 移动 - 默认展开 -->
    <div class="dsl-menu-section" data-section="move">
      <div class="dsl-section-toggle" data-target="move">
        <span class="dsl-section-arrow"></span><span class="dsl-i18n" data-key="Move">${t("Move")}</span>
      </div>
      <div class="dsl-section-body">
        <div class="dsl-move-row">
          <label class="dsl-link-toggle"><input type="checkbox" class="dsl-move-all-check" /><span class="dsl-i18n" data-key="All children">${t("All children")}</span></label>
          <label><span class="dsl-i18n" data-key="Step">${t("Step")}</span> <input type="number" class="dsl-input dsl-move-step" value="10" min="1" style="width:50px" /></label>
        </div>
        <div class="dsl-move-pad">
          <button class="dsl-dir-btn" data-dir="up" title="Move Up">&#9650;</button>
          <div class="dsl-move-lr">
            <button class="dsl-dir-btn" data-dir="left" title="Move Left">&#9664;</button>
            <button class="dsl-dir-btn dsl-dir-center" data-dir="reset" title="Reset"><span class="dsl-i18n" data-key="MoveReset">${t("MoveReset")}</span></button>
            <button class="dsl-dir-btn" data-dir="right" title="Move Right">&#9654;</button>
          </div>
          <button class="dsl-dir-btn" data-dir="down" title="Move Down">&#9660;</button>
        </div>
      </div>
    </div>

    <!-- Padding - 默认折叠 -->
    <div class="dsl-menu-section" data-section="padding">
      <div class="dsl-section-toggle" data-target="padding">
        <span class="dsl-section-arrow"></span><span class="dsl-i18n" data-key="Padding">${t("Padding")}</span>
      </div>
      <div class="dsl-section-body">
        <div class="dsl-padding-toolbar">
          <label class="dsl-link-toggle"><input type="checkbox" class="dsl-pad-link" checked /><span class="dsl-i18n" data-key="Link">${t("Link")}</span></label>
          <input type="number" class="dsl-input dsl-pad-all" placeholder="All" min="0" />
          <button class="dsl-pad-apply dsl-i18n-text" data-key="Apply">${t("Apply")}</button>
          <button class="dsl-pad-reset dsl-i18n-text" data-key="Reset">${t("Reset")}</button>
        </div>
        <div class="dsl-padding-grid">
          <div></div>
          <label><span class="dsl-i18n" data-key="T">${t("T")}</span> <input type="number" class="dsl-input dsl-pt" value="${Math.round(parseFloat(cs.paddingTop) || 0)}" min="0" /></label>
          <div></div>
          <label><span class="dsl-i18n" data-key="L">${t("L")}</span> <input type="number" class="dsl-input dsl-pl" value="${Math.round(parseFloat(cs.paddingLeft) || 0)}" min="0" /></label>
          <div class="dsl-padding-center">
            <svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" rx="2" fill="none" stroke="#6b7280" stroke-width="1.5"/></svg>
          </div>
          <label><span class="dsl-i18n" data-key="R">${t("R")}</span> <input type="number" class="dsl-input dsl-pr" value="${Math.round(parseFloat(cs.paddingRight) || 0)}" min="0" /></label>
          <div></div>
          <label><span class="dsl-i18n" data-key="B">${t("B")}</span> <input type="number" class="dsl-input dsl-pb" value="${Math.round(parseFloat(cs.paddingBottom) || 0)}" min="0" /></label>
          <div></div>
        </div>
      </div>
    </div>

    <!-- 尺寸+间距 - 合并为一个区 -->
    <div class="dsl-menu-section" data-section="size">
      <div class="dsl-section-toggle" data-target="size">
        <span class="dsl-section-arrow"></span><span class="dsl-i18n" data-key="Size / Gap">${t("Size / Gap")}</span>
      </div>
      <div class="dsl-section-body">
        <div class="dsl-menu-row">
          <label><span class="dsl-i18n" data-key="W">${t("W")}</span> <input type="number" class="dsl-input dsl-w" value="${Math.round(parseFloat(cs.width))}" /></label>
          <label><span class="dsl-i18n" data-key="H">${t("H")}</span> <input type="number" class="dsl-input dsl-h" value="${Math.round(parseFloat(cs.height))}" /></label>
        </div>
        <div class="dsl-menu-row">
          <label><span class="dsl-i18n" data-key="Gap">${t("Gap")}</span> <input type="number" class="dsl-input dsl-gap" value="${Math.round(parseFloat(cs.gap) || 0)}" min="0" /></label>
        </div>
      </div>
    </div>

    <!-- 文字 - 默认折叠 -->
    <div class="dsl-menu-section" data-section="typo">
      <div class="dsl-section-toggle" data-target="typo">
        <span class="dsl-section-arrow"></span><span class="dsl-i18n" data-key="Typography">${t("Typography")}</span>
      </div>
      <div class="dsl-section-body">
        <div class="dsl-menu-row">
          <label><span class="dsl-i18n" data-key="Size">${t("Size")}</span> <input type="number" class="dsl-input dsl-fontsize" value="${Math.round(parseFloat(cs.fontSize) || 16)}" min="1" /></label>
          <label><span class="dsl-i18n" data-key="Weight">${t("Weight")}</span>
            <select class="dsl-select dsl-fontweight">
              <option value="400" ${cs.fontWeight === "400" ? "selected" : ""}>400</option>
              <option value="500" ${cs.fontWeight === "500" ? "selected" : ""}>500</option>
              <option value="600" ${cs.fontWeight === "600" ? "selected" : ""}>600</option>
              <option value="700" ${cs.fontWeight === "700" ? "selected" : ""}>700</option>
            </select>
          </label>
        </div>
        <div class="dsl-menu-row">
          <label><span class="dsl-i18n" data-key="Color">${t("Color")}</span> <input type="color" class="dsl-color-picker dsl-text-color" value="${rgbToHex(cs.color)}" /></label>
          <label class="dsl-color-hex dsl-text-color-hex">${rgbToHex(cs.color)}</label>
        </div>
        <div class="dsl-menu-row">
          <label><span class="dsl-i18n" data-key="BgColor">${t("BgColor")}</span> <input type="color" class="dsl-color-picker dsl-bg-color" value="${bgColor.isTransparent ? "#ffffff" : bgColor.hex}" /></label>
          <label class="dsl-color-hex dsl-bg-color-hex">${bgColor.raw}</label>
        </div>
      </div>
    </div>

    <!-- 裁剪 - 默认折叠 -->
    <div class="dsl-menu-section" data-section="clip">
      <div class="dsl-section-toggle" data-target="clip">
        <span class="dsl-section-arrow"></span><span class="dsl-i18n" data-key="Overflow">${t("Overflow")}</span>
      </div>
      <div class="dsl-section-body">
        <div class="dsl-menu-row">
          <label>overflow</label>
          <select class="dsl-select dsl-overflow">
            <option value="visible" ${cs.overflow === "visible" ? "selected" : ""}>visible</option>
            <option value="hidden" ${cs.overflow === "hidden" ? "selected" : ""}>hidden</option>
          </select>
        </div>
        <div class="dsl-menu-row">
          <label>object-fit</label>
          <select class="dsl-select dsl-objectfit">
            <option value="cover" ${cs.objectFit === "cover" ? "selected" : ""}>cover</option>
            <option value="contain" ${cs.objectFit === "contain" ? "selected" : ""}>contain</option>
            <option value="fill" ${cs.objectFit === "fill" ? "selected" : ""}>fill</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="dsl-menu-actions">
      <button class="dsl-btn dsl-btn-save"><span class="dsl-i18n-text" data-key="Save Patch">${t("Save Patch")}</span> (${pendingPatches.length})</button>
      <button class="dsl-btn dsl-btn-export dsl-i18n-text" data-key="Export JSON">${t("Export JSON")}</button>
    </div>
  `;

  document.body.appendChild(menu);

  // ============ 折叠逻辑 ============
  // 默认展开 radius 和 size，其余折叠
  const openSections = new Set([]);
  menu.querySelectorAll(".dsl-section-toggle").forEach(toggle => {
    const target = toggle.dataset.target;
    const section = menu.querySelector(`[data-section="${target}"]`);
    const body = section.querySelector(".dsl-section-body");
    const arrow = toggle.querySelector(".dsl-section-arrow");

    if (!openSections.has(target)) {
      body.style.display = "none";
      arrow.classList.add("collapsed");
    }

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = body.style.display !== "none";
      body.style.display = isOpen ? "none" : "";
      arrow.classList.toggle("collapsed", isOpen);
    });
  });

  // ============ 定位 ============
  // 延迟一帧让 DOM 渲染完再计算高度
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    const menuW = rect.width;
    const menuH = rect.height;
    const vw = window.innerWidth;
    const vy = window.innerHeight;
    let left = x;
    let top = y;
    if (left + menuW > vw + window.scrollX) left = left - menuW;
    if (top + menuH > vy + window.scrollY) top = top - menuH;
    if (left < 0) left = 4;
    if (top < 0) top = 4;
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  });

  // ============ 绑定事件 ============

  // 圆角滑块
  const slider = menu.querySelector(".dsl-radius-slider");
  const radiusVal = menu.querySelector(".dsl-radius-value");
  slider.addEventListener("input", () => {
    const v = parseInt(slider.value);
    radiusVal.textContent = v >= 9999 ? "Full" : v + "px";
    element.style.borderRadius = v + "px";
    element.style.overflow = "hidden";
    addPatch(nodeId, "update_style", {
      borderRadius: { linked: true, topLeft: v, topRight: v, bottomRight: v, bottomLeft: v },
      overflow: "hidden",
    });
  });

  // 圆角预设
  menu.querySelectorAll("[data-r]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const v = parseInt(btn.dataset.r);
      slider.value = v;
      radiusVal.textContent = v >= 9999 ? "Full" : v + "px";
      element.style.borderRadius = v + "px";
      element.style.overflow = "hidden";
      addPatch(nodeId, "update_style", {
        borderRadius: { linked: true, topLeft: v, topRight: v, bottomRight: v, bottomLeft: v },
        overflow: "hidden",
      });
    });
  });

  // Padding - 单独修改
  const ptInput = menu.querySelector(".dsl-pt");
  const prInput = menu.querySelector(".dsl-pr");
  const pbInput = menu.querySelector(".dsl-pb");
  const plInput = menu.querySelector(".dsl-pl");

  const applyPadding = () => {
    const pt = parseFloat(ptInput.value) || 0;
    const pr = parseFloat(prInput.value) || 0;
    const pb = parseFloat(pbInput.value) || 0;
    const pl = parseFloat(plInput.value) || 0;
    element.style.padding = `${pt}px ${pr}px ${pb}px ${pl}px`;
    addPatch(nodeId, "update_style", {
      padding: { top: pt, right: pr, bottom: pb, left: pl },
    });
  };
  ptInput.addEventListener("change", applyPadding);
  prInput.addEventListener("change", applyPadding);
  pbInput.addEventListener("change", applyPadding);
  plInput.addEventListener("change", applyPadding);

  // Padding - 全部修改（Link 模式）
  const padLinkCb = menu.querySelector(".dsl-pad-link");
  const padAllInput = menu.querySelector(".dsl-pad-all");
  const padApplyBtn = menu.querySelector(".dsl-pad-apply");
  const padResetBtn = menu.querySelector(".dsl-pad-reset");

  padApplyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const v = parseFloat(padAllInput.value);
    if (isNaN(v) || v < 0) return;
    if (padLinkCb.checked) {
      ptInput.value = v;
      prInput.value = v;
      pbInput.value = v;
      plInput.value = v;
      element.style.padding = `${v}px`;
    } else {
      ptInput.value = v;
      element.style.paddingTop = v + "px";
    }
    applyPadding();
  });

  padResetBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    ptInput.value = 0;
    prInput.value = 0;
    pbInput.value = 0;
    plInput.value = 0;
    element.style.padding = "0px";
    addPatch(nodeId, "update_style", {
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  });

  // ============ 移动 ============
  const moveStepInput = menu.querySelector(".dsl-move-step");
  const moveAllCb = menu.querySelector(".dsl-move-all-check");

  function getTargets() {
    if (moveAllCb.checked) {
      // 移动该元素及其所有子 DSL 节点
      return [element, ...element.querySelectorAll("[data-dsl-id]")];
    }
    return [element];
  }

  function applyMoveDir(dir) {
    const step = parseFloat(moveStepInput.value) || 10;
    const targets = getTargets();

    targets.forEach(el => {
      const elCs = getComputedStyle(el);
      const curT = parseFloat(elCs.marginTop) || 0;
      const curL = parseFloat(elCs.marginLeft) || 0;
      let mt = curT, ml = curL;

      switch (dir) {
        case "up":    mt -= step; break;
        case "down":  mt += step; break;
        case "left":  ml -= step; break;
        case "right": ml += step; break;
        case "reset": mt = 0; ml = 0; break;
      }

      el.style.marginTop = mt + "px";
      el.style.marginLeft = ml + "px";
    });

    // 只给当前元素记 patch
    const finalCs = getComputedStyle(element);
    const dx = parseFloat(finalCs.marginLeft) || 0;
    const dy = parseFloat(finalCs.marginTop) || 0;
    addPatch(nodeId, "update_layout", { x: dx, y: dy });
  }

  menu.querySelectorAll(".dsl-dir-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      applyMoveDir(btn.dataset.dir);
    });
  });

  // 尺寸
  const wInput = menu.querySelector(".dsl-w");
  const hInput = menu.querySelector(".dsl-h");
  const applySize = () => {
    const w = parseFloat(wInput.value);
    const h = parseFloat(hInput.value);
    if (!isNaN(w)) element.style.width = w + "px";
    if (!isNaN(h)) element.style.height = h + "px";
    addPatch(nodeId, "update_layout", {
      width: isNaN(w) ? undefined : w,
      height: isNaN(h) ? undefined : h,
    });
  };
  wInput.addEventListener("change", applySize);
  hInput.addEventListener("change", applySize);

  // Gap
  const gapInput = menu.querySelector(".dsl-gap");
  gapInput.addEventListener("change", () => {
    const g = parseFloat(gapInput.value);
    if (!isNaN(g)) {
      element.style.gap = g + "px";
      addPatch(nodeId, "update_layout", { gap: g });
    }
  });

  // Font Size
  const fontSizeInput = menu.querySelector(".dsl-fontsize");
  fontSizeInput.addEventListener("change", () => {
    const v = parseFloat(fontSizeInput.value);
    if (!isNaN(v) && v > 0) {
      element.style.fontSize = v + "px";
      addPatch(nodeId, "update_style", { fontSize: v });
    }
  });

  // Font Weight
  const fontWeightSel = menu.querySelector(".dsl-fontweight");
  fontWeightSel.addEventListener("change", () => {
    const v = parseInt(fontWeightSel.value);
    element.style.fontWeight = v;
    addPatch(nodeId, "update_style", { fontWeight: v });
  });

  // Text Color
  const colorPicker = menu.querySelector(".dsl-text-color");
  const colorHex = menu.querySelector(".dsl-text-color-hex");
  colorPicker.addEventListener("input", () => {
    const hex = colorPicker.value;
    element.style.color = hex;
    colorHex.textContent = hex;
    addPatch(nodeId, "update_style", { color: hex });
  });

  // Background Color
  const bgPicker = menu.querySelector(".dsl-bg-color");
  const bgHex = menu.querySelector(".dsl-bg-color-hex");
  bgPicker.addEventListener("input", () => {
    const hex = bgPicker.value;
    element.style.backgroundColor = hex;
    bgHex.textContent = hex;
    addPatch(nodeId, "update_style", { backgroundColor: hex });
  });

  // Overflow
  const overflowSel = menu.querySelector(".dsl-overflow");
  overflowSel.addEventListener("change", () => {
    element.style.overflow = overflowSel.value;
    addPatch(nodeId, "update_style", { overflow: overflowSel.value });
  });

  // Object-fit
  const objFitSel = menu.querySelector(".dsl-objectfit");
  objFitSel.addEventListener("change", () => {
    const img = element.querySelector("img");
    if (img) img.style.objectFit = objFitSel.value;
    addPatch(nodeId, "update_style", { objectFit: objFitSel.value });
  });

  // 保存 Patch（下载到 output/patches/ 目录）
  const saveBtn = menu.querySelector(".dsl-btn-save");
  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (pendingPatches.length === 0) {
      showToast(t("NoChanges"));
      return;
    }

    // 每个 patch 保存为一个文件（UUID 命名避免并发冲突）
    pendingPatches.forEach((patch) => {
      const uuid = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
      const filename = `${uuid}.json`;
      const blob = new Blob([JSON.stringify(patch, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });

    showToast(`${t("Saved")} ${pendingPatches.length}`);
    pendingPatches = [];
    saveBtn.innerHTML = `<span class="dsl-i18n-text" data-key="Save Patch">${t("Save Patch")}</span> (0)`;
  });

  // 确认更新 & 重建
  const exportBtn = menu.querySelector(".dsl-btn-export");
  exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    exportBtn.textContent = "...";
    exportBtn.disabled = true;

    fetch("http://localhost:3456/rebuild?cleanup=false", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          showToast(`${t("Exported")} ${data.mergedCount} ✅`);

          // 询问是否打开
          setTimeout(() => {
            const open = confirm(currentLang === "zh" ? "是否在浏览器打开更新后的页面？" : "Open updated page in browser?");
            if (open) {
              window.open("preview-final.html", "_blank");
            }
          }, 300);
        } else {
          showToast(t("ServerError") + ": " + (data.error || ""));
        }
      })
      .catch(() => {
        showToast(t("ServerOffline") + " (npm run server)");
      })
      .finally(() => {
        exportBtn.innerHTML = `<span class="dsl-i18n-text" data-key="Export JSON">${t("Export JSON")}</span>`;
        exportBtn.disabled = false;
      });
  });

  // 阻止菜单内的事件冒泡
  menu.addEventListener("contextmenu", e => e.preventDefault());
  menu.addEventListener("click", e => e.stopPropagation());
}

function closeAllMenus() {
  document.querySelectorAll(".dsl-editor-menu").forEach(m => m.remove());
}

function closeStyleInfoPanel() {
  if (styleInfoPanel) {
    styleInfoPanel.remove();
    styleInfoPanel = null;
  }
}

function showStyleInfoPanel(x, y, element) {
  closeStyleInfoPanel();

  const cs = getComputedStyle(element);
  const nodeName = element.dataset.dslName || element.dataset.dslId;

  const r = Math.round(parseFloat(cs.borderRadius) || 0);
  const w = Math.round(parseFloat(cs.width) || 0);
  const h = Math.round(parseFloat(cs.height) || 0);
  const gap = Math.round(parseFloat(cs.gap) || 0);
  const pt = Math.round(parseFloat(cs.paddingTop) || 0);
  const pr = Math.round(parseFloat(cs.paddingRight) || 0);
  const pb = Math.round(parseFloat(cs.paddingBottom) || 0);
  const pl = Math.round(parseFloat(cs.paddingLeft) || 0);
  const fs = Math.round(parseFloat(cs.fontSize) || 0);
  const color = rgbToHex(cs.color);
  const bgColor = getOwnBackgroundColor(element);
  const bgDisplayVal = bgColor.isTransparent ? "-" : bgColor.raw;
  const fw = cs.fontWeight;
  const type = element.dataset.dslType;

  const panel = document.createElement("div");
  panel.className = "dsl-style-info";

  const nodeNameDisplay = nodeName.length > 16 ? nodeName.slice(0, 16) + "…" : nodeName;

  let typeTag = "";
  if (type === "text") typeTag = `<span class="dsl-info-tag dsl-info-type">TEXT</span>`;
  else if (type === "image") typeTag = `<span class="dsl-info-tag dsl-info-type">IMG</span>`;
  else if (type === "container") typeTag = `<span class="dsl-info-tag dsl-info-type">${type.toUpperCase()}</span>`;

  // Row 1 (结构): r | p | w | h | gap — 所有类型
  const row1 = `
    <div class="dsl-info-row dsl-info-row-structure">
      <span class="dsl-info-item" data-open="radius"><span class="dsl-info-label dsl-i18n" data-key="r">${t("r")}</span><span class="dsl-info-val">${r}</span></span>
      <span class="dsl-info-item" data-open="padding"><span class="dsl-info-label dsl-i18n" data-key="p">${t("p")}</span><span class="dsl-info-val">${pt || pr || pb || pl ? `${pt} ${pr} ${pb} ${pl}` : "0"}</span></span>
      <span class="dsl-info-item" data-open="size"><span class="dsl-info-label dsl-i18n" data-key="w">${t("w")}</span><span class="dsl-info-val">${w || "auto"}</span></span>
      <span class="dsl-info-item" data-open="size"><span class="dsl-info-label dsl-i18n" data-key="h">${t("h")}</span><span class="dsl-info-val">${h || "auto"}</span></span>
      <span class="dsl-info-item" data-open="size"><span class="dsl-info-label dsl-i18n" data-key="gap">${t("gap")}</span><span class="dsl-info-val">${gap}</span></span>
    </div>
  `;

  // Row 2 (文字): fs | fw — 仅 text 类型
  const row2 = type === "text" ? `
    <div class="dsl-info-row dsl-info-row-typo">
      <span class="dsl-info-item" data-open="typo"><span class="dsl-info-label dsl-i18n" data-key="fs">${t("fs")}</span><span class="dsl-info-val">${fs}</span></span>
      <span class="dsl-info-item" data-open="typo"><span class="dsl-info-label dsl-i18n" data-key="fw">${t("fw")}</span><span class="dsl-info-val">${fw}</span></span>
    </div>
  ` : "";

  // Row 3 (颜色): c | bg — 所有类型
  const row3 = `
    <div class="dsl-info-row dsl-info-row-color">
      <span class="dsl-info-item dsl-info-color" data-open="typo"><span class="dsl-info-label dsl-i18n" data-key="c">${t("c")}</span><span class="dsl-info-swatch${color === "transparent" ? "" : " dsl-swatch-solid"}"${color !== "transparent" ? ` style="--swatch-color:${color}"` : ""}></span><span class="dsl-info-val" style="color:${color === "transparent" ? "#6b7280" : "#9ca3af"}">${color === "transparent" ? "-" : color}</span></span>
      <span class="dsl-info-item dsl-info-color" data-open="typo"><span class="dsl-info-label dsl-i18n" data-key="bg">${t("bg")}</span><span class="dsl-info-swatch${bgColor.isTransparent ? "" : " dsl-swatch-solid"}"${!bgColor.isTransparent ? ` style="--swatch-color:${bgColor.hex}"` : ""}></span><span class="dsl-info-val" style="color:${bgColor.isTransparent ? "#6b7280" : "#9ca3af"}">${bgDisplayVal}</span></span>
    </div>
  `;

  panel.innerHTML = `
    <div class="dsl-info-header">
      <span class="dsl-info-name" title="${nodeName}">${nodeNameDisplay}</span>
      ${typeTag}
    </div>
    ${row1}
    ${row2}
    ${row3}
  `;

  document.body.appendChild(panel);
  styleInfoPanel = panel;

  // 点击任意值 → 打开编辑面板并定位到对应分区
  panel.querySelectorAll("[data-open]").forEach(item => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const sectionKey = item.dataset.open;
      closeStyleInfoPanel();

      // 用当前选中的元素打开/更新编辑面板
      const targetEl = selectedElement;
      let menuEl = document.querySelector(".dsl-editor-menu");
      if (!menuEl) {
        const rect = targetEl.getBoundingClientRect();
        showContextMenu(rect.left + rect.width / 2, rect.top + rect.height / 2, targetEl);
        menuEl = document.querySelector(".dsl-editor-menu");
      }

      if (!menuEl) return;
      const section = menuEl.querySelector(`[data-section="${sectionKey}"]`);
      if (!section) return;
      const body = section.querySelector(".dsl-section-body");
      const arrow = section.querySelector(".dsl-section-arrow");
      // 展开
      body.style.display = "";
      if (arrow) arrow.classList.remove("collapsed");
      // 滚动到该分区
      section.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });

  // 定位
  requestAnimationFrame(() => {
    const rect = panel.getBoundingClientRect();
    const pw = rect.width, ph = rect.height;
    const vw = window.innerWidth, vy = window.innerHeight;
    let left = x + 12;
    let top = y + 12;
    if (left + pw > vw + window.scrollX) left = x - pw - 8;
    if (top + ph > vy + window.scrollY) top = y - ph - 8;
    if (left < 0) left = 4;
    if (top < 0) top = 4;
    panel.style.left = left + "px";
    panel.style.top = top + "px";
  });
}

// ============ Patch 管理 ============

function addPatch(nodeId, op, payload) {
  const existing = pendingPatches.find(p => p.targetNodeId === nodeId && p.op === op);
  if (existing) {
    existing.payload = { ...existing.payload, ...payload };
  } else {
    pendingPatches.push({
      id: `patch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      targetNodeId: nodeId,
      op,
      payload,
    });
  }
  const saveBtn = document.querySelector(".dsl-btn-save");
  if (saveBtn) saveBtn.innerHTML = `<span class="dsl-i18n-text" data-key="Save Patch">${t("Save Patch")}</span> (${pendingPatches.length})`;
}

// ============ 工具函数 ============

function getCurrentRadius(element) {
  const cs = getComputedStyle(element);
  return Math.round(parseFloat(cs.borderRadius) || 0);
}

function rgbToHex(rgb) {
  if (!rgb || rgb === "transparent") return "transparent";
  if (rgb.startsWith("#")) return rgb.length === 4
    ? "#" + rgb[1]+rgb[1]+rgb[2]+rgb[2]+rgb[3]+rgb[3]
    : rgb;
  // rgba 格式，如 rgba(0, 0, 0, 0.04)
  const rgbaM = rgb.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
  if (rgbaM) {
    if (parseFloat(rgbaM[4]) <= 0.01) return "transparent";
    return "#" + [rgbaM[1], rgbaM[2], rgbaM[3]].map(v => parseInt(v).toString(16).padStart(2, "0")).join("");
  }
  // rgb 格式
  const rgbM = rgb.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbM) {
    return "#" + [rgbM[1], rgbM[2], rgbM[3]].map(v => parseInt(v).toString(16).padStart(2, "0")).join("");
  }
  return "#000000";
}

/**
 * 获取元素自身的背景色，返回 { raw, hex, isTransparent }
 * raw: 原始值 rgba(...) / #hex / transparent
 * hex: 标准 hex 或 transparent
 * isTransparent: 是否视为透明（alpha < 0.1 或值本身为 transparent）
 */
function getOwnBackgroundColor(element) {
  const cs = getComputedStyle(element);
  const styleAttr = element.getAttribute("style") || "";

  let bgStyle = "";

  // 1. 提取 background: rgba(...) / #hex / ...（到第一个分号停止）
  const bgMatch = styleAttr.match(/background\s*:\s*([^;]*)/i);
  if (bgMatch) bgStyle = bgMatch[1].trim();

  // 2. 提取 background-color:
  if (!bgStyle) {
    const bgColorMatch = styleAttr.match(/background-color\s*:\s*([^;]*)/i);
    if (bgColorMatch) bgStyle = bgColorMatch[1].trim();
  }

  if (bgStyle) {
    const hex = rgbToHex(bgStyle);
    const alphaMatch = bgStyle.match(/,\s*([\d.]+)\s*\)$/);
    const alpha = alphaMatch ? parseFloat(alphaMatch[1]) : 1;
    return {
      raw: bgStyle,
      hex: hex,
      isTransparent: hex === "transparent" || (alphaMatch !== null && alpha < 0.01),
    };
  }

  // 3. computed style fallback
  const computedBg = cs.backgroundColor;
  if (computedBg) {
    const hex = rgbToHex(computedBg);
    const alphaMatch = computedBg.match(/,\s*([\d.]+)\s*\)$/);
    const alpha = alphaMatch ? parseFloat(alphaMatch[1]) : 1;
    return {
      raw: computedBg,
      hex: hex,
      isTransparent: hex === "transparent" || (alphaMatch !== null && alpha < 0.01),
    };
  }

  return { raw: "transparent", hex: "transparent", isTransparent: true };
}

function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "dsl-toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

// ============ 消息通信（保留给 popup 使用） ============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getSelectedElement" && selectedElement) {
    const cs = getComputedStyle(selectedElement);
    sendResponse({
      element: {
        nodeId: selectedElement.dataset.dslId,
        type: selectedElement.dataset.dslType,
        name: selectedElement.dataset.dslName,
        borderRadius: parseBR(cs.borderRadius),
        position: { x: parseFloat(cs.left) || 0, y: parseFloat(cs.top) || 0 },
        size: { width: parseFloat(cs.width) || 0, height: parseFloat(cs.height) || 0 },
        gap: parseFloat(cs.gap) || 0,
        overflow: cs.overflow,
        objectFit: cs.objectFit,
      },
    });
  }
  return true;
});

function parseBR(str) {
  const v = str.split(" ").map(s => parseFloat(s) || 0);
  if (v.length === 1) return { linked: true, topLeft: v[0], topRight: v[0], bottomRight: v[0], bottomLeft: v[0] };
  if (v.length === 4) return { linked: false, topLeft: v[0], topRight: v[1], bottomRight: v[2], bottomLeft: v[3] };
  return { linked: true, topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
}
