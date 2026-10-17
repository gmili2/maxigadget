/**
 * Téléphone marocain (mobile) : 06, 07 ou 08 suivi de 8 chiffres, ou +212 / 00212 / 212 suivi de 6, 7 ou 8.
 * Espaces, points, tirets et parenthèses acceptés ; enregistré au format national « 06XXXXXXXX ».
 */
export const MA_PHONE = /^0[678]\d{8}$/;
export const MA_PHONE_MESSAGE = 'رقم الهاتف يجب أن يكون مغربيًا: 06 أو 07 أو 08 متبوعًا بـ 8 أرقام (أو ‎+212 6…)';

export function normalizeMaPhone(raw: string) {
  let d = raw.trim().replace(/[\s.\-()]/g, '');
  if (d.startsWith('+212')) d = '0' + d.slice(4);
  else if (d.startsWith('00212')) d = '0' + d.slice(5);
  else if (d.startsWith('212') && d.length === 12) d = '0' + d.slice(3);
  return d;
}
