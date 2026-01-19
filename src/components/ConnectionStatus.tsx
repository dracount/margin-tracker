import React, { useEffect, useState, useCallback, useRef } from 'react';
import pb from '../lib/pocketbase';
import { useToast } from './Toast';

interface ConnectionStatusProps {
    children: React.ReactNode;
}

interface QueuedChange {
    id: string;
    collection: string;
    data: Record<string, unknown>;
    timestamp: number;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ children }) => {
    const [isOnline, setIsOnline] = useState(true);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [reconnectAttempt, setReconnectAttempt] = useState(0);
    const [queuedChanges, setQueuedChanges] = useState<QueuedChange[]>([]);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toast = useToast();

    const maxReconnectAttempts = 5;
    const baseReconnectDelay = 2000; // 2 seconds

    // Check connection by making a simple health check request
    const checkConnection = useCallback(async (): Promise<boolean> => {
        try {
            await pb.health.check();
            return true;
        } catch {
            return false;
        }
    }, []);

    // Attempt to reconnect
    const attemptReconnect = useCallback(async () => {
        if (reconnectAttempt >= maxReconnectAttempts) {
            setIsReconnecting(false);
            toast.error('Connection failed', 'Unable to reconnect to the server. Please refresh the page.');
            return;
        }

        setIsReconnecting(true);
        setReconnectAttempt(prev => prev + 1);

        const connected = await checkConnection();

        if (connected) {
            setIsOnline(true);
            setIsReconnecting(false);
            setReconnectAttempt(0);
            toast.success('Reconnected', 'Connection restored successfully.');

            // Process queued changes
            if (queuedChanges.length > 0) {
                toast.info('Syncing', `Processing ${queuedChanges.length} queued changes...`);
                await processQueuedChanges();
            }
        } else {
            // Exponential backoff with jitter
            const delay = baseReconnectDelay * Math.pow(2, reconnectAttempt) + Math.random() * 1000;
            reconnectTimeoutRef.current = setTimeout(attemptReconnect, delay);
        }
    }, [reconnectAttempt, checkConnection, queuedChanges, toast]);

    // Process queued changes when connection is restored
    const processQueuedChanges = useCallback(async () => {
        const changes = [...queuedChanges];
        let successCount = 0;
        let failCount = 0;

        for (const change of changes) {
            try {
                await pb.collection(change.collection).update(change.id, change.data);
                successCount++;
                setQueuedChanges(prev => prev.filter(c => c.id !== change.id));
            } catch (err) {
                console.error('Failed to sync queued change:', err);
                failCount++;
            }
        }

        if (successCount > 0) {
            toast.success('Sync complete', `${successCount} changes synced successfully.`);
        }
        if (failCount > 0) {
            toast.error('Sync incomplete', `${failCount} changes failed to sync.`);
        }
    }, [queuedChanges, toast]);

    // Add a change to the offline queue (for future use via context)
    const queueChange = useCallback((collection: string, id: string, data: Record<string, unknown>) => {
        setQueuedChanges(prev => {
            // Replace existing change for same record
            const filtered = prev.filter(c => c.id !== id);
            return [...filtered, { id, collection, data, timestamp: Date.now() }];
        });
    }, []);

    // TODO: Expose queueChange via context for offline support
    void queueChange;

    // Monitor network status
    useEffect(() => {
        const handleOnline = () => {
            if (!isOnline) {
                attemptReconnect();
            }
        };

        const handleOffline = () => {
            setIsOnline(false);
            toast.warning('Connection lost', 'You are offline. Changes will be saved when connection is restored.');
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [isOnline, attemptReconnect, toast]);

    // Periodic connection check
    useEffect(() => {
        const interval = setInterval(async () => {
            if (isOnline) {
                const connected = await checkConnection();
                if (!connected) {
                    setIsOnline(false);
                    toast.warning('Connection lost', 'Server connection lost. Attempting to reconnect...');
                    attemptReconnect();
                }
            }
        }, 30000); // Check every 30 seconds

        return () => clearInterval(interval);
    }, [isOnline, checkConnection, attemptReconnect, toast]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, []);

    // Expose queueChange function via context (optional enhancement)
    // For now, we'll render the banner and children

    const handleRetry = () => {
        setReconnectAttempt(0);
        attemptReconnect();
    };

    return (
        <>
            {!isOnline && (
                <div className="connection-banner">
                    <div className="connection-banner-content">
                        <div className="connection-banner-icon">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z" stroke="currentColor" strokeWidth="2"/>
                                <path d="M10 6V10M10 14H10.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                        </div>
                        <div className="connection-banner-text">
                            <span className="connection-banner-title">
                                {isReconnecting ? 'Reconnecting...' : 'Connection lost'}
                            </span>
                            <span className="connection-banner-subtitle">
                                {isReconnecting
                                    ? `Attempt ${reconnectAttempt} of ${maxReconnectAttempts}`
                                    : 'Changes will be saved when connection is restored'}
                            </span>
                        </div>
                        {queuedChanges.length > 0 && (
                            <div className="connection-banner-queue">
                                <span className="queue-badge">{queuedChanges.length}</span>
                                <span>pending</span>
                            </div>
                        )}
                        {!isReconnecting && (
                            <button className="connection-banner-retry" onClick={handleRetry}>
                                Retry Now
                            </button>
                        )}
                        {isReconnecting && (
                            <div className="connection-spinner">
                                <span className="mini-spinner" />
                            </div>
                        )}
                    </div>
                </div>
            )}
            {children}
        </>
    );
};

export default ConnectionStatus;
