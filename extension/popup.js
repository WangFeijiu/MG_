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
      step4_desc: 'Click "Save Patch" to store changes, or "Confirm & Rebuild" to rebuild HTML.',
      info: '<strong>Shortcuts:</strong> Press <kbd>Esc</kbd> to close the menu. Click anywhere outside to dismiss.',
      reactBtn: "⚛️ Generate React",
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
      step4_desc: '点击"保存"存储修改，或"确认更新"重建 HTML。',
      info: '<strong>快捷键：</strong>按 <kbd>Esc</kbd> 关闭菜单。点击面板外部也可关闭。',
      reactBtn: "⚛️ 生成 React",
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

  // Generate React button
  var reactBtn = document.getElementById("reactBtn");
  reactBtn.addEventListener("click", function () {
    var btnText = reactBtn.querySelector("span");
    reactBtn.disabled = true;
    btnText.textContent = lang === "zh" ? "生成中..." : "Generating...";

    fetch("http://localhost:3456/generate-react", { method: "POST" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) {
          btnText.textContent = lang === "zh" ? "✅ 已生成！" : "✅ Done!";
          setTimeout(function () {
            var open = confirm(lang === "zh"
              ? "✅ React 代码已生成到 react-app/src/App.tsx\n\n是否打开 react-app？"
              : "✅ React code generated to react-app/src/App.tsx\n\nOpen react-app in terminal?");
            if (open) {
              // 提示用户在终端运行
              alert(lang === "zh"
                ? "请在终端运行：\n\ncd react-app\nnpm run dev"
                : "Run in terminal:\n\ncd react-app\nnpm run dev");
            }
          }, 300);
        } else {
          btnText.textContent = lang === "zh" ? "❌ 失败" : "❌ Failed";
          alert((lang === "zh" ? "❌ 生成失败：" : "❌ Failed: ") + (data.error || ""));
        }
      })
      .catch(function () {
        btnText.textContent = lang === "zh" ? "❌ 离线" : "❌ Offline";
        alert(lang === "zh"
          ? "❌ 重建服务未启动！\n\n请先运行：npm run server"
          : "❌ Server not running!\n\nRun: npm run server");
      })
      .finally(function () {
        setTimeout(function () {
          btnText.textContent = i18n[lang].reactBtn;
          reactBtn.disabled = false;
        }, 3000);
      });
  });
})();
