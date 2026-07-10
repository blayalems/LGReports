// Minimal, dependency-free ZIP (store-only) reader/writer — enough to produce and
// parse the tiny OOXML subset a weekly report needs. No external xlsx library means
// no supply-chain surface for something this small.

export interface ZipFileInput {
  name: string;
  data: string | Uint8Array;
}

const crcTable = (() => {
  const t: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zip(files: ZipFileInput[]): Blob {
  const enc = new TextEncoder();
  const parts: (Uint8Array | string)[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  files.forEach((f) => {
    const nameB = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const head = new Uint8Array(30 + nameB.length);
    const dv = new DataView(head.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true);
    dv.setUint32(22, data.length, true);
    dv.setUint16(26, nameB.length, true);
    head.set(nameB, 30);
    parts.push(head, data);

    const cent = new Uint8Array(46 + nameB.length);
    const cv = new DataView(cent.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameB.length, true);
    cv.setUint32(42, offset, true);
    cent.set(nameB, 46);
    central.push(cent);
    offset += head.length + data.length;
  });

  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end] as BlobPart[], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function unzip(buf: ArrayBuffer): Promise<Record<string, string>> {
  const bytes = new Uint8Array(buf);
  const dv = new DataView(buf);
  let eo = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eo = i;
      break;
    }
  }
  if (eo < 0) throw new Error('Not a valid zip file');
  const n = dv.getUint16(eo + 10, true);
  let p = dv.getUint32(eo + 16, true);
  const out: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true);
    const cs = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true);
    const el = dv.getUint16(p + 30, true);
    const cl = dv.getUint16(p + 32, true);
    const lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.slice(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(lo + 26, true);
    const lel = dv.getUint16(lo + 28, true);
    const ds = lo + 30 + lnl + lel;
    const cd = bytes.slice(ds, ds + cs);
    if (method === 0) {
      out[name] = new TextDecoder().decode(cd);
    } else {
      out[name] = await new Response(new Blob([cd]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    }
    p += 46 + nl + el + cl;
  }
  return out;
}
