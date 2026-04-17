/**
 * MasterGo DSL 编辑器 - Popup 脚本
 * 核心改动：每次修改都累积记录 pendingPatches
 */

let currentElement = null;
let currentNodeId = null;

// 所有待保存的 patches
let pendingPatches = [];

// DOM 元素
const selectedElementDiv = document.getElementById("selectedElement");

// 圆角控件
const radiusModeRadios = document.querySelectorAll('input[name="radiusMode"]');
const radiusLinkedDiv = document.getElementById("radiusLinked");
const radiusSeparateDiv = document.getElementById("radiusSeparate");
const radiusAllInput = document.getElementById("radiusAll");
const radiusTopLeftInput = document.getElementById("radiusTopLeft");
const radiusTopRightInput = document.getElementById("radiusTopRight");
const radiusBottomRightInput = document.getElementById("radiusBottomRight");
const radiusBottomLeftInput = document.getElementById("radiusBottomLeft");
const presetButtons = document.querySelectorAll(".preset-btn");

// 位置和尺寸控件
const posXInput = document.getElementById("posX");
const posYInput = document.getElementById("posY");
const widthInput = document.getElementById("width");
const heightInput = document.getElementById("height");
const gapInput = document.getElementById("gap");

// 裁剪控件
const overflowSelect = document.getElementById("overflow");
const objectFitSelect = document.getElementById("objectFit");

// 按钮
const saveBtn = document.getElementById("saveBtn");
const exportBtn = document.getElementById("exportBtn");

// 初始化
init();

function init() {
  // 圆角模式切换
  radiusModeRadios.forEach(radio => {
    radio.addEventListener("change", (e) => {
      if (e.target.value === "linked") {
        radiusLinkedDiv.style.display = "block";
        radiusSeparateDiv.style.display = "none";
      } else {
        radiusLinkedDiv.style.display = "none";
        radiusSeparateDiv.style.display = "grid";
      }
    });
  });

  // 预设圆角按钮
  presetButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const radius = parseInt(btn.dataset.radius);
      radiusAllInput.value = radius;
      applyBorderRadius();
      presetButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // 实时应用 + 记录 patch
  radiusAllInput.addEventListener("input", applyBorderRadius);
  radiusTopLeftInput.addEventListener("input", applyBorderRadius);
  radiusTopRightInput.addEventListener("input", applyBorderRadius);
  radiusBottomRightInput.addEventListener("input", applyBorderRadius);
  radiusBottomLeftInput.addEventListener("input", applyBorderRadius);

  posXInput.addEventListener("input", applyPosition);
  posYInput.addEventListener("input", applyPosition);
  widthInput.addEventListener("input", applySize);
  heightInput.addEventListener("input", applySize);
  gapInput.addEventListener("input", applyGap);
  overflowSelect.addEventListener("change", applyOverflow);
  objectFitSelect.addEventListener("change", applyObjectFit);

  // 保存和导出
  saveBtn.addEventListener("click", savePatches);
  exportBtn.addEventListener("click", exportPatches);

  // 请求当前选中的元素
  requestSelectedElement();
}

/**
 * 生成唯一 patch ID
 */
