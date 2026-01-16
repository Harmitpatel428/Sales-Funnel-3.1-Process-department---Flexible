import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiClient } from '../lib/apiClient';

interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: {
        database: { status: string; latency?: number };
        redis: { status: string; latency?: number };
    };
    timestamp: string;
}

export function useHealthCheck() {
    // Poll every 30 seconds
    const { data, error, isError } = useQuery({
        queryKey: ['system-health'],
        queryFn: () => apiClient.get<HealthStatus>('/api/health', {
            skipCircuitBreaker: true,
            skipHealthCheck: true // Don't check for health recursively
        }),
        refetchInterval: 30000,
        staleTime: 10000,
        retry: false
    });

    const isHealthy = data?.status === 'healthy';

    // Update global health state in apiClient
    useEffect(() => {
        if (data) {
            apiClient.setSystemHealth(data.status !== 'unhealthy');
        } else if (isError) {
            // If health check fails, assume unhealthy
            apiClient.setSystemHealth(false);
        }
    }, [data, isError]);

    return {
        health: data,
        isHealthy,
        isError,
        checkStatus: data?.status || 'unknown'
    };
}
