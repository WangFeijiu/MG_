/**
 * MasterGo DSL Editor - Popup i18n
 */

(function () {
  // i18n translations
  var i18n = {
    en: {
      title: "MasterGo DSL Editor",
      step1_title: "Open preview.html",
      step1_desc: 'Open the generated <kbd>preview.html</kbd> in your browser.',
      step2_title: "Right-click element",
      step2_desc: "Right-click on any DSL element to open the editing panel. Sections can be collapsed by clicking the title.",
      step3_title: "Adjust properties",
      step3_desc: "Modify border radius, padding, size, typography, color, etc. Changes apply in real-time.",
      step4_title: "Save & Export",
      step4_desc: 'Click "Save Patch" to store changes, or "Export JSON" to download the patch file.',
      info: '<strong>Shortcuts:</strong> Press <kbd>Esc</kbd> to close the menu. Click anywhere outside to dismiss.',
    },
    zh: {
      title: "MasterGo DSL 编辑器",
      step1_title: "打开 preview.html",
      step1_desc: '在浏览器中打开生成的 <kbd>preview.html</kbd> 文件。',
      step2_title: "右键点击元素",
      step2_desc: "在任意 DSL 元素上右键点击打开编辑面板。点击标题可折叠/展开分区。",
      step3_title: "调整属性",
      step3_desc: "修改圆角、内边距、尺寸、排版、颜色等，实时预览效果。",
      step4_title: "保存和导出",
      step4_desc: '点击"保存 Patch"存储修改，或"导出 JSON"下载补丁文件。',
      info: '<strong>快捷键：</strong>按 <kbd>Esc</kbd> 关闭菜单。点击面板外部也可关闭。',
    },
  };

  var lang = "en";
  var switchEl = document.getElementById("langSwitch");

  function applyLang() {
    var t = i18n[lang];
    // Update all data-i18n elements
    var els = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < els.length; i++) {
      var key = els[i].getAttribute("data-i18n");
      if (t[key]) {
        els[i].innerHTML = t[key];
      }
    }
    // Update switch state
    if (lang === "zh") {
      switchEl.classList.add("is-on");
    } else {
      switchEl.classList.remove("is-on");
    }
  }

  // 启动时从 storage 读取语言设置
  chrome.storage.local.get("lang", function (result) {
    if (result.lang) {
      lang = result.lang;
      applyLang();
    }
  });

  switchEl.addEventListener("click", function () {
    lang = lang === "en" ? "zh" : "en";
    chrome.storage.local.set({ lang: lang });
    applyLang();
  });
})();
