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
      resetBtn: "🗑️ Clear Output",
      resetConfirm: "Clear all output files?",
      resetSuccess: "✅ output directory cleared",
      resetFail: "❌ Failed: ",
      resetOffline: "❌ Server not running!\n\nRun: npm run server",
      envTitle: ".env Config",
      envTokenPlaceholder: "mg_xxxxxxxxxxxx",
      envUrlPlaceholder: "https://mastergo.com/file/...?layer_id=...",
      envSaveBtn: "Save & Run",
      envHint: "⚠️ Saving will clear output and re-run",
      envSaved: "✅ Saved! Running...",
      envSaveFail: "❌ Save failed: ",
      envInvalidUrl: "❌ Invalid MasterGo URL. Expected: https://mastergo.com/file/ID?...",
      envRunning: "Running... Check terminal",
      genTitle: "Generator Config",
      genStyleLabel: "Style Mode",
      genComponentsLabel: "Component Dirs",
      genComponentsPlaceholder: "./components, @mui/material, ./ui-lib",
      genCodeStyleLabel: "Code Style File",
      genCodeStylePlaceholder: ".eslintrc.json, .prettierrc",
      genSaveBtn: "⚙️ Apply & Generate",
      genHint: "All options are optional. Default: inline styles.",
      genGenerating: "Generating...",
      genSuccess: "✅ Done!",
      genFail: "❌ Failed: ",
      genOffline: "❌ Server not running!\n\nRun: npm run server",
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
      resetBtn: "🗑️ 清空 Output",
      resetConfirm: "确定清空所有 output 文件？",
      resetSuccess: "✅ output 目录已清空",
      resetFail: "❌ 清空失败：",
      resetOffline: "❌ 重建服务未启动！\n\n请先运行：npm run server",
      envTitle: ".env 配置",
      envTokenPlaceholder: "mg_xxxxxxxxxxxx",
      envUrlPlaceholder: "https://mastergo.com/file/...?layer_id=...",
      envSaveBtn: "保存并运行",
      envHint: "⚠️ 保存后清空 output 并重新运行",
      envSaved: "✅ 已保存！运行中...",
      envSaveFail: "❌ 保存失败：",
      envInvalidUrl: "❌ 无效的 MasterGo 链接，格式应为：https://mastergo.com/file/ID?...",
      envRunning: "运行中... 查看终端",
      genTitle: "生成器配置",
      genStyleLabel: "样式模式",
      genComponentsLabel: "组件目录",
      genComponentsPlaceholder: "./components, @mui/material, ./ui-lib",
      genCodeStyleLabel: "代码规范文件",
      genCodeStylePlaceholder: ".eslintrc.json, .prettierrc",
      genSaveBtn: "⚙️ 应用并生成",
      genHint: "所有选项均可选。默认：内联样式。",
      genGenerating: "生成中...",
      genSuccess: "✅ 完成！",
      genFail: "❌ 失败：",
      genOffline: "❌ 重建服务未启动！\n\n请先运行：npm run server",
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
    // Update placeholders
    var phEls = document.querySelectorAll("[data-i18n-placeholder]");
    for (var j = 0; j < phEls.length; j++) {
      var phKey = phEls[j].getAttribute("data-i18n-placeholder");
      if (t[phKey]) {
        phEls[j].placeholder = t[phKey];
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

  // Clear Output button
  var resetBtn = document.getElementById("resetBtn");
  resetBtn.addEventListener("click", function () {
    if (!confirm(i18n[lang].resetConfirm)) return;
    resetBtn.disabled = true;
    fetch("http://localhost:3456/reset-output", { method: "POST" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) {
          alert(i18n[lang].resetSuccess);
        } else {
          alert(i18n[lang].resetFail + (data.error || ""));
        }
      })
      .catch(function () {
        alert(i18n[lang].resetOffline);
      })
      .finally(function () {
        resetBtn.disabled = false;
      });
  });

  // Env config section
  var envSection = document.getElementById("envSection");
  var envHeader = document.getElementById("envHeader");
  var envSaveBtn = document.getElementById("envSaveBtn");
  var envHint = document.getElementById("envHint");
  var envTokenInput = document.getElementById("envToken");
  var envUrlInput = document.getElementById("envUrl");

  // Toggle collapse
  envHeader.addEventListener("click", function () {
    envSection.classList.toggle("open");
  });

  // Load env values on open
  function loadEnvValues() {
    fetch("http://localhost:3456/env")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.MG_MCP_TOKEN) envTokenInput.value = data.MG_MCP_TOKEN;
        if (data._url) envUrlInput.value = data._url;
      })
      .catch(function () {});
  }

  // Load when section opens
  var envLoaded = false;
  envHeader.addEventListener("click", function () {
    if (!envLoaded) {
      loadEnvValues();
      envLoaded = true;
    }
  });

  // Parse MasterGo URL → { fileId, layerId }
  function parseMasterGoUrl(url) {
    try {
      // Accept both with and without https://mastergo.com
      var clean = url.replace(/^https?:\/\/mastergo\.com\/?/, "").replace(/^\/?/, "");
      if (!clean.startsWith("file/")) return null;
      var rest = clean.slice(5);
      var qIdx = rest.indexOf("?");
      var fileId = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
      if (!/^\d+$/.test(fileId)) return null;

      // Extract layer_id from query string
      var layerId = null;
      if (qIdx >= 0) {
        var query = rest.slice(qIdx + 1);
        var params = query.split("&");
        for (var i = 0; i < params.length; i++) {
          var pair = params[i].split("=");
          if (pair[0] === "layer_id") {
            layerId = decodeURIComponent(pair[1] || "");
            break;
          }
        }
      }
      if (!layerId) return null;

      return { fileId: fileId, layerId: layerId };
    } catch (e) {
      return null;
    }
  }

  // Save env values + run dev
  envSaveBtn.addEventListener("click", function () {
    var token = envTokenInput.value.trim();
    var url = envUrlInput.value.trim();

    if (!token) {
      alert(i18n[lang].envSaveFail + "MG_MCP_TOKEN is required");
      return;
    }

    var parsed = parseMasterGoUrl(url);
    if (!parsed) {
      alert(i18n[lang].envInvalidUrl);
      return;
    }

    envSaveBtn.disabled = true;
    envHint.textContent = i18n[lang].envRunning;
    envHint.style.color = "#3b82f6";

    // Step 1: save config
    var body = JSON.stringify({
      MG_MCP_TOKEN: token,
      MG_FILE_ID: parsed.fileId,
      MG_LAYER_ID: parsed.layerId,
      _url: url,
    });
    fetch("http://localhost:3456/env", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) {
          envHint.textContent = i18n[lang].envHint;
          envHint.style.color = "";
          alert(i18n[lang].envSaveFail + (data.error || ""));
          envSaveBtn.disabled = false;
          return;
        }
        // Step 2: clear output + run dev
        return fetch("http://localhost:3456/run-dev", { method: "POST" });
      })
      .then(function (res) {
        if (res && res.ok) {
          envHint.textContent = i18n[lang].envSaved;
          envHint.style.color = "#10b981";
        }
      })
      .catch(function () {
        envHint.textContent = i18n[lang].envHint;
        envHint.style.color = "";
        alert(i18n[lang].resetOffline);
        envSaveBtn.disabled = false;
      });
  });

  // Generator config section
  var genSection = document.getElementById("genSection");
  var genHeader = document.getElementById("genHeader");
  var genSaveBtn = document.getElementById("genSaveBtn");
  var genHint = document.getElementById("genHint");
  var genComponentsInput = document.getElementById("genComponents");
  var genCodeStyleInput = document.getElementById("genCodeStyle");
  var styleModeGroup = document.getElementById("styleModeGroup");

  // Toggle collapse
  genHeader.addEventListener("click", function () {
    genSection.classList.toggle("open");
  });

  // Load gen config values when section opens
  var genLoaded = false;
  genHeader.addEventListener("click", function () {
    if (!genLoaded) {
      loadGenConfigValues();
      genLoaded = true;
    }
  });

  function loadGenConfigValues() {
    fetch("http://localhost:3456/gen-config")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        // Set style mode
        var styleMode = data.styleMode || "inline";
        var radios = styleModeGroup.querySelectorAll(".gen-radio-item");
        for (var i = 0; i < radios.length; i++) {
          var radio = radios[i];
          if (radio.getAttribute("data-value") === styleMode) {
            radio.classList.add("selected");
            radio.querySelector("input").checked = true;
          } else {
            radio.classList.remove("selected");
            radio.querySelector("input").checked = false;
          }
        }
        // Set other fields
        if (data.components && data.components.length > 0) {
          var compStr = data.components.map(function (c) {
            if (c.type === "npm") return c.name;
            return c.path;
          }).join(", ");
          genComponentsInput.value = compStr;
        }
        if (data.codeStyleFile) {
          genCodeStyleInput.value = data.codeStyleFile;
        }
      })
      .catch(function () {});
  }

  // Style mode radio buttons
  var styleModeRadios = styleModeGroup.querySelectorAll(".gen-radio-item");
  for (var i = 0; i < styleModeRadios.length; i++) {
    styleModeRadios[i].addEventListener("click", function () {
      var value = this.getAttribute("data-value");
      // Update UI
      for (var j = 0; j < styleModeRadios.length; j++) {
        styleModeRadios[j].classList.remove("selected");
        styleModeRadios[j].querySelector("input").checked = false;
      }
      this.classList.add("selected");
      this.querySelector("input").checked = true;
    });
  }

  // Parse component dirs string to component sources
  function parseComponentDirs(dirStr) {
    if (!dirStr || !dirStr.trim()) return [];
    var parts = dirStr.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var sources = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part.startsWith("@")) {
        // npm package
        sources.push({ type: "npm", name: part });
      } else if (part.startsWith("./") || part.startsWith("../") || part.startsWith("/") || /^[a-zA-Z]:/.test(part)) {
        // local path
        sources.push({ type: "local", path: part });
      } else if (part.startsWith("~")) {
        // home directory path
        sources.push({ type: "local", path: part });
      } else {
        // default to local path
        sources.push({ type: "local", path: "./" + part });
      }
    }
    return sources;
  }

  // Apply & Generate button
  genSaveBtn.addEventListener("click", function () {
    // Get selected style mode
    var selectedMode = "inline";
    var radios = styleModeGroup.querySelectorAll(".gen-radio-item");
    for (var i = 0; i < radios.length; i++) {
      if (radios[i].querySelector("input").checked) {
        selectedMode = radios[i].getAttribute("data-value");
        break;
      }
    }

    // Build config
    var config = {
      styleMode: selectedMode,
      components: parseComponentDirs(genComponentsInput.value),
    };

    var codeStyleFile = genCodeStyleInput.value.trim();
    if (codeStyleFile) {
      config.codeStyleFile = codeStyleFile;
    }

    // Update UI to loading state
    genSaveBtn.disabled = true;
    genSaveBtn.textContent = i18n[lang].genGenerating;
    genHint.textContent = i18n[lang].genGenerating;
    genHint.style.color = "#3b82f6";

    // Save config and generate
    fetch("http://localhost:3456/gen-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.success) {
          genHint.textContent = i18n[lang].genHint;
          genHint.style.color = "";
          genSaveBtn.disabled = false;
          genSaveBtn.textContent = i18n[lang].genSaveBtn;
          return;
        }
        // Generate React code with config
        return fetch("http://localhost:3456/generate-react", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: config }),
        });
      })
      .then(function (res) {
        if (res && res.ok) return res.json();
        throw new Error("Generation failed");
      })
      .then(function (data) {
        if (data && data.success) {
          genHint.textContent = i18n[lang].genSuccess;
          genHint.style.color = "#10b981";
          genSaveBtn.textContent = i18n[lang].genSuccess;
          setTimeout(function () {
            var cssMsg = data.cssFile ? "\n\n+ " + data.cssFile : "";
            alert(lang === "zh"
              ? "✅ React 代码已生成！\n\n文件: react-app/src/App.tsx" + cssMsg + "\n\n节点: " + data.nodeCount + " 个\n匹配组件: " + data.matchCount + " 个"
              : "✅ React code generated!\n\nFile: react-app/src/App.tsx" + cssMsg + "\n\nNodes: " + data.nodeCount + "\nMatched components: " + data.matchCount);
            genHint.textContent = i18n[lang].genHint;
            genHint.style.color = "";
            genSaveBtn.disabled = false;
            genSaveBtn.textContent = i18n[lang].genSaveBtn;
          }, 300);
        } else {
          throw new Error((data && data.error) || "Unknown error");
        }
      })
      .catch(function (err) {
        genHint.textContent = i18n[lang].genHint;
        genHint.style.color = "";
        genSaveBtn.disabled = false;
        genSaveBtn.textContent = i18n[lang].genSaveBtn;
        alert((lang === "zh" ? "❌ 生成失败：" : "❌ Generation failed: ") + (err.message || ""));
      });
  });
})();
