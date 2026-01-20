// ============================================================================
// Validation Constants
// ============================================================================

const VALIDATION_CONSTANTS = {
  MIN_RATE: 1,
  MAX_RATE: 200,
  MIN_PRICE: 0,
  MIN_UNITS: 1,
  MAX_UNITS: 1000000,
  MIN_PACK: 1,
  MAX_PACK: 10000,
  MAX_BACKOFF_MS: 30000,
};

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Validates that a value is a positive number within an optional range
 * @param value - The value to validate
 * @param fieldName - The name of the field for error messages
 * @param options - Validation options including min, max, required, and integer constraints
 * @returns An error message string if validation fails, null if valid
 */
function validatePositiveNumber(
  value: unknown,
  fieldName: string,
  options: {
    min?: number;
    max?: number;
    required?: boolean;
    integer?: boolean;
  } = {}
): string | null {
  const { min = 0, max = Infinity, required = true, integer = false } = options;

  // Check empty
  if (value === undefined || value === '' || value === null) {
    if (!required) return null; // Optional field
    return `${fieldName} is required`;
  }

  // Check numeric
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (isNaN(num)) {
    return `${fieldName} must be a valid number`;
  }

  // Check integer if required
  if (integer && !Number.isInteger(num)) {
    return `${fieldName} must be a positive integer`;
  }

  // Check positive (greater than min which defaults to 0)
  if (num < min) {
    if (min === 0) {
      return `${fieldName} must be 0 or greater`;
    }
    return `${fieldName} must be at least ${min}`;
  }

  // Check max
  if (num > max) {
    return `${fieldName} must be between ${min} and ${max}`;
  }

  return null;
}

// ============================================================================
// Field Validation
// ============================================================================

/**
 * Validates a single field value for style data
 * @param field - The field name to validate
 * @param value - The value to validate
 * @returns An error message string if validation fails, null if valid
 */
export function validateField(field: keyof StyleValidationData, value: number | string | undefined): string | null {
    switch (field) {
        case 'units':
            return validatePositiveNumber(value, 'Units', {
                min: VALIDATION_CONSTANTS.MIN_UNITS,
                max: VALIDATION_CONSTANTS.MAX_UNITS,
                required: true,
                integer: true
            });

        case 'pack':
            return validatePositiveNumber(value, 'Pack', {
                min: VALIDATION_CONSTANTS.MIN_PACK,
                max: VALIDATION_CONSTANTS.MAX_PACK,
                required: true,
                integer: true
            });

        case 'price':
            return validatePositiveNumber(value, 'Price', {
                min: VALIDATION_CONSTANTS.MIN_PRICE,
                required: true
            }) || (Number(value) <= 0 ? 'Price must be a positive number' : null);

        case 'rate':
            return validatePositiveNumber(value, 'Rate', {
                min: VALIDATION_CONSTANTS.MIN_RATE,
                max: VALIDATION_CONSTANTS.MAX_RATE,
                required: true
            });

        case 'extraCost':
            return validatePositiveNumber(value, 'Extra cost', {
                min: 0,
                required: false
            });

        case 'sellingPrice':
            return validatePositiveNumber(value, 'Selling price', {
                min: VALIDATION_CONSTANTS.MIN_PRICE,
                required: true
            }) || (Number(value) <= 0 ? 'Selling price must be a positive number' : null);

        default:
            return null;
    }
}

/**
 * Validates all style fields at once
 * @param data - The style data object to validate
 * @returns A ValidationResult object with isValid flag and errors record
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

// ============================================================================
// API Error Handling
// ============================================================================

/**
 * Maps API errors to user-friendly messages
 * @param error - The error object from API call
 * @returns A user-friendly error message string
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
        if (message.includes('429') || message.includes('rate limit')) {
            return 'Too many requests. Please wait a moment and try again.';
        }
    }

    // Default message for unknown errors
    return 'An unexpected error occurred. Please try again.';
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Wraps an async operation with retry logic and exponential backoff
 * @param operation - The async operation to execute
 * @param maxRetries - Maximum number of retry attempts (must be at least 1)
 * @param delayMs - Base delay in milliseconds between retries
 * @param onRetry - Optional callback called before each retry attempt
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted, or immediately for non-retryable errors
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000,
    onRetry?: (attempt: number, error: unknown) => void
): Promise<T> {
    // Validate maxRetries parameter
    if (maxRetries < 1) {
        throw new Error('maxRetries must be at least 1');
    }

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            const err = error as { status?: number; message?: string };

            // Special handling for 429 (rate limited) - should retry with longer delay
            if (err.status === 429) {
                if (attempt < maxRetries) {
                    if (onRetry) {
                        onRetry(attempt, error);
                    }
                    // Double the delay for rate limits
                    const retryDelay = delayMs * attempt * 2;
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }
                throw error;
            }

            // Don't retry on client errors (4xx except 429) - check status code for PocketBase errors
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
                // True exponential backoff with cap
                const backoffDelay = Math.min(
                    delayMs * Math.pow(2, attempt - 1),
                    VALIDATION_CONSTANTS.MAX_BACKOFF_MS
                );
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }
        }
    }

    throw lastError;
}
