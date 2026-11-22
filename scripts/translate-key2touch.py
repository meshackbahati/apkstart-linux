#!/usr/bin/env python3
"""Translate key2touch's user-facing strings from Chinese to English.

The AUR build ships Simplified Chinese messages. This script rewrites the
installed package in place and is idempotent. It is called by setup-linux.sh
after key2touch is installed.
"""
import glob
import os
import sys

DST = '/usr/lib/key2touch'

T = {
    '一个的中心落在另一个范围内': 'one centre falls inside another range',
    '上': 'up', '下': 'down', '左': 'left', '右': 'right',
    '上，但配置的显示器是 ': 'up, but the configured output is ',
    '上,左,下,右（默认 w,a,s,d）': 'up,left,down,right (default w,a,s,d)',
    '不使用取消': 'no cancel position',
    '不存在（可用：': 'does not exist (available: ',
    '不是有效的配置 JSON：': 'invalid profile JSON: ',
    '不检查显示器是否存在': 'do not check whether the output exists',
    '不透明度': 'opacity',
    '个': '', '个按键': ' key', '个按键点': ' points', '个摇杆': ' sticks',
    '个按键点 · 显示器 ': ' points · output ',
    '个按键点)': ' points)', '个按键点）': ' points)',
    '个技能键的取消位置越界：(': ' skill cancel position out of range: (',
    '个按键点坐标越界：(': ' point coordinates out of range: (',
    '个按键点无效：': ' invalid points: ',
    '个按键点没有绑定按键': ' points have no bound key',
    '个按键点的范围超出了屏幕边缘': ' points extend beyond the screen edge',
    '个按键点（key2touch point list 查看）': ' points (see key2touch point list)',
    '个按键点（加 --replace 改绑到这里）': ' points (add --replace to rebind here)',
    '个摇杆有方向没有绑定按键': ' sticks have directions without a bound key',
    '副本': 'Copy', '可以再次': 'can again', '和第 ': ' and point ',
    '在 ': 'at ', '已经是': 'is already', '已经被另一个热键使用': 'is already used by another hotkey',
    '已绑定在第 ': 'bound at point ', '开启': 'on', '无法列出窗口）': 'could not list windows)',
    '无法获取窗口焦点，「仅聚焦指定窗口时生效」不起作用':
        'could not get window focus; focused-window-only mode has no effect',
    '是热键，不能绑定': 'is a hotkey and cannot be bound',
    '显示鼠标': 'show cursor', '的显示器（可用：': ' output (available: ',
    '--cancel 只适用于技能键': '--cancel only applies to skill keys',
    '--cursor-key 只适用于视角区域': '--cursor-key only applies to look areas',
    '--cursor-mode 只适用于视角区域': '--cursor-mode only applies to look areas',
    '--keys 需要 4 个键，顺序为 上,左,下,右': '--keys needs 4 keys: up,left,down,right',
    '--sens 只适用于视角区域和技能键': '--sens only applies to look areas and skill keys',
    '</b> 加入 input 组。\n注销并重新登录桌面后，再打开 key2touch。':
        '</b> group. Log out and back in, then open key2touch again.',
    'D-Bus 调用失败：': 'D-Bus call failed: ',
    'Esc 取消，Backspace 清除': 'Esc cancels, Backspace clears',
    'HUD 不透明度': 'HUD opacity',
    'HYPRLAND_INSTANCE_SIGNATURE 未设置': 'HYPRLAND_INSTANCE_SIGNATURE is not set',
    'JSON 文件；省略或 - 表示标准输入': 'JSON file; omit or use - for stdin',
    'SWAYSOCK 未设置': 'SWAYSOCK is not set',
    'key2touch 没有在运行': 'key2touch is not running',
    'key2touch 没有在运行（先运行 key2touch 或 key2touch --hidden）':
        'key2touch is not running (start key2touch or key2touch --hidden first)',
    'key2touch 要读取键盘、创建虚拟触摸屏，需要把你的账户加入 <b>input</b> 组。\n加入后，同一账户下运行的程序都能读取键盘输入。':
        'key2touch reads the keyboard and creates a virtual touchscreen, so your account must be in the <b>input</b> group. Afterwards, programs running under this account can read keyboard input.',
    'key2touch：映射已': 'key2touch: mapping ',
    'niri 只能通过自身配置指定触摸屏映射到哪个显示器，所以需要在 ~/.config/niri/config.kdl 末尾加这一行：\n\n':
        'niri requires its own config to map the touchscreen to an output; add this line at the end of ~/.config/niri/config.kdl:\n\n',
    'niri 配置里 key2touch 的 include 之后还有其他 include / touch 设置，触摸映射可能被覆盖':
        'other include or touch settings after the key2touch include may override the touch mapping',
    'niri 需要在配置里加一行，触摸才能落到所选的显示器上':
        'niri needs one config line so touches reach the selected output',
    'output：不检查显示器是否存在': 'output: do not check whether the output exists',
    'toggle：单击切换（默认）；hold：按住显示': 'toggle: click to switch (default); hold: show while held',
    '」已存在': ' already exists', '」方向的键（Esc 停止）': ' direction (Esc to stop)',
    '」没有发现问题': ' has no issues',
    '」的配置': ' profile', '」的配置（key2touch profiles 查看）': ' profile (see key2touch profiles)',
    '</b> 加入 input 组。': '</b> group.',
    '中发现了一个': ' contains one ', '中': ' in ',
    '依次绑定 ↑ ← ↓ →': 'bind in order ↑ ← ↓ →',
    '侧键1': 'side button 1', '侧键2': 'side button 2',
    '保存失败：': 'save failed: ', '保存并退出': 'Save and exit',
    '修复': 'Fix', '修改按键点': 'Edit point', '修改配置选项': 'Edit options',
    '关闭': 'Close', '关闭映射': 'Disable mapping', '写入失败：': 'write failed: ',
    '写入配置': 'Write profile', '切换配置': 'Switch profile',
    '切换配置（当前修改会先保存）': 'Switch profile (current changes are saved first)',
    '列出所有配置': 'List profiles', '列出按键点': 'List points',
    '列出显示器': 'List outputs', '列出窗口及其所在显示器': 'List windows and their outputs',
    '创建': 'Create', '删除': 'Delete', '删除当前配置…': 'Delete current profile…',
    '删除按键点': 'Delete point', '删除配置': 'Delete profile',
    '删除配置「': 'Delete profile "', '加入 input 组': 'Join input group',
    '匹配的窗口 ': 'matching windows ', '半径，占显示器高度的比例（默认 0.025）':
        'radius as a fraction of output height (default 0.025)',
    '半径，占显示器高度的比例（默认 0.12）': 'radius as a fraction of output height (default 0.12)',
    '单击': 'Click', '单击切换': 'Click to toggle', '取消': 'Cancel',
    '取消位置 ': 'Cancel position ', '取消施法': 'Cancel cast',
    '取消施法：按住时点鼠标右键（所有技能共用）':
        'Cancel cast: right-click while held (shared by all skill keys)',
    '中键': 'Middle button', '右键': 'Right button', '左键': 'Left button',
    '名称无效或已存在': 'Invalid name or already exists',
    '启动图形界面时只显示托盘图标': 'Start with tray icon only',
    '启动图形界面时打开的配置': 'Profile opened with the GUI',
    '启用映射': 'Enable mapping', '命令': 'Command',
    '在任何窗口下按下都能开关映射': 'Toggle mapping from any window',
    '在屏幕上显示按键位置，按下时高亮': 'Show key positions on screen and highlight on press',
    '在游戏里打开布局编辑器，再按一次保存并退出':
        'Press again in a game to open the layout editor, and once more to save and exit',
    '坐标超出范围：': 'Coordinates out of range: ',
    '填写窗口的 app_id，可用 * 通配，不区分大小写；任意一条匹配即生效。':
        'Enter a window app_id; * is a wildcard and matching is case-insensitive; any rule matching is enough.',
    '复制 -p 指定（或当前）的配置': 'Copy the profile given by -p (or the current one)',
    '复制当前配置…': 'Duplicate current profile…', '复制配置': 'Duplicate profile',
    '外观': 'Appearance', '大小（也可在画面上滚动滚轮）': 'Size (scroll on screen too)',
    '失败：': 'failed: ', '子命令': 'subcommand',
    '将键盘按键映射为触屏操作。不带命令时启动图形界面。':
        'Map keyboard keys to touch input. Starts the GUI when no command is given.',
    '左键空白处 添加按键  ·  点击按键 重新绑定  ·  拖动 移动  ·  滚轮 调整大小  ·  右键 / Delete 删除  ·  Esc 保存并退出':
        'Click empty space to add a key · click a key to rebind · drag to move · scroll to resize · right-click or Delete to remove · Esc to save and exit',
    '已保存「': 'Saved "', '已修改：': 'changed: ', '已关闭': 'off', '已关闭，按 ': 'off, press ',
    '已写入，配置会自动重载': 'written; the profile reloads automatically',
    '已切换到「': 'Switched to "', '已创建「': 'Created "',
    '已删除「': 'Deleted "', '已删除，剩余 ': 'deleted, remaining ', '已取消': 'cancelled',
    '已导入「': 'Imported "', '已开启（等待目标窗口）': 'on (waiting for the target window)',
    '已把 <b>': 'Added <b>', '已映射的键不再传给应用': 'mapped keys are not forwarded to apps',
    '已添加到「': 'Added to "', '已清空「': 'Cleared "',
    '已经在 input 组里，但 uinput 模块没加载，或者 udev 规则还没生效。':
        'already in the input group, but uinput is not loaded or the udev rule has not applied.',
    '已设置取消位置': 'Cancel position set', '应用于显示器': 'Apply to output',
    '开关映射': 'Toggle mapping', '开关热键': 'Toggle hotkey',
    '开启了仅聚焦指定窗口时生效，但没有窗口规则（等于不限制）':
        'focused-window-only mode is on but there are no window rules, so it has no effect',
    '开启映射': 'Enable mapping', '开始编辑布局': 'Start editing layout',
    '引擎已退出（code ': 'engine exited (code ', '引擎调度': 'Engine scheduling',
    '当前桌面不支持 wlr-layer-shell，HUD 不可用':
        'this desktop does not support wlr-layer-shell, so the HUD is unavailable',
    '当前桌面（': 'current desktop (',
    '手指最多拖多远，占显示器高度的比例（默认 0.1）':
        'maximum finger travel as a fraction of output height (default 0.1)',
    '打印给 AI agent 的使用说明': 'Print usage notes for AI agents',
    '打开布局编辑器': 'Open layout editor', '打开缓存目录': 'Open cache folder',
    '打开编辑器，在游戏画面上点击要触摸的位置，再按下对应的键。':
        'Open the editor, click the touch position on the game screen, then press the key.',
    '打开配置目录': 'Open profile folder',
    '找不到 libgtk4-layer-shell，请安装 gtk4-layer-shell':
        'libgtk4-layer-shell not found; install gtk4-layer-shell',
    '找不到 niri IPC socket，需要在 niri 会话中运行':
        'niri IPC socket not found; run this inside a niri session',
    '找不到 pkexec，请在终端里运行下面的命令':
        'pkexec not found; run the following command in a terminal',
    '技能': 'Skill', '技能按钮中心的横坐标，0..1 或百分比': 'Skill button centre X, 0..1 or percent',
    '技能按钮中心的纵坐标': 'Skill button centre Y', '技能键': 'Skill key',
    '技能键没有设置取消位置：按住时点右键不能取消施法（--cancel X,Y）':
        'no cancel position set for the skill key: right-click cannot cancel a cast (--cancel X,Y)',
    '技能键的取消位置 X,Y（none 清除）': 'Skill cancel position X,Y (none clears)',
    '技能键（按住用鼠标选方向，松开释放）：KEY X Y':
        'Skill key (hold, aim with mouse, release to cast): KEY X Y',
    '拖动范围（也可在画面上滚动滚轮）': 'Drag range (scroll on screen too)',
    '按 ': 'Press ', '按下「': 'Press "', '按下按键…': 'Press a key…',
    '按下按键或组合键…': 'Press a key or combination…',
    '按下要绑定的键或鼠标按键，可配合 Ctrl/Alt/Shift（Esc 取消）':
        'Press the key or mouse button to bind, optionally with Ctrl/Alt/Shift (Esc cancels)',
    '按住': 'Hold', '按住按键时移动鼠标选择方向，松开释放；\n不动鼠标直接按就是快速施法':
        'Hold and move the mouse to aim, release to cast;\npress without moving for a quick cast',
    '按住显示': 'Show while held', '按住选方向、松开释放（MOBA 的技能键）':
        'Hold to aim, release to cast (MOBA skill key)',
    '按键已被别的按键点使用时，改绑到这里': 'when the key is used by another point, rebind it here',
    '按键点': 'Point', '按键，如 j、space、ctrl+q': 'Key, e.g. j, space, ctrl+q',
    '按键，如 q、e、ctrl+q': 'Key, e.g. q, e, ctrl+q',
    '提示：视角会占用鼠标。建议在高级设置里开启「仅聚焦指定软件窗口时生效」':
        'Note: a look area captures the mouse. Enable focused-window-only mode in Advanced settings.',
    '摇杆': 'Joystick', '摇杆的 上,左,下,右': 'Joystick up,left,down,right',
    '摇杆请用 --keys 上,左,下,右': 'Use --keys up,left,down,right for a joystick',
    '摇杆：X Y': 'Joystick: X Y', '放弃修改': 'Discard changes', '文件夹': 'Folder',
    '新建空配置': 'New empty profile', '新建配置': 'New profile', '新建配置…': 'New profile…',
    '新配置名称': 'New profile name', '无取消位置': 'No cancel position',
    '无效的坐标：': 'Invalid coordinates: ', '无效的布尔值：': 'Invalid boolean: ',
    '无效的按键：': 'Invalid key: ', '无效的配置名：': 'Invalid profile name: ',
    '无法访问 /dev/uinput': 'Cannot access /dev/uinput',
    '无法通过 hyprctl 把触摸映射到 ': 'Cannot map touch to the output with hyprctl: ',
    '无法通过 sway IPC 把触摸映射到 ': 'Cannot map touch to the output with sway IPC: ',
    '映射已': 'mapping ', '映射生效时，这些键只会变成触摸，游戏收不到按键本身':
        'while mapping is active these keys only produce touches; the game does not receive the keys',
    '显示 HUD': 'Show HUD', '显示主窗口': 'Show main window', '显示器 ': 'Output ',
    '显示鼠标的键（默认 lctrl）': 'Key that shows the cursor (default lctrl)',
    '显示鼠标（点界面用）的按键': 'Key that shows the cursor for clicking the interface',
    '有视角区域时鼠标会被占用：建议开启仅聚焦指定窗口时生效（set only-focused true），否则切到别的窗口鼠标仍被占用，只能按显示鼠标的键或用开关热键':
        'A look area captures the mouse: enable focused-window-only mode (set only-focused true), otherwise the mouse stays captured in other windows and you must use the cursor key or toggle hotkey',
    '未知的修饰键：': 'Unknown modifier: ', '未知的按键：': 'Unknown key: ',
    '未绑定': 'Unbound', '未设置': 'Not set', '权限已就绪': 'Permissions ready',
    '查看状态': 'View status', '查看配置': 'View profile', '桌面': 'Desktop',
    '横坐标，0..1 或百分比': 'X coordinate, 0..1 or percent',
    '每个配置只有一个视角区域': 'Each profile has only one look area',
    '没有 /dev/uinput 写权限（安装包会带 udev 规则；或检查 uinput 模块）':
        'no write permission on /dev/uinput (the package installs a udev rule; check the uinput module)',
    '没有其他窗口': 'no other windows', '没有名为 ': 'no output named ', '没有名为「': 'no profile named "',
    '没有打开的窗口匹配窗口规则（游戏还没开？）': 'no open window matches the rules (is the game running?)',
    '没有按键点': 'no points', '没有第 ': 'no point ',
    '没有设置显示器（key2touch set output <名字>）': 'no output set (key2touch set output <name>)',
    '没有这些按键点：': 'no such points: ', '没有这条规则：': 'no such rule: ',
    '没能获得授权：请在终端里运行下面的命令': 'could not gain permission; run the following in a terminal',
    '活动范围半径，占显示器高度的比例（默认 0.22）': 'active radius as a fraction of output height (default 0.22)',
    '活动范围（手指移出范围会回到中心重新按下）': 'active area (the finger recentres when it moves out)',
    '添加按键点': 'Add point', '添加规则，例如 waydroid.*': 'Add a rule, e.g. waydroid.*',
    '清空': 'Clear', '清空当前配置的所有按键点？': 'Clear all points in the current profile?',
    '清空按键点': 'Clear points', '游戏窗口所在的显示器': 'Output with the game window',
    '游戏里「取消施法」的位置 X,Y；按住时点右键取消': 'Game cancel-cast position X,Y; right-click while held to cancel',
    '游戏里移动鼠标即拖动视角；松开一会儿手指会抬起':
        'moving the mouse in the game drags the view; the finger lifts shortly after release',
    '灵敏度': 'Sensitivity', '灵敏度（默认 1.0）': 'Sensitivity (default 1.0)',
    '点击': 'Tap', '点击、技能键的按键': 'Key for tap and skill points',
    '点击后按下新的按键或组合键': 'Click, then press the new key or combination',
    '点击和技能键请用 --key': 'Use --key for tap and skill points',
    '点击游戏里「取消施法」的位置（右键或 Esc 放弃）':
        'Click the cancel-cast position in the game (right-click or Esc to cancel)',
    '点击画面上的取消位置…': 'Click the cancel position on screen…',
    '点击：KEY X Y': 'Tap: KEY X Y', '焦点切到其他窗口时，键盘照常使用': 'the keyboard works normally when another window has focus',
    '生效中': 'Active', '用鼠标拖动视角（每个配置一个）': 'Drag the view with the mouse (one per profile)',
    '确定': 'OK', '窗口': 'Window', '窗口匹配规则': 'Window rules', '第 ': 'point ',
    '等待匹配的窗口获得焦点': 'Waiting for a matching window to gain focus',
    '管理配置': 'Manage profiles', '类型': 'Type', '纵坐标，0..1 或百分比': 'Y coordinate, 0..1 or percent',
    '绑定': 'Binding', '给 AI agent 的说明：key2touch agent-help': 'Notes for AI agents: key2touch agent-help',
    '编辑中': 'Editing', '编辑布局': 'Edit layout', '编辑布局中': 'Editing layout',
    '编辑按键点': 'Edit point', '编辑热键': 'Edit hotkey', '缺少子命令': 'Missing subcommand',
    '自检配置（越界、重叠、显示器、权限…）': 'Check profile (range, overlap, output, permissions…)',
    '范围重叠': 'overlapping ranges', '要操作的配置（默认：正在使用的配置）': 'Profile to operate on (default: active profile)',
    '视角': 'Look', '视角、技能键的灵敏度': 'Sensitivity for look and skill points',
    '视角区域的 size 最小为 ': 'minimum size for a look area is ',
    '视角区域（鼠标拖动视角）：X Y': 'Look area (mouse drags the view): X Y',
    '视角：单击切换 / 按住显示': 'Look: click to toggle / hold to show',
    '视角：显示鼠标的键': 'Look: key that shows the cursor',
    '让正在运行的 key2touch 切换到此配置': 'Switch the running key2touch to this profile',
    '设置': 'Settings', '设置 ': 'Set ', '设置取消位置': 'Set cancel position',
    '读不了 /dev/input/event*：把用户加入 input 组后重新登录':
        'cannot read /dev/input/event*: add the user to the input group and log in again',
    '输出 JSON（给脚本 / AI agent）': 'Output JSON (for scripts / AI agents)',
    '运行状态': 'Status', '还没有任何配置，先运行 key2touch profile new <名字>':
        'no profiles yet; run key2touch profile new <name>',
    '还没有按键点': 'no points', '还没有按键点，先编辑布局': 'no points yet; edit the layout first',
    '这个配置已经有视角区域了（每个配置一个；用 point set 修改）':
        'this profile already has a look area (one per profile; use point set to edit)',
    '退出': 'Quit', '退出正在运行的 key2touch': 'Quit the running key2touch',
    '通用': 'General', '配置「': 'Profile "', '配置文件会被删除，无法恢复。': 'The profile file will be deleted and cannot be recovered.',
    '配置管理': 'Profile manager', '重命名…': 'Rename…', '重命名配置': 'Rename profile',
    '重新创建虚拟触摸屏（映射生效但游戏没反应时）':
        'Recreate the virtual touchscreen (when mapping is on but the game does not respond)',
    '重新检测': 'Recheck', '重新登录后生效': 'takes effect after logging in again',
    '重置触摸（按键没反应时）': 'Reset touch (when keys do not respond)',
    '键盘': 'Keyboard', '需要 X,Y 两个坐标：': 'Two coordinates X,Y are required: ',
    "需要窗口 app_id 规则，例如 'waydroid.*'": "A window app_id rule is required, e.g. 'waydroid.*'",
    '高级': 'Advanced', '高级设置': 'Advanced settings', '默认': 'Default',
    '（可用 ctrl / alt / shift / super）': '(ctrl / alt / shift / super available)',
    '（太小转视角会一顿一顿）': '(too small makes the view stutter)',
    '（应在 0..1 / 0%..100%）': '(should be 0..1 / 0%..100%)',
    '（无焦点信息）': '(no focus information)', '（没有按键点）': '(no points)',
    '（没有规则）': '(no rules)', '（没有配置）': '(no profiles)',
    '（用 0..1 的小数或百分比，如 0.8 或 80%）': '(use 0..1 or a percent, e.g. 0.8 or 80%)',
    '（用 true / false）': '(use true / false)',
    '）无法获取窗口焦点，请用开关热键手动开关': ') could not get window focus; toggle manually with the hotkey',
    '），日志在缓存目录的 engine.log': '), logs are in engine.log in the cache folder',
    '＋ 摇杆': '+ Joystick', '＋ 新建配置…': '+ New profile…', '＋ 视角': '+ Look',
    '，然后重新登录。': ', then log in again.', '；确定要用就加 --force）': '; add --force to use it anyway)',
    '，': ', ', '：': ': ', '（': '(', '）': ')', '「': "'", '」': "'",
    '放在': 'in ', '到哪': 'which ', '到': ' to ', '哪': 'which ',
    # Residual fragments found after the first pass.
    '\n\n被引用的文件放at ~/.config/key2touch/, 切换显示器时由 key2touch 自动改写。':
        '\n\nReferenced files are placed in ~/.config/key2touch/ and rewritten by key2touch when the output changes.',
    '  ← 匹配规则': '  ← window rules',
    '  热键 ': '  hotkey ',
    ' · 焦点 ': ' · focus ',
    ' · 配置 ': ' · profile ',
    '</b> group.\n注销并重新登录Desktop后, 再打开 key2touch。':
        '</b> group. Log out and back in, then open key2touch again.',
    'Hold按键时移动鼠标选择方向, 松开释放；\n不动鼠标直接按就是快速施法':
        'Hold and move the mouse to aim, release to cast;\npress without moving for a quick cast',
    'Left button空白处 添加按键  ·  Tap按键 重新Binding  ·  拖动 移动  ·  滚轮 调整大小  ·  Right button / Delete Delete  ·  Esc Save and exit':
        'Click empty space to add a key · click a key to rebind · drag to move · scroll to resize · right-click or Delete to remove · Esc to save and exit',
    'key2touch 要读取Keyboard、Create虚拟触摸屏, 需要把你的账户加入 <b>input</b> 组。\n加入后, 同一账户down运行的程序都能读取Keyboard输入。':
        'key2touch reads the keyboard and creates a virtual touchscreen, so your account must be in the <b>input</b> group. Afterwards, programs running under this account can read keyboard input.',
    'niri 只能通过自身配置指定触摸屏映射which 显示器, 所以需要at ~/.config/niri/config.kdl 末尾加这一行: \n\n':
        'niri requires its own config to map the touchscreen to an output; add this line at the end of ~/.config/niri/config.kdl:\n\n',
    '也可以在终端里运行: <tt>': 'You can also run this in a terminal: <tt>',
    '仅聚焦指定Window时生效的匹配规则': 'Rules for focused-window-only mode',
    '仅聚焦指定软件Window时生效': 'Only active when a matching window is focused',
    '仍然不行的话, 运行 <tt>key2touch check</tt> 查看原因。':
        'If it still fails, run <tt>key2touch check</tt> to see why.',
    '从 JSON 文件或标准输入导入配置': 'Import a profile from a JSON file or stdin',
    '从当前打开的Window添加': 'Add from an open window',
    '以 JSON 输出配置': 'Output profile as JSON',
    '位置 ': 'Position ', '当前焦点Window': 'Current focused window',
    '有Look区域时鼠标会被占用: 建议on仅聚焦指定Window时生效(set only-focused true), 否则切 to 别的Window鼠标仍被占用, 只能按show cursor的键或用Toggle hotkey':
        'A look area captures the mouse: enable focused-window-only mode (set only-focused true), otherwise the mouse stays captured in other windows and you must use the cursor key or toggle hotkey',
    '需要输入设备权限': 'Input device permission required',
    '；OK要用就加 --force)': '; add --force to use it anyway)',
    # Source literals are split across lines; translate the fragments too.
    '被引用的文件放at ~/.config/key2touch/, 切换显示器时由 key2touch 自动改写。':
        'Referenced files are placed in ~/.config/key2touch/ and rewritten when the output changes.',
    '注销并重新登录Desktop后, 再打开 key2touch。': 'Log out and back in, then open key2touch again.',
    'Hold按键时移动鼠标选择方向, 松开释放；': 'Hold and move the mouse to aim, release to cast;',
    '不动鼠标直接按就是快速施法': 'press without moving for a quick cast',
    'Left button空白处 添加按键  ·  Tap按键 重新Binding  ·  拖动 移动  ·  滚轮 调整大小  ·  ':
        'Click empty space to add a key · click a key to rebind · drag to move · scroll to resize · ',
    'Right button / Delete Delete  ·  Esc Save and exit': 'right-click or Delete to remove · Esc to save and exit',
    'key2touch 要读取Keyboard、Create虚拟触摸屏, 需要把你的账户加入 <b>input</b> 组。':
        'key2touch reads the keyboard and creates a virtual touchscreen, so add your account to the <b>input</b> group.',
    '加入后, 同一账户down运行的程序都能读取Keyboard输入。':
        'Afterwards, programs running under this account can read keyboard input.',
    'niri 只能通过自身配置指定触摸屏映射which 显示器, 所以需要at ~/.config/niri/config.kdl 末尾加这一行: ':
        'niri needs its own config to map touch to an output; add this line at the end of ~/.config/niri/config.kdl: ',
    r'niri 只能通过自身配置指定触摸屏映射which 显示器, 所以需要at ~/.config/niri/config.kdl 末尾加这一行: \n\n':
        'niri needs its own config to map touch to an output; add this line at the end of ~/.config/niri/config.kdl:\n\n',
    'niri 只能通过自身配置指定触摸屏映射which 显示器, 所以需要at ~/.config/niri/config.kdl 末尾加这一行':
        'niri needs its own config to map touch to an output; add this line at the end of ~/.config/niri/config.kdl',
    'niri 只能通过自身配置指定触摸屏映射which 显示器, ':
        'niri needs its own config to map touch to an output, ',
    '所以需要at ~/.config/niri/config.kdl 末尾加这一行: ':
        'so add this line at the end of ~/.config/niri/config.kdl: ',
    'OK要用就加 --force)': 'OK, add --force to use it anyway)',
    '有Look区域时鼠标会被占用: 建议on仅聚焦指定Window时生效(set only-focused true), ':
        'A look area captures the mouse: enable focused-window-only mode (set only-focused true), ',
    '否则切 to 别的Window鼠标仍被占用, 只能按show cursor的键或用Toggle hotkey':
        'otherwise the mouse stays captured in other windows; use the cursor key or toggle hotkey',
}


def main():
    files = sorted(glob.glob(os.path.join(DST, 'key2touch', '*.py'))
                   + glob.glob(os.path.join(DST, 'key2touch', 'desktop', '*.py')))
    if not files:
        print('key2touch is not installed at', DST)
        return 1
    changed = 0
    for name in files:
        with open(name, encoding='utf-8') as fh:
            text = fh.read()
        out = text
        for zh, en in sorted(T.items(), key=lambda kv: -len(kv[0])):
            # Never introduce a double quote: the source uses double-quoted
            # Python string literals and f-strings.
            en = en.replace('"', "'")
            if zh in out:
                out = out.replace(zh, en)
        if out != text:
            with open(name, 'w', encoding='utf-8') as fh:
                fh.write(out)
            changed += 1
            print('translated', name)
    print('done;', changed, 'files changed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
