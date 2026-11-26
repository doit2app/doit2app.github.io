// 아주 작은 ZIP 쓰기·읽기 (압축하지 않고 담기만 하는 방식).
// 사진은 이미 JPEG로 압축되어 있어 다시 압축해도 거의 안 줄어든다.
// 한 파일씩 바로 디스크에 써서, 사진이 수백 장이어도 메모리를 적게 쓴다.
// 일반 ZIP 형식이라 컴퓨터에서도 열린다. (4GB가 넘는 ZIP64는 지원하지 않는다)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function dosTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

type CentralEntry = { name: Uint8Array; crc: number; size: number; offset: number; time: number; date: number };

export class ZipWriter {
  private offset = 0;
  private entries: CentralEntry[] = [];
  private write: (bytes: Uint8Array) => void;

  constructor(write: (bytes: Uint8Array) => void) {
    this.write = write;
  }

  addFile(name: string, data: Uint8Array, mtime = new Date()) {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const { time, date } = dosTime(mtime);
    const h = new Uint8Array(30 + nameBytes.length);
    const v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true); // 로컬 헤더
    v.setUint16(4, 20, true); // 필요한 버전
    v.setUint16(6, 0x0800, true); // 파일 이름 UTF-8
    v.setUint16(8, 0, true); // 압축 없음
    v.setUint16(10, time, true);
    v.setUint16(12, date, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, nameBytes.length, true);
    v.setUint16(28, 0, true);
    h.set(nameBytes, 30);
    this.entries.push({ name: nameBytes, crc, size: data.length, offset: this.offset, time, date });
    this.emit(h);
    this.emit(data);
  }

  finish() {
    const cdStart = this.offset;
    for (const e of this.entries) {
      const h = new Uint8Array(46 + e.name.length);
      const v = new DataView(h.buffer);
      v.setUint32(0, 0x02014b50, true); // 중앙 디렉터리
      v.setUint16(4, 20, true);
      v.setUint16(6, 20, true);
      v.setUint16(8, 0x0800, true);
      v.setUint16(10, 0, true);
      v.setUint16(12, e.time, true);
      v.setUint16(14, e.date, true);
      v.setUint32(16, e.crc, true);
      v.setUint32(20, e.size, true);
      v.setUint32(24, e.size, true);
      v.setUint16(28, e.name.length, true);
      v.setUint32(42, e.offset, true);
      h.set(e.name, 46);
      this.emit(h);
    }
    const cdSize = this.offset - cdStart;
    const end = new Uint8Array(22);
    const v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, this.entries.length, true);
    v.setUint16(10, this.entries.length, true);
    v.setUint32(12, cdSize, true);
    v.setUint32(16, cdStart, true);
    this.emit(end);
  }

  private emit(b: Uint8Array) {
    this.write(b);
    this.offset += b.length;
  }
}

export type ZipEntry = { name: string; size: number; crc: number; method: number; headerOffset: number };

/** 파일 끝의 중앙 디렉터리를 읽어 목록을 돌려준다. read(위치, 길이) */
export function readZipEntries(read: (offset: number, length: number) => Uint8Array, fileSize: number): ZipEntry[] {
  const tailLen = Math.min(fileSize, 22 + 65535);
  const tail = read(fileSize - tailLen, tailLen);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP 파일이 아니에요');
  const ev = new DataView(tail.buffer, tail.byteOffset + eocd, 22);
  const count = ev.getUint16(10, true);
  const cdSize = ev.getUint32(12, true);
  const cdOffset = ev.getUint32(16, true);
  const cd = read(cdOffset, cdSize);
  const v = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const out: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP 목록이 망가졌어요');
    const method = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const headerOffset = v.getUint32(p + 42, true);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, size, crc, method, headerOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** 항목의 내용을 읽는다 (압축 없는 항목만) */
export function readZipEntry(read: (offset: number, length: number) => Uint8Array, e: ZipEntry): Uint8Array {
  if (e.method !== 0) throw new Error(`압축된 항목은 읽을 수 없어요: ${e.name}`);
  const h = read(e.headerOffset, 30);
  const v = new DataView(h.buffer, h.byteOffset, 30);
  if (v.getUint32(0, true) !== 0x04034b50) throw new Error('ZIP 항목이 망가졌어요');
  const start = e.headerOffset + 30 + v.getUint16(26, true) + v.getUint16(28, true);
  const data = read(start, e.size);
  if (crc32(data) !== e.crc) throw new Error(`파일이 손상됐어요: ${e.name}`);
  return data;
}
