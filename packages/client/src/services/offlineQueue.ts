import { apiRequest } from './api.js';

export interface QueueItem {
  id: string;
  type: 'create_work_order' | 'create_payment';
  endpoint: string;
  payload: any;
  timestamp: string;
  error?: string;
}

const STORAGE_KEY = 'oto_servis_offline_queue';

export function getOfflineQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOfflineQueue(queue: QueueItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent('offline_queue_changed', { detail: { count: queue.length } }));
}

export function addToOfflineQueue(type: QueueItem['type'], endpoint: string, payload: any) {
  const queue = getOfflineQueue();
  const item: QueueItem = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    endpoint,
    payload,
    timestamp: new Date().toISOString()
  };
  queue.push(item);
  saveOfflineQueue(queue);
  return item;
}

export async function processOfflineQueue(): Promise<{ processed: number; failed: number }> {
  if (!navigator.onLine) {
    return { processed: 0, failed: 0 };
  }

  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;
  const remaining: QueueItem[] = [];

  for (const item of queue) {
    try {
      await apiRequest(item.endpoint, {
        method: 'POST',
        body: JSON.stringify(item.payload)
      });
      processed++;
    } catch (err: any) {
      failed++;
      item.error = err.message || 'Senkronizasyon hatası';
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);

  if (processed > 0) {
    window.dispatchEvent(
      new CustomEvent('offline_sync_completed', {
        detail: { processed, remaining: remaining.length }
      })
    );
  }

  return { processed, failed };
}

// Auto-trigger sync on network online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[OFFLINE QUEUE] Bağlantı sağlandı, kuyruk eşitleniyor...');
    processOfflineQueue();
  });
}
