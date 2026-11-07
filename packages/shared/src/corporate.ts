/**
 * Kurumsal kimlik — tek kaynak.
 *
 * Uygulama kabuğu, giriş/kilit ekranları, ayar varsayılanları ve kurumsal
 * PDF belgeleri bu sabitlerden beslenir. Böylece resmi unvan, adres, iletişim
 * ve vergi bilgileri farklı ekranlarda birbirinden ayrışmaz.
 */
export const CORPORATE = {
  /** Kısa marka adı (splash / giriş / WhatsApp / PDF logo başlığı). */
  name: 'Çınar Otomotiv',
  /** Resmi/uzun hizmet unvanı. */
  legalName: 'Çınar Otomotiv - Özel Servis & Bakım Hizmetleri',
  /** Yetkili kişi. */
  owner: 'Sezer Çınar',
  address: 'Esenşehir, Muradiye Sk. No:42 D:B, 34776 Ümraniye/İstanbul',
  phone: '0530 766 52 60',
  /** WhatsApp / wa.me için ülke kodlu, yalnızca rakam. */
  phoneDigits: '905307665260',
  email: 'info@cinarotomotiv.com',
  taxOffice: 'Ümraniye V.D.',
  taxNumber: '1234567890',
  workingHours: 'Pazartesi - Cumartesi: 08:30 - 19:00'
} as const;
