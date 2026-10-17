import type { WorkOrderStatus } from './types.js';

/**
 * İş emri "Servis Durumu" aşamalarına karşılık gelen KURUMSAL WhatsApp mesaj
 * şablonları. `{musteri}` ve `{plaka}` yer tutucuları doldurulur.
 *
 * Not: Şablonlar bilinçli olarak tek bir yerde (paylaşılan pakette) tutulur;
 * hem sunucu (kayıt oluştururken) hem arayüz aynı metni üretir.
 */
export const STATUS_WHATSAPP_TEMPLATES: Record<WorkOrderStatus, string> = {
  kabul:
    'Sayın {musteri}, {plaka} plakalı aracınız servisimize kabul edilmiştir. Aracınızın ilk kontrolleri yapılarak onarım/bakım süreci planlanacaktır. Bizi tercih ettiğiniz için teşekkür ederiz. - Çınar Otomotiv',
  onarimda:
    'Sayın {musteri}, {plaka} plakalı aracınızın bakım ve onarım işlemleri uzman teknisyenlerimiz tarafından başlatılmıştır. Süreç tamamlandığında tarafınıza bilgi verilecektir. - Çınar Otomotiv',
  teslime_hazir:
    'Sayın {musteri}, {plaka} plakalı aracınızın servis işlemleri ve son kalite kontrolleri başarıyla tamamlanmıştır. Aracınız teslime hazırdır, dilediğiniz zaman servisimizden teslim alabilirsiniz. - Çınar Otomotiv',
  teslim_edildi:
    'Sayın {musteri}, {plaka} plakalı aracınızın teslimatı gerçekleştirilmiştir. Çınar Otomotiv olarak size hizmet vermekten memnuniyet duyduk. Güvenli ve keyifli sürüşler dileriz.'
};

/**
 * Belirli bir servis durumu için kurumsal mesajı üretir.
 * Müşteri adı ve plaka yer tutucuları gerçek değerlerle doldurulur.
 */
export function buildStatusWhatsAppMessage(
  durum: WorkOrderStatus,
  musteriAd: string,
  plaka: string
): string {
  const tpl = STATUS_WHATSAPP_TEMPLATES[durum];
  if (!tpl) return '';
  return tpl.replace(/\{musteri\}/g, musteriAd).replace(/\{plaka\}/g, plaka);
}

/** Durum aşamasının insan-okur etiketi (bildirim kaydında rozet olarak gösterilir). */
export const STATUS_NOTIFICATION_LABELS: Record<WorkOrderStatus, string> = {
  kabul: 'Kabul Edildi',
  onarimda: 'Onarımda',
  teslime_hazir: 'Teslime Hazır',
  teslim_edildi: 'Teslim Edildi'
};

export function isStatusNotificationStage(durum: string): durum is WorkOrderStatus {
  return Object.prototype.hasOwnProperty.call(STATUS_WHATSAPP_TEMPLATES, durum);
}
