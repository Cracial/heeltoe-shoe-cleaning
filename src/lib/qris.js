'use strict';
// QRIS (standar EMVCo MPM): parsing TLV, CRC16-CCITT, dan konversi QRIS statis -> dinamis
// (menyisipkan nominal di tag 54). Ini cara umum UMKM memakai QRIS bank tanpa payment gateway.

function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function parseTLV(payload) {
  const out = [];
  let i = 0;
  while (i < payload.length) {
    const tag = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len) || i + 4 + len > payload.length) {
      throw new Error('Format QRIS tidak valid (TLV rusak di posisi ' + i + ')');
    }
    out.push({ tag, value: payload.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}

const tlv = (tag, value) => tag + String(value.length).padStart(2, '0') + value;

function build(fields) {
  const body = fields
    .filter((f) => f.tag !== '63')
    .sort((a, b) => Number(a.tag) - Number(b.tag))
    .map((f) => tlv(f.tag, f.value))
    .join('') + '6304';
  return body + crc16(body);
}

/** Validasi payload QRIS; kembalikan info merchant. Lempar Error jika tidak valid. */
function validate(payload) {
  const p = String(payload || '').trim();
  if (p.length < 30) throw new Error('Payload QRIS terlalu pendek');
  const fields = parseTLV(p);
  const crcField = fields.find((f) => f.tag === '63');
  if (!crcField) throw new Error('QRIS tidak memiliki CRC (tag 63)');
  const expected = crc16(p.slice(0, -4));
  if (expected !== crcField.value.toUpperCase()) throw new Error(`CRC QRIS salah (harusnya ${expected})`);
  const get = (t) => (fields.find((f) => f.tag === t) || {}).value || null;
  if (get('00') !== '01') throw new Error('Bukan payload QRIS/EMV yang valid (tag 00)');
  if (get('58') !== 'ID') throw new Error('Negara QRIS bukan ID');
  return {
    merchant: get('59'),
    city: get('60'),
    isStatic: get('01') === '11',
    amount: get('54') ? Number(get('54')) : null,
  };
}

/** Ubah QRIS statis menjadi dinamis dengan nominal tertentu (Rupiah, bilangan bulat). */
function toDynamic(staticPayload, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Nominal QRIS tidak valid');
  validate(staticPayload);
  const fields = parseTLV(staticPayload.trim()).filter((f) => f.tag !== '54' && f.tag !== '63');
  const f01 = fields.find((f) => f.tag === '01');
  if (f01) f01.value = '12';
  else fields.push({ tag: '01', value: '12' });
  fields.push({ tag: '54', value: String(amount) });
  return build(fields);
}

/** Payload QRIS statis DEMO (struktur valid, tidak bisa menerima uang sungguhan). */
function demoStatic(merchant = 'SEPATU KINCLONG DEMO', city = 'JAKARTA') {
  return build([
    { tag: '00', value: '01' },
    { tag: '01', value: '11' },
    { tag: '26', value: tlv('00', 'ID.CO.DEMO.WWW') + tlv('01', '936000000000000000') + tlv('02', 'DEMO000000000001') + tlv('03', 'UMI') },
    { tag: '51', value: tlv('00', 'ID.CO.QRIS.WWW') + tlv('02', 'ID0000000000001') + tlv('03', 'UMI') },
    { tag: '52', value: '7251' }, // MCC 7251: shoe repair / shoe shine
    { tag: '53', value: '360' },
    { tag: '58', value: 'ID' },
    { tag: '59', value: merchant.slice(0, 25) },
    { tag: '60', value: city.slice(0, 15) },
    { tag: '61', value: '12345' },
  ]);
}

module.exports = { crc16, parseTLV, validate, toDynamic, demoStatic };
