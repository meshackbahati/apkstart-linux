'use strict';
/**
 * APK signature verification for downloaded packages.
 *
 * The ApkStart installer normally relies on the Android package manager to
 * reject a package whose signature changed. That protection is absent on the
 * ATL backend and when a package is fetched outside Android, so this module
 * reads the APK Signing Block directly and verifies APK Signature Scheme v2.
 * It is an independent implementation using Node's crypto primitives; it does
 * not copy code from any other project.
 *
 * Public API:
 *   readSigner(apkPath) -> { scheme, certSha256 } | null
 *   verifyV2(apkPath, expectedCertSha256?) -> { ok, certSha256?, reason? }
 */
const fs = require('fs');
const crypto = require('crypto');

const MAGIC = Buffer.from('APK Sig Block 42', 'ascii');
const V2_ID = 0x7109871a;
const V3_ID = 0xf05368c0;
const V31_ID = 0x1b93ad61;
const CHUNK = 1024 * 1024;
const MAX_APK = 2 * 1024 * 1024 * 1024;
const EOCD_MAGIC = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const ALGORITHMS = { 0x0103: 'sha256', 0x0104: 'sha512' };

function fail(reason) {
  return { ok: false, reason };
}

class Reader {
  constructor(fd) { this.fd = fd; }
  read(offset, length) {
    const buf = Buffer.alloc(length);
    let got = 0;
    while (got < length) {
      const n = fs.readSync(this.fd, buf, got, length - got, offset + got);
      if (n <= 0) throw new Error('truncated APK');
      got += n;
    }
    return buf;
  }
}

/** Decode a little-endian uint32 length prefix and the bytes it describes. */
function lp(buf, offset, limit = buf.length) {
  if (offset + 4 > limit) throw new Error('truncated length prefix');
  const n = buf.readUInt32LE(offset);
  if (n > limit - offset - 4) throw new Error('length prefix exceeds buffer');
  return { value: buf.subarray(offset + 4, offset + 4 + n), next: offset + 4 + n };
}

function sequence(buf) {
  const out = [];
  let o = 0;
  while (o < buf.length) {
    const item = lp(buf, o);
    out.push(item.value);
    o = item.next;
  }
  return out;
}

