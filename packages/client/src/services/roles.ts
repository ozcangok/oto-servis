/**
 * Rol yardımcıları — tek dükkân modeli.
 *
 * Sunucu tarafındaki kalıcı roller `owner` ve `staff`'tır. Eski/alternatif
 * istemcilerden veya farklı kurulumlardan gelebilecek `admin`, `patron`,
 * `employee`, `calisan` gibi adları da güvenli biçimde normalize eder.
 *
 * Yetki kuralı:
 *  - owner / admin / patron / manager  → finansal görünürlük
 *  - staff / employee / calisan / usta → yalnızca operasyonel görünürlük
 */

export type NormalizedRole = 'owner' | 'staff';

const PRIVILEGED = new Set(['owner', 'admin', 'patron', 'manager', 'yonetici', 'yönetici']);
const STAFF = new Set(['staff', 'employee', 'calisan', 'çalışan', 'usta', 'mechanic', 'cashier', 'kasiyer']);

/** Rolü iki güvenli kategoriye indirger. Bilinmeyen roller personel sayılır. */
export function normalizeRole(user?: { role?: string | null } | null): NormalizedRole {
  const raw = String(user?.role ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  if (PRIVILEGED.has(raw)) return 'owner';
  if (STAFF.has(raw)) return 'staff';
  return 'staff';
}

/** Finansal KPI, ciro, cari, kasa ve gider görünürlüğü olan roller. */
export function isPrivileged(user?: { role?: string | null } | null): boolean {
  return normalizeRole(user) === 'owner';
}

/** Yalnızca operasyonel ekranları gören roller. */
export function isStaff(user?: { role?: string | null } | null): boolean {
  return normalizeRole(user) === 'staff';
}

/** Arayüzde gösterilecek rol etiketi. */
export function roleLabel(user?: { role?: string | null } | null): string {
  return isPrivileged(user) ? 'Patron' : 'Servis Personeli';
}
