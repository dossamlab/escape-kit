/**
 * 이미지 크기 조회 (JPEG·PNG 공용) — 나노바나나 산출물이 확장자만 .png인
 * JPEG로 오기 때문에 후처리 전 실제 해상도를 확인하는 데 쓴다.
 * 사용: node scripts/img-size.mjs <파일…>
 */
import { readFileSync } from "node:fs";

function size(buf) {
  if (buf.readUInt32BE(0) === 0x89504e47) {
    return { type: "PNG", w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 1) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const m = buf[i + 1];
      // SOFn 프레임 헤더에만 크기가 있다 (DHT=C4·DNL=C8·DAC=CC 제외)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { type: "JPEG", h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return { type: "unknown", w: 0, h: 0 };
}

for (const p of process.argv.slice(2)) {
  const s = size(readFileSync(p));
  console.log(`${p.padEnd(46)} ${s.type.padEnd(8)} ${s.w}×${s.h}`);
}