function u32le(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

function findEocd(reader, size) {
  const span = Math.min(size, 0x10000 + 22);
  const tail = reader.read(size - span, span);
  for (let i = tail.length - 22; i >= 0; i -= 1) {
    if (tail.subarray(i, i + 4).equals(EOCD_MAGIC)) {
      return { offset: size - span + i, cdOffset: tail.readUInt32LE(i + 16) };
    }
  }
  return null;
}

/** Locate the signing block and return the reader plus its section offsets. */
function openBlock(apkPath) {
  const fd = fs.openSync(apkPath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    if (size > MAX_APK) throw new Error('APK is too large to verify');
    const reader = new Reader(fd);
    const eocd = findEocd(reader, size);
    if (!eocd || eocd.cdOffset < 32) throw new Error('no central directory');
    const magic = reader.read(eocd.cdOffset - 16, 16);
    if (!magic.equals(MAGIC)) throw new Error('no APK signing block');
    const blockSize = Number(reader.read(eocd.cdOffset - 24, 8).readBigUInt64LE(0));
    if (blockSize < 24 || blockSize > eocd.cdOffset) throw new Error('invalid signing block size');
    const blockStart = eocd.cdOffset - blockSize - 8;
    const pairs = reader.read(blockStart + 8, blockSize - 24);
    return { fd, reader, size, eocd, blockStart, pairs };
  } catch (e) {
    fs.closeSync(fd);
    throw e;
  }
}

function idPairs(pairs) {
  const out = new Map();
  let o = 0;
  while (o + 12 <= pairs.length) {
    const len = Number(pairs.readBigUInt64LE(o));
    if (len < 4 || o + 8 + len > pairs.length) break;
    const id = pairs.readUInt32LE(o + 8);
    if (!out.has(id)) out.set(id, pairs.subarray(o + 12, o + 8 + len));
    o += 8 + len;
  }
  return out;
}

/** Return the signer's certificate from the first signer of a v2/v3 block. */
function firstCert(block) {
  const signers = sequence(lp(block, 0).value);
  if (!signers.length) throw new Error('no signers');
  const signer = signers[0];
  const signed = lp(signer, 0);
  const digests = lp(signed.value, 0);
  const certificates = sequence(lp(signed.value, digests.next).value);
  if (!certificates.length) throw new Error('no certificate');
  return certificates[0];
}

/** List signer certificate hashes without verifying the cryptographic proof. */
function readSigner(apkPath) {
  let fd;
  let ctx;
  try {
    ctx = openBlock(apkPath);
    fd = ctx.fd;
    const ids = idPairs(ctx.pairs);
    for (const [name, id] of [['v3.1', V31_ID], ['v3', V3_ID], ['v2', V2_ID]]) {
      if (!ids.has(id)) continue;
      const cert = firstCert(ids.get(id));
      return { scheme: name, certSha256: crypto.createHash('sha256').update(cert).digest('hex') };
    }
    return null;
  } catch (_) {
    return null;
  } finally {
    if (fd) fs.closeSync(fd);
  }
}

/** Append one 0xa5-prefixed digest per 1 MiB chunk of a section. */
function chunkDigests(reader, start, end, patch, hashName, out) {
  for (let o = start; o < end; o += CHUNK) {
    const len = Math.min(CHUNK, end - o);
    const chunk = reader.read(o, len);
    if (patch && o === start && len >= 20) {
      // Signing changes the recorded central-directory offset in the EOCD.
      chunk.writeUInt32LE(patch, 16);
    }
    out.push(crypto.createHash(hashName).update(Buffer.from([0xa5])).update(u32le(len)).update(chunk).digest());
  }
}

/** The three sections are hashed as one stream of chunks, then folded once. */
function contentDigest(ctx, hashName) {
  const chunks = [];
  chunkDigests(ctx.reader, 0, ctx.blockStart, 0, hashName, chunks);
  chunkDigests(ctx.reader, ctx.eocd.cdOffset, ctx.eocd.offset, 0, hashName, chunks);
  chunkDigests(ctx.reader, ctx.eocd.offset, ctx.size, ctx.blockStart, hashName, chunks);
  const h = crypto.createHash(hashName).update(Buffer.from([0x5a])).update(u32le(chunks.length));
  for (const d of chunks) h.update(d);
  return h.digest();
}

/** Verify the v2 signature and the three-section content digest. */
function verifyV2(apkPath, expectedCertSha256) {
  let ctx;
  try {
    ctx = openBlock(apkPath);
    const ids = idPairs(ctx.pairs);
    if (!ids.has(V2_ID)) return fail('APK Signature Scheme v2 block not found');
    const signers = sequence(lp(ids.get(V2_ID), 0).value);
    if (signers.length !== 1) return fail('expected exactly one v2 signer');

    const signer = signers[0];
    const signedPart = lp(signer, 0);
    const signedData = signedPart.value;
    const digestsPart = lp(signedData, 0);
    const signatures = sequence(lp(signer, signedPart.next).value);
    const publicKey = lp(signer, lp(signer, signedPart.next).next).value;
    if (!signatures.length) return fail('no v2 signatures');

    const certs = sequence(lp(signedData, digestsPart.next).value);
    const cert = certs[0];
    const x509 = new crypto.X509Certificate(cert);
    const spki = x509.publicKey.export({ type: 'spki', format: 'der' });
    if (!spki.equals(publicKey)) return fail('public key does not match the certificate');

    const certSha256 = crypto.createHash('sha256').update(cert).digest('hex');
    if (expectedCertSha256 && certSha256 !== String(expectedCertSha256).toLowerCase()) {
      return fail(`unexpected signer certificate ${certSha256}`);
    }

    let verified = 0;
    for (const entry of signatures) {
      const alg = entry.readUInt32LE(0);
      if (!ALGORITHMS[alg]) continue;
      const sig = lp(entry, 4).value;
      try {
        if (crypto.verify(ALGORITHMS[alg], signedData, x509.publicKey, sig)) { verified = alg; break; }
      } catch (_) { /* try the next algorithm */ }
    }
    if (!verified) return fail('v2 signature is invalid');

    const digests = sequence(digestsPart.value);
    const hash = ALGORITHMS[verified];
    const actual = contentDigest(ctx, hash);
    for (const entry of digests) {
      const alg = entry.readUInt32LE(0);
      if (!ALGORITHMS[alg]) continue;
      const expected = lp(entry, 4).value;
      if (!expected.equals(actual)) return fail('APK content digest does not match the signature');
      return { ok: true, certSha256, scheme: 'v2' };
    }
    return fail('no supported content digest');
  } catch (e) {
    return fail(e.message || String(e));
  } finally {
    if (ctx) fs.closeSync(ctx.fd);
  }
}

module.exports = { readSigner, verifyV2, MAGIC, V2_ID };
