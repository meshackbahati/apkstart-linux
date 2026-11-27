'use strict';
/**
 * 底座注册表
 *
 * **只有一个底座：自带运行时（builtin）。**
 *
 * 0.5.6 起，ApkStart 在任何机器、任何情况下都只跑自己的 Android 运行时
 * （自带的 adb / emulator / 系统镜像），不再探测、接管、驱动任何第三方模拟器
 * （MuMu / 雷电 / 蓝叠 / WSA / FydeOS），也不提供「连接已有运行时」的模式。
 *
 * 为什么把可选底座整条链路删掉，而不是只留个开关关掉：
 *   - 只要代码里还留着探测分支，用户机器上装了 MuMu 就随时可能被「顺手接管」，
 *     表现成「点开 ApkStart 却跑的是别人家的模拟器」，数据、存档、镜像都不在自己以为的地方；
 *   - 第三方模拟器升级、换端口、改配置都会让 ApkStart 直接失效，而这些不是我们能修的；
 *   - 商店包 / 便携版只带自己的运行时，本来也不允许捆绑或依赖任何第三方模拟器。
 * 所以这里保留注册表的形式（上层接口不变），内容固定为 builtin：
 * 读设置、读残留配置、导入旧 settings.json 都不会再切到别的底座。
 */

const fs = require('fs');
const path = require('path');
const { Backend, CAPS } = require('./base');
const { BuiltinBackend } = require('./builtin');
const { WaydroidBackend } = require('./waydroid');
const { AtlBackend } = require('./atl');

// Waydroid is the recommended Linux backend: each app opens as its own native
// window, the container shares the host kernel (about 0.9 GB resident) and it
// uses the host's Mesa graphics stack. When no backend is chosen explicitly,
// Linux picks Waydroid as soon as it is installed and initialised
// (`apkstart init --backend waydroid`); until then builtin keeps working out
// of the box. ATL is experimental and is only used when selected.
const REGISTRY = [
  BuiltinBackend,
  WaydroidBackend,
  AtlBackend,
];

/** 唯一底座。保留这个常量，是给「以后真要加底座」的地方留个明确落点。 */
const ONLY = 'builtin';

function byId(id) {
  return REGISTRY.find((B) => B.id === id) || null;
}

/** 给界面用的描述清单（只留静态信息，能安全序列化） */
function describe() {
  return REGISTRY.map((B) => ({
    id: B.id,
    label: B.label,
    summary: B.summary,
    embedCapable: B.embedCapable,
  }));
}

/**
 * 按设置创建一个底座实例。
 *
 * 注意：**故意忽略 settings.engine.mode**。老版本可能留下 mode=mumu / fydeos / attach，
 * 手改 settings.json 也可能写成别的值 —— 这些都必须被当成 builtin，
 * 否则「无论什么情况都独立运行」就是一句空话。返回值里的 id 一定是 'builtin'。
 *
 * @param {object} o { appRoot, settings, runtime, store, log, id }
 * @returns {{ backend: Backend, Cls: Function, id: string }}
 */
/**
 * Is Waydroid installed and initialised on this machine? Cheap, synchronous,
 * and side-effect free: it only looks for the binary and the system image.
 */
function waydroidReady({ platform = process.platform, env = process.env, exists = fs.existsSync } = {}) {
  if (platform !== 'linux') return false;
  const dirs = String(env.PATH || '').split(path.delimiter).filter(Boolean);
  const hasBinary = dirs.some((d) => exists(path.join(d, 'waydroid')));
  const hasImage = ['/var/lib/waydroid/images/system.img', '/usr/share/waydroid-extra/images/system.img']
    .some((f) => exists(f));
  return hasBinary && hasImage;
}

/** Backend used when the settings name none: Waydroid on Linux when ready, otherwise builtin. */
function defaultId(probe = waydroidReady) {
  return probe() ? 'waydroid' : ONLY;
}

function create({ appRoot, runtime, store, log, id: forced, settings, probe } = {}) {
  const wanted = forced || (settings && settings.runtime && settings.runtime.backend) || defaultId(probe);
  const id = byId(wanted) ? wanted : ONLY;
  const Cls = byId(id) || BuiltinBackend;
  const backend = new Cls(appRoot, { runtime, store, log });
  return { backend, Cls, id: Cls.id };
}

/**
 * 自动挑选底座。现在只有一个，永远返回 builtin，不做任何探测：
 * 探测本身就会去碰第三方模拟器的目录 / 注册表，那正是要去掉的行为。
 */
async function autoPick(probe = waydroidReady) {
  return probe() ? { id: 'waydroid', reason: 'waydroid-ready' } : { id: ONLY, reason: 'builtin-fallback' };
}

module.exports = {
  REGISTRY, ONLY, CAPS, byId, describe, create, autoPick, waydroidReady, defaultId, Backend,
};
