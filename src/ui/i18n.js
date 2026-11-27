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
    // Additional settings and status vocabulary
    '未连接运行时': 'Runtime not connected',
    'ApkStart 已就绪': 'ApkStart is ready',
    '运行时与环境': 'Runtime and environment',
    '正在检查…': 'Checking…',
    '全自动：无需选择镜像、无需启用加速、无需调内存':
      'Fully automatic: no image selection, acceleration setup or memory tuning needed',
    '本机自适应参数': 'Adaptive settings for this machine',
    '内存、核心数、渲染后端、端口、加速方式全部自动选择；启动失败会自动降级重试，不需要手动改。':
      'Memory, cores, renderer, ports and acceleration are chosen automatically, with automatic fallback on failure.',
    '磁盘总占用（运行时 + 安卓数据 + 缓存）': 'Total disk usage (runtime + Android data + cache)',
    '正在统计…': 'Calculating…',
    '清理可回收文件': 'Clean reclaimable files',
    '清理旧版本残留': 'Remove leftovers from older versions',
    '修复网络': 'Repair network',
    '重置安卓数据': 'Reset Android data',
    '我已安装完成': 'Installation finished',
    '稍后再说': 'Later',
    '自动模式（默认，无需设置）': 'Automatic mode (default, no setup needed)',
    '应用窗口': 'Application window',
    '显示模式': 'Display mode',
    '竖屏窗口（可自由拉伸，记住每个应用的大小）': 'Portrait window (resizable, remembers size per app)',
    '全屏（铺满屏幕，保持手机比例两侧留黑）': 'Fullscreen (fills height, keeps phone aspect ratio)',
    '关闭（按上面选的显示模式走）': 'Off (follows the display mode above)',
    '打开 · 每次启动应用都自动全屏': 'On · every app starts fullscreen',
    '屏幕方向': 'Screen orientation',
    '跟随应用（推荐 · 自动选横竖屏，画面铺满不留黑边）': 'Follow app (recommended, no letterboxing)',
    '强制竖屏（手机比例，适合刷短视频、看小说）': 'Force portrait (phone aspect, for video and reading)',
    '强制横屏（宽屏铺满，适合看剧、玩游戏）': 'Force landscape (wide, for video and games)',
    '当前面板方向': 'Current panel orientation',
    '竖屏面板': 'Portrait panel',
    '横屏面板': 'Landscape panel',
    '镜像自动旋转': 'Auto-rotate in guest',
    '打开（默认）· 系统设置里显示自动旋转已开启': 'On by default · auto-rotate is enabled in guest settings',
    '关闭 · 回到旧的锁定行为': 'Off · restores the locked behaviour',
    '平板排版': 'Tablet layout',
    '打开（推荐 · 逻辑密度 190dpi，sw606dp 走平板排版）': 'On (recommended, 190dpi tablet layout)',
    '关闭（镜像默认密度，手机排版）': 'Off (image default, phone layout)',
    '窗口承载方式': 'Window hosting',
    '原生窗口（默认·推荐）· 模拟器自己开窗口，帧率与缩放最稳': 'Native window (default) · the emulator draws its own window',
    '嵌入模式 · 安卓画面嵌在 ApkStart 窗口里，标题栏带旋转按钮':
      'Embedded · Android is drawn inside the ApkStart window',
    '竖屏画面大小': 'Portrait render size',
    '小 · 720 × 1280': 'Small · 720 × 1280',
    '中 · 900 × 1600': 'Medium · 900 × 1600',
    '大 · 1080 × 1920': 'Large · 1080 × 1920',
    '超大 · 1440 × 2560': 'Extra large · 1440 × 2560',
    '窗口模式下可拖动边框任意缩放；这里调的是 Android 内部渲染尺寸，越小越省性能。':
      'In window mode you can resize by dragging; this sets the internal Android render size.',
    '鼠标键位': 'Mouse buttons',
    '键盘映射': 'Key mapping',
    '游戏手柄': 'Gamepad',
    '资源占用': 'Resource usage',
    '磁盘占用': 'Disk usage',
    '缓存': 'Cache',
    '日志': 'Logs',
    '重置': 'Reset',
    '清除': 'Clear',
    '全机共享': 'Shared system-wide',
    '差分层': 'Overlay layer',
    '开始菜单': 'Start menu',
    '桌面图标': 'Desktop icon',
    '数据互通': 'File sharing',
    '共享目录': 'Shared folder',
    '开机自动启动': 'Start with the system',
    '托盘': 'System tray',
    '软件更新': 'Software update',
    '检查更新': 'Check for updates',
    '当前版本': 'Current version',
    '最新版本': 'Latest version',
    '发布页': 'Release page',
    '反馈': 'Feedback',
    '关于': 'About',
    '许可': 'License',
    '作者': 'Author',
    '诊断报告': 'Diagnostic report',
    '导出': 'Export',
    '导入': 'Import',
    '高级参数': 'Advanced options',
    '恢复默认': 'Restore defaults',
    '下载': 'Download',
    '上传': 'Upload',
    '速度': 'Speed',
    '剩余': 'Remaining',
    '暂停': 'Pause',
    '继续': 'Continue',
    '重试': 'Retry',
    '完成': 'Done',
    '跳过': 'Skip',
    '全选': 'Select all',
    '应用列表': 'Application list',
    '已安装应用': 'Installed applications',
    '上次使用': 'Last used',
    '启动次数': 'Launch count',
    '版本': 'Version',
    '大小': 'Size',
    '路径': 'Path',
    '包名': 'Package name',
    // On-screen keyboard control
    '安卓软键盘': 'On-screen keyboard',
    '默认关闭：直接用电脑键盘输入。需要屏幕键盘时再打开。':
      'Off by default: type with the computer keyboard. Turn on for a touch keyboard.',
    '安卓软键盘已开启，点输入框会弹出': 'On-screen keyboard on; it appears when you tap an input field',
    '安卓软键盘已关闭，直接用电脑键盘输入': 'On-screen keyboard off; type with the computer keyboard',
    // Glossary used when a whole sentence has no exact translation.
    '自动检测': 'Auto-check', '自动': 'automatic', '运行': 'run', '运行时': 'runtime',
    '失败': 'failed', '启动': 'start', '安装': 'install', '打开': 'open', '镜像': 'image',
    '安卓': 'Android', '窗口': 'window', '系统': 'system', '数据': 'data', '目录': 'folder',
    '问题': 'issue', '更新': 'update', '文件': 'file', '重启': 'restart', '正在': '',
    '检测': 'check', '下载': 'download', '诊断': 'diagnostics', '没有': 'no', '加速': 'acceleration',
    '版本': 'version', '修复': 'fix', '模拟': 'emulat', '兼容': 'compatibility', '关闭': 'off',
    '桌面': 'desktop', '需要': 'requires', '图标': 'icon', '直接': 'directly', '完成': 'done',
    '提示': 'notice', '显示': 'show', '生效': 'takes effect', '虚拟': 'virtual', '当前': 'current',
    '会自动': 'automatically', '模拟器': 'emulator', '重试': 'retry', '系统镜像': 'system image',
    '软件': 'software', '方式': 'mode', '面板': 'panel', '方向': 'orientation', '内存': 'memory',
    '模式': 'mode', '报告': 'report', '按钮': 'button', '驱动': 'driver', '用户': 'user',
    '下次': 'next', '快捷方式': 'shortcut', '硬件': 'hardware', '程序': 'program', '声音': 'sound',
    '硬件加速': 'hardware acceleration', '教程': 'guide', '网络': 'network', '旋转': 'rotation',
    '双击': 'double-click', '检查': 'check', '状态': 'status', '虚拟机': 'virtual machine',
    '本机': 'this machine', '手动': 'manual', '卸载': 'uninstall', '切换': 'switch', '使用': 'use',
    '安卓数据': 'Android data', '重置': 'reset', '默认': 'default', '诊断报告': 'diagnostic report',
    '首次': 'first', '横屏': 'landscape', '竖屏': 'portrait', '确认': 'confirm', '商店': 'store',
    '启用': 'enable', '磁盘': 'disk', '保留': 'keep', '关掉': 'turn off', '处理': 'handle',
    '体检': 'health check', '分类': 'category', '一键': 'one-click', '分区': 'partition',
    '已装': 'installed', '日志': 'logs', '重建': 'rebuild', '影响': 'affect', '后台': 'background',
    '内置': 'built-in', '手册': 'manual', '开始': 'start', '清理': 'clean', '支持': 'support',
    '如果': 'if', '或者': 'or', '并且': 'and', '但是': 'but', '因为': 'because', '所以': 'so',
    '可以': 'can', '不能': 'cannot', '不会': 'will not', '没有': 'no', '这个': 'this', '那个': 'that',
    '点击': 'click', '选择': 'select', '输入': 'input', '输出': 'output', '连接': 'connect',
    '服务': 'service', '端口': 'port', '加速': 'acceleration', '安装完成': 'installation complete',
    '等待': 'waiting', '准备': 'prepare', '进度': 'progress', '失败原因': 'failure reason',
    '未知': 'unknown', '禁用': 'disable', '允许': 'allow', '拒绝': 'deny', '高级': 'advanced',
    '搜索': 'search', '清除': 'clear', '保存': 'save', '取消': 'cancel', '确定': 'OK',
    '重试': 'retry', '跳过': 'skip', '继续': 'continue', '暂停': 'pause', '完成': 'complete',
    '时间': 'time', '大小': 'size', '速度': 'speed', '剩余': 'remaining', '路径': 'path',
    '桌面图标': 'desktop shortcut', '开始菜单': 'Start menu', '快捷': 'shortcut',
    '性能': 'performance', '资源': 'resources', '占用': 'usage', '优化': 'optimise',
    '省电': 'power saving', '优先级': 'priority', '核心': 'cores', '显卡': 'GPU',
    '画质': 'quality', '分辨率': 'resolution', '密度': 'density', '键盘': 'keyboard',
    '鼠标': 'mouse', '手柄': 'gamepad', '触控': 'touch', '按键': 'key', '映射': 'mapping',
    '预设': 'preset', '自定义': 'custom', '模板': 'template', '应用卡片': 'app card',
    '右键': 'right-click', '左键': 'left-click', '滚轮': 'scroll wheel', '侧键': 'side button',
    '滑动': 'swipe', '拖动': 'drag', '返回': 'back', '全屏': 'fullscreen', '窗口模式': 'window mode',
    '铺满': 'fill', '比例': 'aspect ratio', '黑边': 'letterboxing', '自动旋转': 'auto-rotate',
    '语言': 'language', '地区': 'region', '日期': 'date', '时间': 'time', '音量': 'volume',
    '字体': 'font', '动画': 'animations', '后台进程': 'background processes', '白名单': 'whitelist',
    '共享': 'shared', '文件夹': 'folder', '权限': 'permissions', '授权': 'grant',
    '卸载': 'uninstall', '清除数据': 'clear data', '数据互通': 'file sharing',
    '发行版': 'release', '通道': 'channel', '源': 'source', '镜像站': 'mirror', '代理': 'proxy',
    '日志': 'logs', '导出': 'export', '导入': 'import', '反馈': 'feedback', '关于': 'about',
    '许可': 'license', '作者': 'author', '官网': 'website', '发布页': 'release page',
    // Status bar and app grid fragments. The glossary approach translates a
    // whole sentence only when it has an exact entry; without these terms the
    // longest-first pass leaves mixed Chinese/English phrases such as
    // "独立window已Enable", which are hard to read in the English UI.
    '独立窗口已启用': 'detached window enabled',
    '运行时已就绪': 'Runtime is ready',
    '网络正常': 'Network OK',
    '添加应用': 'Add app',
    '拖入 APK 即可安装': 'Drop an APK to install',
    '个应用': ' apps',
    '下次重启运行时生效': 'Takes effect after the next runtime restart',
    '下次启动安卓运行时生效': 'Applies on the next Android runtime start',
    '下次打开应用生效': 'Applies the next time an app opens',
    '下次打开应用时生效': 'Applies the next time an app opens',
    '下次打开应用会多花十几秒': 'The next app launch takes a few seconds longer',
  };

  const done = new WeakSet();
  const attrs = ['title', 'placeholder', 'aria-label', 'alt'];
  // Longest keys first, otherwise a short term can break a longer phrase.
  const TERMS = Object.entries(DICT).sort((a, b) => b[0].length - a[0].length);

  function translateText(value) {
    const s = String(value || '');
    if (!/[\u4e00-\u9fff]/.test(s)) return s;
    if (DICT[s]) return DICT[s];
    let out = s;
    for (const [zh, en] of TERMS) {
      if (out.includes(zh)) out = out.split(zh).join(en);
    }
    // Reject partial translations. Replacing a few glossary terms in a long
    // sentence previously produced fragments such as "独立window已Enable",
    // which are harder to read than the original Chinese. Keep a string in its
    // source language unless every Chinese character was covered by a term or
    // an exact dictionary entry.
    if (/[\u4e00-\u9fff]/.test(out)) return s;
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
