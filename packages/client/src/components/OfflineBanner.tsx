import React, { useState, useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { getOfflineQueue, processOfflineQueue } from '../services/offlineQueue.js';

export const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [queueCount, setQueueCount] = useState(getOfflineQueue().length);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const handleQueueChange = (e: any) => {
      setQueueCount(e.detail?.count ?? getOfflineQueue().length);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline_queue_changed', handleQueueChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline_queue_changed', handleQueueChange);
    };
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await processOfflineQueue();
      setQueueCount(getOfflineQueue().length);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isOnline && queueCount === 0) return null;

  return (
    <div className="offline-banner">
      <WifiOff size={18} />
      <span>
        {!isOnline
          ? `Çevrimdışı Mod! (${queueCount} bekleyen işlem)`
          : `${queueCount} adet çevrimdışı işlem senkronize edilmeyi bekliyor.`}
      </span>
      {isOnline && queueCount > 0 && (
        <button
          type="button"
          className="btn btn-sm"
          style={{ background: 'white', color: '#b45309', marginLeft: '0.5rem' }}
          onClick={handleManualSync}
          disabled={isSyncing}
        >
          <RefreshCw size={14} className={isSyncing ? 'spin' : ''} />
          {isSyncing ? 'Eşitleniyor...' : 'Şimdi Eşitle'}
        </button>
      )}
    </div>
  );
};