function genPatchId() {
  return `patch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 添加或更新 pending patch
 * 对同一个节点的同类型操作会合并
 */
function addPendingPatch(nodeId, op, payload) {
  // 查找是否已有同节点同操作的 patch
  const existing = pendingPatches.find(
    p => p.targetNodeId === nodeId && p.op === op
  );

  if (existing) {
    // 合并 payload
    existing.payload = { ...existing.payload, ...payload };
    console.log("合并 patch:", existing.id, op, payload);
  } else {
    const patch = {
      id: genPatchId(),
      targetNodeId: nodeId,
      op: op,
      payload: payload,
    };
    pendingPatches.push(patch);
    console.log("新增 patch:", patch.id, op, payload);
  }

  updatePatchCount();
}

/**
 * 更新 UI 上的 patch 计数
 */
function updatePatchCount() {
  const count = pendingPatches.length;
  saveBtn.textContent = `💾 保存 Patch (${count})`;
}

// ============ 实时应用样式 + 记录 patch ============

function applyBorderRadius() {
  if (!currentNodeId) return;

  const mode = document.querySelector('input[name="radiusMode"]:checked').value;
  const borderRadius = mode === "linked"
    ? {
        linked: true,
        topLeft: parseInt(radiusAllInput.value) || 0,
        topRight: parseInt(radiusAllInput.value) || 0,
        bottomRight: parseInt(radiusAllInput.value) || 0,
        bottomLeft: parseInt(radiusAllInput.value) || 0,
      }
    : {
        linked: false,
        topLeft: parseInt(radiusTopLeftInput.value) || 0,
        topRight: parseInt(radiusTopRightInput.value) || 0,
        bottomRight: parseInt(radiusBottomRightInput.value) || 0,
        bottomLeft: parseInt(radiusBottomLeftInput.value) || 0,
      };

  // 实时应用到页面
  sendToContentScript({
    action: "updateStyle",
    nodeId: currentNodeId,
    style: { borderRadius },
  });

  // 记录 patch
  addPendingPatch(currentNodeId, "update_style", { borderRadius });
}

function applyPosition() {
  if (!currentNodeId) return;
  const x = parseFloat(posXInput.value);
  const y = parseFloat(posYInput.value);
  if (isNaN(x) && isNaN(y)) return;

  const layout = {
    x: isNaN(x) ? undefined : x,
    y: isNaN(y) ? undefined : y,
  };

  sendToContentScript({
    action: "updateLayout",
    nodeId: currentNodeId,
    layout,
  });

  addPendingPatch(currentNodeId, "update_layout", layout);
}

function applySize() {
  if (!currentNodeId) return;
  const width = parseFloat(widthInput.value);
  const height = parseFloat(heightInput.value);
  if (isNaN(width) && isNaN(height)) return;

  const layout = {
    width: isNaN(width) ? undefined : width,
    height: isNaN(height) ? undefined : height,
  };

  sendToContentScript({
    action: "updateLayout",
    nodeId: currentNodeId,
    layout,
  });

  addPendingPatch(currentNodeId, "update_layout", layout);
}

function applyGap() {
  if (!currentNodeId) return;
  const gap = parseFloat(gapInput.value);
  if (isNaN(gap)) return;

  sendToContentScript({
    action: "updateLayout",
    nodeId: currentNodeId,
    layout: { gap },
  });

  addPendingPatch(currentNodeId, "update_layout", { gap });
}

function applyOverflow() {
  if (!currentNodeId) return;

  const overflow = overflowSelect.value;
  sendToContentScript({
    action: "updateStyle",
    nodeId: currentNodeId,
    style: { overflow },
  });

  addPendingPatch(currentNodeId, "update_style", { overflow });
}

function applyObjectFit() {
  if (!currentNodeId) return;

  const objectFit = objectFitSelect.value;
  sendToContentScript({
    action: "updateStyle",
    nodeId: currentNodeId,
    style: { objectFit },
  });

  addPendingPatch(currentNodeId, "update_style", { objectFit });
}

// ============ 通信 ============

function requestSelectedElement() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(
      tabs[0].id,
      { action: "getSelectedElement" },
      (response) => {
        if (response && response.element) {
          updateSelectedElement(response.element);
        }
      }
    );
  });
}

function updateSelectedElement(element) {
  currentElement = element;
  currentNodeId = element.nodeId;

  selectedElementDiv.textContent = `选中: ${element.name || element.nodeId} (${element.type})`;

  if (element.borderRadius) {
    const br = element.borderRadius;
    if (br.linked) {
      document.querySelector('input[value="linked"]').checked = true;
      radiusLinkedDiv.style.display = "block";
      radiusSeparateDiv.style.display = "none";
      radiusAllInput.value = br.topLeft;
    } else {
      document.querySelector('input[value="separate"]').checked = true;
      radiusLinkedDiv.style.display = "none";
      radiusSeparateDiv.style.display = "grid";
      radiusTopLeftInput.value = br.topLeft;
      radiusTopRightInput.value = br.topRight;
      radiusBottomRightInput.value = br.bottomRight;
      radiusBottomLeftInput.value = br.bottomLeft;
    }
  }

  if (element.position) {
    posXInput.value = element.position.x || 0;
    posYInput.value = element.position.y || 0;
  }

  if (element.size) {
    widthInput.value = element.size.width || "";
    heightInput.value = element.size.height || "";
  }

  if (element.gap !== undefined) {
    gapInput.value = element.gap;
  }

  if (element.overflow) {
    overflowSelect.value = element.overflow;
  }

  if (element.objectFit) {
    objectFitSelect.value = element.objectFit;
  }
}

function sendToContentScript(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, message);
  });
}

// ============ 保存和导出 ============

/**
 * 保存所有 pending patches 到 storage
 */
function savePatches() {
  if (pendingPatches.length === 0) {
    alert("没有修改需要保存。请先修改元素属性。");
    return;
  }

  // 从 storage 读取已有的 patches，追加新的
  chrome.storage.local.get(["patches"], (result) => {
    const existing = result.patches || [];
    const all = [...existing, ...pendingPatches];

    chrome.storage.local.set({ patches: all }, () => {
      console.log("已保存 patches:", pendingPatches.length);
      alert(`已保存 ${pendingPatches.length} 个 patch！\n累计共 ${all.length} 个 patch。`);

      // 清空 pending
      pendingPatches = [];
      updatePatchCount();
    });
  });
}

/**
 * 导出所有 patches 为 JSON 文件
 */
function exportPatches() {
  chrome.storage.local.get(["patches"], (result) => {
    const savedPatches = result.patches || [];
    const all = [...savedPatches, ...pendingPatches];

    if (all.length === 0) {
      alert("没有 patch 可以导出。请先修改元素属性并保存。");
      return;
    }

    const patchDoc = {
      version: 1,
      patches: all,
    };

    const jsonStr = JSON.stringify(patchDoc, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    // 使用下载方式
    const a = document.createElement("a");
    a.href = url;
    a.download = "mastergo-dsl-patch.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log("已导出 patches:", all.length);
  });
}
