/**
 * Network Status Hook
 * Detects online/offline state and provides network information
 */

import { useState, useEffect } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean; // Track if user was offline (for showing reconnection messages)
  effectiveType?: string; // '4g', '3g', '2g', 'slow-2g'
  downlink?: number; // Mbps
  rtt?: number; // Round-trip time in ms
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    wasOffline: false,
  });

  useEffect(() => {
    // Update network information
    const updateNetworkInfo = () => {
      const connection = (navigator as any).connection || 
                        (navigator as any).mozConnection || 
                        (navigator as any).webkitConnection;

      setStatus((prev) => ({
        ...prev,
        isOnline: navigator.onLine,
        effectiveType: connection?.effectiveType,
        downlink: connection?.downlink,
        rtt: connection?.rtt,
      }));
    };

    // Handle online event
    const handleOnline = () => {
      setStatus((prev) => ({
        ...prev,
        isOnline: true,
        wasOffline: !prev.isOnline, // Set wasOffline if we were previously offline
      }));
      updateNetworkInfo();
    };

    // Handle offline event
    const handleOffline = () => {
      setStatus((prev) => ({
        ...prev,
        isOnline: false,
      }));
    };

    // Handle connection change
    const handleConnectionChange = () => {
      updateNetworkInfo();
    };

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const connection = (navigator as any).connection || 
                      (navigator as any).mozConnection || 
                      (navigator as any).webkitConnection;
    
    if (connection) {
      connection.addEventListener('change', handleConnectionChange);
    }

    // Initial update
    updateNetworkInfo();

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        connection.removeEventListener('change', handleConnectionChange);
      }
    };
  }, []);

  return status;
}

/**
 * Hook to check if network is slow
 */
export function useIsSlowNetwork(): boolean {
  const { effectiveType, downlink } = useNetworkStatus();
  
  // Consider slow if 2g/slow-2g or downlink < 1 Mbps
  return (
    effectiveType === '2g' ||
    effectiveType === 'slow-2g' ||
    (downlink !== undefined && downlink < 1)
  );
}
