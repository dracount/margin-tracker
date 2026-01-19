export interface ValidationError {
    field: string;
    message: string;
}

export interface ValidationResult {
    isValid: boolean;
    errors: Record<string, string>;
}

export interface StyleValidationData {
    units?: number | string;
    pack?: number | string;
    price?: number | string;
    rate?: number | string;
    extraCost?: number | string;
    sellingPrice?: number | string;
}

/**
 * Validates a single field value
 */
export function validateField(field: keyof StyleValidationData, value: number | string | undefined): string | null {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;

    switch (field) {
        case 'units':
            if (value === undefined || value === '' || value === null) {
                return 'Units is required';
            }
            if (isNaN(numValue as number) || !Number.isInteger(numValue) || (numValue as number) < 1) {
                return 'Units must be a positive integer';
            }
            return null;

        case 'pack':
            if (value === undefined || value === '' || value === null) {
                return 'Pack is required';
            }
            if (isNaN(numValue as number) || !Number.isInteger(numValue) || (numValue as number) < 1) {
                return 'Pack must be a positive integer (min 1)';
            }
            return null;

        case 'price':
            if (value === undefined || value === '' || value === null) {
                return 'Price is required';
            }
            if (isNaN(numValue as number) || (numValue as number) <= 0) {
                return 'Price must be a positive number';
            }
            return null;

        case 'rate':
            if (value === undefined || value === '' || value === null) {
                return 'Rate is required';
            }
            if (isNaN(numValue as number) || (numValue as number) <= 0) {
                return 'Rate must be a positive number';
            }
            if ((numValue as number) < 1 || (numValue as number) > 200) {
                return 'Rate must be between 1 and 200';
            }
            return null;

        case 'extraCost':
            if (value === undefined || value === '' || value === null) {
                return null; // Extra cost can be empty (defaults to 0)
            }
            if (isNaN(numValue as number) || (numValue as number) < 0) {
                return 'Extra cost must be 0 or greater';
            }
            return null;

        case 'sellingPrice':
            if (value === undefined || value === '' || value === null) {
                return 'Selling price is required';
            }
            if (isNaN(numValue as number) || (numValue as number) <= 0) {
                return 'Selling price must be a positive number';
            }
            return null;

        default:
            return null;
    }
}

/**
 * Validates all style fields at once
 */
export function validateStyleData(data: StyleValidationData): ValidationResult {
    const errors: Record<string, string> = {};
    const fields: (keyof StyleValidationData)[] = ['units', 'pack', 'price', 'rate', 'extraCost', 'sellingPrice'];

    for (const field of fields) {
        const error = validateField(field, data[field]);
        if (error) {
            errors[field] = error;
        }
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}

/**
 * Returns a user-friendly error message for API errors
 */
export function getApiErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        const message = error.message.toLowerCase();

        // PocketBase specific errors
        if (message.includes('failed to fetch') || message.includes('network')) {
            return 'Unable to connect to the server. Please check your internet connection.';
        }
        if (message.includes('unauthorized') || message.includes('401')) {
            return 'Your session has expired. Please log in again.';
        }
        if (message.includes('forbidden') || message.includes('403')) {
            return 'You do not have permission to perform this action.';
        }
        if (message.includes('not found') || message.includes('404')) {
            return 'The requested resource was not found.';
        }
        if (message.includes('validation') || message.includes('400')) {
            return 'The data you entered is invalid. Please check your inputs.';
        }
        if (message.includes('timeout')) {
            return 'The request timed out. Please try again.';
        }
        if (message.includes('500') || message.includes('internal server')) {
            return 'A server error occurred. Please try again later.';
        }
    }

    // Default message for unknown errors
    return 'An unexpected error occurred. Please try again.';
}

/**
 * Retry logic wrapper for async operations
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000,
    onRetry?: (attempt: number, error: unknown) => void
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            // Don't retry on client errors (4xx) - check status code for PocketBase errors
            const err = error as { status?: number; message?: string };
            if (err.status && err.status >= 400 && err.status < 500) {
                throw error;
            }

            // Also check message string as fallback
            if (error instanceof Error) {
                const message = error.message.toLowerCase();
                if (
                    message.includes('400') ||
                    message.includes('401') ||
                    message.includes('403') ||
                    message.includes('404') ||
                    message.includes('validation')
                ) {
                    throw error;
                }
            }

            if (attempt < maxRetries) {
                if (onRetry) {
                    onRetry(attempt, error);
                }
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
            }
        }
    }

    throw lastError;
}
