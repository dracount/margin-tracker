import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook that debounces a value
 * @param value The value to debounce
 * @param delay The debounce delay in milliseconds
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}

/**
 * Custom hook that returns a debounced callback function
 * @param callback The callback function to debounce
 * @param delay The debounce delay in milliseconds
 * @returns A debounced version of the callback
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
    callback: T,
    delay: number
): (...args: Parameters<T>) => void {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const debouncedCallback = useCallback(
        (...args: Parameters<T>) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout(() => {
                callback(...args);
            }, delay);
        },
        [callback, delay]
    );

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return debouncedCallback;
}

/**
 * Custom hook that provides a pending state while debouncing
 * Useful for showing loading indicators during input
 * @param value The value to debounce
 * @param delay The debounce delay in milliseconds
 * @returns Object with debouncedValue and isPending flag
 */
export function useDebounceWithPending<T>(value: T, delay: number): {
    debouncedValue: T;
    isPending: boolean;
} {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    const [isPending, setIsPending] = useState(false);
    const isFirstRender = useRef(true);

    useEffect(() => {
        // Skip the first render to avoid showing pending on initial load
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        setIsPending(true);
        const handler = setTimeout(() => {
            setDebouncedValue(value);
            setIsPending(false);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return { debouncedValue, isPending };
}
