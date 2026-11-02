// 식약처 의약품 허가정보에서 품목명·업체명을 모두 내려받아 drugs.json으로 저장합니다.
// GitHub Actions에서 실행되며, 인증키는 저장소 Secrets(DRUG_KEY)에만 있습니다.
const fs = require('fs');
const API = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService08/getDrugPrdtPrmsnInq08';
const raw = (process.env.DRUG_KEY || '').trim();
if (!raw) { console.error('DRUG_KEY가 없습니다'); process.exit(1); }
const key = /%[0-9a-f]{2}/i.test(raw) ? decodeURIComponent(raw) : raw;
const ROWS = 100;

async function page(n) {
  for (let t = 1; t <= 4; t++) {
    try {
      const r = await fetch(`${API}?serviceKey=${encodeURIComponent(key)}&type=json&pageNo=${n}&numOfRows=${ROWS}`);
      const j = await r.json();
      if (j.OpenAPI_ServiceResponse) throw new Error(JSON.stringify(j.OpenAPI_ServiceResponse.cmmMsgHeader || {}));
      const h = j.header || {};
      if (h.resultCode && h.resultCode !== '00' && h.resultCode !== '0') throw new Error(h.resultMsg || h.resultCode);
      let it = (j.body || {}).items; if (it && it.item) it = it.item; if (it && !Array.isArray(it)) it = [it];
      return { items: (it || []).map(x => x.item || x), total: +((j.body || {}).totalCount || 0) };
    } catch (e) {
      if (t === 4) throw new Error(`${n}쪽 실패: ${e.message}`);
      await new Promise(r => setTimeout(r, 1500 * t));
    }
  }
}

(async () => {
  const first = await page(1);
  const pages = Math.ceil(first.total / ROWS);
  console.log(`전체 ${first.total}건, ${pages}쪽`);
  const all = [...first.items];
  for (let n = 2; n <= pages; n++) { all.push(...(await page(n)).items); if (n % 50 === 0) console.log(`${n}/${pages}`); }
  const seen = new Set(), out = [];
  for (const x of all) {
    const name = (x.ITEM_NAME || '').trim(); if (!name) continue;
    const row = [name, (x.ENTP_NAME || '').trim(), x.CANCEL_DATE ? 1 : 0], id = row.join('|');
    if (!seen.has(id)) { seen.add(id); out.push(row); }
  }
  if (out.length < 1000) { console.error('결과가 너무 적어 저장하지 않습니다:', out.length); process.exit(1); }
  fs.writeFileSync('drugs.json', JSON.stringify({ date: new Date().toISOString().slice(0, 10), items: out }));
  console.log(`저장: ${out.length}건`);
})().catch(e => { console.error(e.message); process.exit(1); });
