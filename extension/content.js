/**
 * MasterGo DSL 编辑器 - Content Script
 * 右键菜单直接在页面上编辑 DSL 元素
 */

let selectedElement = null;
let pendingPatches = [];

init();

function init() {
  document.addEventListener("contextmenu", handleContextMenu, true);
  document.addEventListener("click", handleLeftClick, true);
  document.addEventListener("keydown", handleKeyDown, true);
}

// ============ 选中元素 ============

function handleLeftClick(e) {
  if (e.target.closest(".dsl-editor-menu")) return;
  closeAllMenus();
}

function handleContextMenu(e) {
  const target = e.target;
  const dslNode = target.closest("[data-dsl-id]");
  if (!dslNode) return;

  e.preventDefault();
  e.stopPropagation();

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
  const nodeName = element.dataset.dslName || nodeId;
  const cs = getComputedStyle(element);

  // 头部信息
  menu.innerHTML = `
    <div class="dsl-menu-header">${nodeName}</div>

    <!-- 圆角 - 默认展开 -->
    <div class="dsl-menu-section" data-section="radius">
      <div class="dsl-section-toggle" data-target="radius">
        <span class="dsl-section-arrow"></span>Radius
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
        <span class="dsl-section-arrow"></span>Move
      </div>
      <div class="dsl-section-body">
        <div class="dsl-move-row">
          <label class="dsl-link-toggle"><input type="checkbox" class="dsl-move-all-check" />All children</label>
          <label>Step <input type="number" class="dsl-input dsl-move-step" value="10" min="1" style="width:50px" /></label>
        </div>
        <div class="dsl-move-pad">
          <button class="dsl-dir-btn" data-dir="up" title="Move Up">&#9650;</button>
          <div class="dsl-move-lr">
            <button class="dsl-dir-btn" data-dir="left" title="Move Left">&#9664;</button>
            <button class="dsl-dir-btn dsl-dir-center" data-dir="reset" title="Reset">R</button>
            <button class="dsl-dir-btn" data-dir="right" title="Move Right">&#9654;</button>
          </div>
          <button class="dsl-dir-btn" data-dir="down" title="Move Down">&#9660;</button>
        </div>
      </div>
    </div>

    <!-- Padding - 默认折叠 -->
    <div class="dsl-menu-section" data-section="padding">
      <div class="dsl-section-toggle" data-target="padding">
        <span class="dsl-section-arrow"></span>Padding
      </div>
      <div class="dsl-section-body">
        <div class="dsl-padding-toolbar">
          <label class="dsl-link-toggle"><input type="checkbox" class="dsl-pad-link" checked />Link</label>
          <input type="number" class="dsl-input dsl-pad-all" placeholder="All" min="0" />
          <button class="dsl-pad-apply">Apply</button>
          <button class="dsl-pad-reset">Reset</button>
        </div>
        <div class="dsl-padding-grid">
          <div></div>
          <label>T <input type="number" class="dsl-input dsl-pt" value="${Math.round(parseFloat(cs.paddingTop) || 0)}" min="0" /></label>
          <div></div>
          <label>L <input type="number" class="dsl-input dsl-pl" value="${Math.round(parseFloat(cs.paddingLeft) || 0)}" min="0" /></label>
          <div class="dsl-padding-center">
            <svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" rx="2" fill="none" stroke="#6b7280" stroke-width="1.5"/></svg>
          </div>
          <label>R <input type="number" class="dsl-input dsl-pr" value="${Math.round(parseFloat(cs.paddingRight) || 0)}" min="0" /></label>
          <div></div>
          <label>B <input type="number" class="dsl-input dsl-pb" value="${Math.round(parseFloat(cs.paddingBottom) || 0)}" min="0" /></label>
          <div></div>
        </div>
      </div>
    </div>

    <!-- 尺寸+间距 - 合并为一个区 -->
    <div class="dsl-menu-section" data-section="size">
      <div class="dsl-section-toggle" data-target="size">
        <span class="dsl-section-arrow"></span>Size / Gap
      </div>
      <div class="dsl-section-body">
        <div class="dsl-menu-row">
          <label>W <input type="number" class="dsl-input dsl-w" value="${Math.round(parseFloat(cs.width))}" /></label>
          <label>H <input type="number" class="dsl-input dsl-h" value="${Math.round(parseFloat(cs.height))}" /></label>
        </div>
        <div class="dsl-menu-row">
          <label>Gap <input type="number" class="dsl-input dsl-gap" value="${Math.round(parseFloat(cs.gap) || 0)}" min="0" /></label>
        </div>
      </div>
    </div>

    <!-- 文字 - 默认折叠 -->
    <div class="dsl-menu-section" data-section="typo">
      <div class="dsl-section-toggle" data-target="typo">
        <span class="dsl-section-arrow"></span>Typography
      </div>
      <div class="dsl-section-body">
        <div class="dsl-menu-row">
          <label>Size <input type="number" class="dsl-input dsl-fontsize" value="${Math.round(parseFloat(cs.fontSize) || 16)}" min="1" /></label>
          <label>Weight
            <select class="dsl-select dsl-fontweight">
              <option value="400" ${cs.fontWeight === "400" ? "selected" : ""}>400</option>
              <option value="500" ${cs.fontWeight === "500" ? "selected" : ""}>500</option>
              <option value="600" ${cs.fontWeight === "600" ? "selected" : ""}>600</option>
              <option value="700" ${cs.fontWeight === "700" ? "selected" : ""}>700</option>
            </select>
          </label>
        </div>
        <div class="dsl-menu-row">
          <label>Color <input type="color" class="dsl-color-picker" value="${rgbToHex(cs.color)}" /></label>
          <label class="dsl-color-hex">${rgbToHex(cs.color)}</label>
        </div>
      </div>
    </div>

    <!-- 裁剪 - 默认折叠 -->
    <div class="dsl-menu-section" data-section="clip">
      <div class="dsl-section-toggle" data-target="clip">
        <span class="dsl-section-arrow"></span>Overflow
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
      <button class="dsl-btn dsl-btn-save">Save Patch (${pendingPatches.length})</button>
      <button class="dsl-btn dsl-btn-export">Export JSON</button>
    </div>
  `;

  document.body.appendChild(menu);

  // ============ 折叠逻辑 ============
  // 默认展开 radius 和 size，其余折叠
  const openSections = new Set(["radius", "move", "size"]);
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

  // Color
  const colorPicker = menu.querySelector(".dsl-color-picker");
  const colorHex = menu.querySelector(".dsl-color-hex");
  colorPicker.addEventListener("input", () => {
    const hex = colorPicker.value;
    element.style.color = hex;
    colorHex.textContent = hex;
    addPatch(nodeId, "update_style", { color: hex });
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

  // 保存 Patch
  const saveBtn = menu.querySelector(".dsl-btn-save");
  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (pendingPatches.length === 0) {
      showToast("No changes to save");
      return;
    }
    chrome.storage.local.get(["patches"], (result) => {
      const existing = result.patches || [];
      const all = [...existing, ...pendingPatches];
      chrome.storage.local.set({ patches: all }, () => {
        showToast(`Saved ${pendingPatches.length} patches`);
        pendingPatches = [];
        saveBtn.textContent = "Save Patch (0)";
      });
    });
  });

  // 导出 JSON
  const exportBtn = menu.querySelector(".dsl-btn-export");
  exportBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    chrome.storage.local.get(["patches"], (result) => {
      const all = [...(result.patches || []), ...pendingPatches];
      if (all.length === 0) {
        showToast("No patches to export");
        return;
      }
      const blob = new Blob([JSON.stringify({ version: 1, patches: all }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mastergo-dsl-patch.json";
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${all.length} patches`);
    });
  });

  // 阻止菜单内的事件冒泡
  menu.addEventListener("contextmenu", e => e.preventDefault());
  menu.addEventListener("click", e => e.stopPropagation());
}

function closeAllMenus() {
  document.querySelectorAll(".dsl-editor-menu").forEach(m => m.remove());
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
  if (saveBtn) saveBtn.textContent = `Save Patch (${pendingPatches.length})`;
}

// ============ 工具函数 ============

function getCurrentRadius(element) {
  const cs = getComputedStyle(element);
  return Math.round(parseFloat(cs.borderRadius) || 0);
}

function rgbToHex(rgb) {
  if (!rgb || rgb === "transparent") return "#000000";
  if (rgb.startsWith("#")) return rgb.length === 4
    ? "#" + rgb[1]+rgb[1]+rgb[2]+rgb[2]+rgb[3]+rgb[3]
    : rgb;
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return "#000000";
  return "#" + [m[1], m[2], m[3]].map(v => parseInt(v).toString(16).padStart(2, "0")).join("");
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
