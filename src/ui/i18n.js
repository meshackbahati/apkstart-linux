'use strict';
/**
 * Lightweight English UI layer for the Linux build.
 *
 * The original application ships Simplified Chinese strings in the markup and
 * in dynamically inserted messages. Rewriting every call site would touch
 * several thousand lines, so this module translates rendered text and the
 * common attributes after each DOM change. Identifiers, element ids and the
 * values sent to the main process are never modified.
 */
(function () {
  const DICT = {
    // Navigation and sections
    '常用与安装': 'Common & Install',
    '显示与窗口': 'Display & Window',
    '操作与输入': 'Input & Controls',
    '性能与资源': 'Performance & Resources',
    '网络与下载': 'Network & Downloads',
    '诊断与修复': 'Diagnostics & Repair',
    '集成与文件': 'Integration & Files',
    '更新与关于': 'Update & About',
    '实验室': 'Lab',
    '运行状态': 'Status',
    '设置': 'Settings',
    '应用': 'Applications',
    '教程': 'Guide',
    '运行时': 'Runtime',
    '系统镜像': 'System image',
    '兼容镜像': 'Compatibility image',
    '硬件加速': 'Hardware acceleration',
    '资源策略': 'Resource strategy',
    '省资源': 'Save resources',
    '均衡': 'Balanced',
    '流畅': 'Smooth',
    '横屏': 'Landscape',
    '竖屏': 'Portrait',
    '飞行模式': 'Airplane mode',
    '快照': 'Snapshot',
    '代理': 'Proxy',
    '中文输入法': 'Chinese input method',
    '系统语言': 'System language',
    '自动全屏': 'Auto fullscreen',
    '窗口模式': 'Window mode',
    '全屏': 'Fullscreen',
    '重置': 'Reset',
    '刷新': 'Refresh',
    '浏览': 'Browse',
    '打开': 'Open',
    '关闭': 'Close',
    '取消': 'Cancel',
    '完成': 'Done',
    '保存': 'Save',
    '删除': 'Delete',
    '卸载': 'Uninstall',
    '安装': 'Install',
    '启动': 'Start',
    '停止': 'Stop',
    '重启': 'Restart',
    '应用推荐配置': 'Apply recommended settings',
    '导出诊断报告': 'Export diagnostic report',
    '打开内置教程': 'Open built-in guide',
    '打开下载页': 'Open download page',
    '立即更新': 'Update now',
    '检查更新': 'Check for updates',
    '重新检查': 'Check again',
    '一键完成': 'One-click setup',
    '重建快捷方式': 'Rebuild shortcuts',
    '固定到顶部': 'Pin to top',
    '搜索已安装应用': 'Search installed apps',
    '安装 APK': 'Install APK',
    '选择 APK 文件': 'Choose APK file',
    '把 APK 拖进来就能装': 'Drop an APK here to install',
    '松手开始安装': 'Release to install',
    '支持单个或多个 .apk 文件': 'One or more .apk files are supported',
    '下次启动不再自动弹出': 'Do not show this again',
    '打开设置': 'Open settings',
    '开始使用': 'Get started',
    '你好': 'Welcome',
    '已就绪': 'Ready',
    '正在检测…': 'Checking…',
    '尚未检测': 'Not checked yet',
    '检查中…': 'Checking…',
    '准备中…': 'Preparing…',
    '正在引导 Android…': 'Starting Android…',
    '正在检查运行时…': 'Checking the runtime…',
    '正在解析 APK…': 'Parsing APK…',
    '正在安装应用…': 'Installing app…',
    '正在更新应用…': 'Updating app…',
    '正在准备安卓运行时…': 'Preparing the Android runtime…',
    '正在创建桌面快捷方式…': 'Creating desktop shortcut…',
    '未知': 'Unknown',
    '未知错误': 'Unknown error',
    '请重试': 'Please try again',
    '请稍后再试': 'Please try again later',
    '成功': 'Success',
    '失败': 'Failed',
    '已生效': 'Applied',
    '已关闭': 'Disabled',
    '已取消': 'Cancelled',
    '已关联 · 点击取消': 'Associated · click to remove',
    '未关联 · 点击开启': 'Not associated · click to enable',
    '运行时未启动': 'Runtime is not running',
    '运行时已就绪': 'Runtime is ready',
    '硬件加速已启用': 'Hardware acceleration is enabled',
    '需要部署': 'Deployment required',
    '未下载': 'Not downloaded',
    '安装失败': 'Installation failed',
    '启动失败': 'Startup failed',
    '保存失败': 'Save failed',
    '导入失败': 'Import failed',
    '导出失败': 'Export failed',
    '清理失败': 'Cleanup failed',
    '重置失败': 'Reset failed',
    '卸载失败': 'Uninstall failed',
    '更新失败': 'Update failed',
    '兼容性': 'Compatibility',
    '无限制': 'Unlimited',
    '自动': 'Automatic',
    '标准': 'Standard',
    '特大': 'Extra large',
    '关闭': 'Off',
    '开启': 'On',
    '全部': 'All',
    '默认': 'Default',
    '分钟': 'minutes',
    '下次重启安卓运行时后生效': 'Takes effect after the Android runtime restarts',
    '重启运行时后生效': 'Takes effect after the runtime restarts',
    '下次重启生效': 'Takes effect after the next restart',
    '安装完成后会自动生成桌面图标，双击即以独立窗口运行，和普通 Windows 软件一样。':
      'After installation a desktop launcher is created; double-click it to run the app in its own window.',
    '已注册 .apk 关联时，在资源管理器里双击 APK 也会直接装到 ApkStart。':
      'When .apk association is enabled, double-clicking an APK in the file manager installs it with ApkStart.',
    '把报告发给作者可以最快定位问题': 'Sending the report helps diagnose the problem quickly',
    '统计不可用': 'Statistics unavailable',
    '使用手册（含故障解决方案）': 'User guide with troubleshooting',
    '下次更新不再自动弹出': 'Do not show again on next update',
  };

  const done = new WeakSet();
  const attrs = ['title', 'placeholder', 'aria-label', 'alt'];

  function translateText(value) {
    const s = String(value || '');
    if (!/[\u4e00-\u9fff]/.test(s)) return s;
    if (DICT[s]) return DICT[s];
    let out = s;
    for (const [zh, en] of Object.entries(DICT)) {
      if (out.includes(zh)) out = out.split(zh).join(en);
    }
    return out;
  }

  function walk(root) {
    if (!root || done.has(root)) return;
    done.add(root);
    const nodeIterator = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    const targets = [];
    while (nodeIterator.nextNode()) targets.push(nodeIterator.currentNode);
    for (const node of targets) {
      if (node.nodeType === 3) {
        if (node.nodeValue && /[\u4e00-\u9fff]/.test(node.nodeValue)) {
          const next = translateText(node.nodeValue);
          if (next !== node.nodeValue) node.nodeValue = next;
        }
      } else if (node.nodeType === 1) {
        for (const a of attrs) {
          const v = node.getAttribute && node.getAttribute(a);
          if (v && /[\u4e00-\u9fff]/.test(v)) node.setAttribute(a, translateText(v));
        }
        if (node.tagName === 'BUTTON' && node.childNodes.length === 1
            && node.firstChild.nodeType === 3 && /[\u4e00-\u9fff]/.test(node.firstChild.nodeValue)) {
          node.firstChild.nodeValue = translateText(node.firstChild.nodeValue);
        }
      }
    }
  }

  function install() {
    document.documentElement.lang = 'en';
    walk(document.body);
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n.nodeType === 1) walk(n);
          else if (n.nodeType === 3 && /[\u4e00-\u9fff]/.test(n.nodeValue || '')) {
            n.nodeValue = translateText(n.nodeValue);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
  window.ApkStartI18n = { translateText, install };
})();
