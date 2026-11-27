'use strict';
/**
 * DNS 预设的纯 Node 测试（不需要网络或模拟器）。
 * 覆盖 0.6.4 引入的 engine.dnsPreset，以及老配置里只有 fastDns 时的推导。
 * 运行：node test/dns-preset-test.js
 */
const assert = require('assert/strict');
const { DNS_PRESETS, dnsServersFor } = require('../src/core/emulator');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}\n    ${e.message}`); }
}

console.log('\n[emulator.js DNS 预设]');

test('国内预设是默认的阿里 / 腾讯公共 DNS', () => {
  assert.equal(DNS_PRESETS.cn, '223.5.5.5,119.29.29.29');
  assert.equal(dnsServersFor({ engine: { dnsPreset: 'cn' } }), DNS_PRESETS.cn);
});

test('Cloudflare 与 Google 预设返回各自的地址', () => {
  assert.equal(dnsServersFor({ engine: { dnsPreset: 'cloudflare' } }), '1.1.1.1,1.0.0.1');
  assert.equal(dnsServersFor({ engine: { dnsPreset: 'google' } }), '8.8.8.8,8.8.4.4');
});

test('off 不返回任何地址， guest 继续使用主机 DNS', () => {
  assert.equal(dnsServersFor({ engine: { dnsPreset: 'off' } }), '');
});

test('老配置 fastDns=false 视为关闭，fastDns=true 视为国内预设', () => {
  assert.equal(dnsServersFor({ engine: { fastDns: false } }), '');
  assert.equal(dnsServersFor({ engine: { fastDns: true } }), DNS_PRESETS.cn);
});

test('未知预设安全回落到国内预设，不会因为拼写错误关掉网络加速', () => {
  assert.equal(dnsServersFor({ engine: { dnsPreset: 'typo' } }), DNS_PRESETS.cn);
});

test('配置缺失时仍返回国内预设', () => {
  assert.equal(dnsServersFor(undefined), DNS_PRESETS.cn);
  assert.equal(dnsServersFor({}), DNS_PRESETS.cn);
});

console.log(`\n结果：${passed} 通过，${failed} 失败\n`);
process.exit(failed ? 1 : 0);
