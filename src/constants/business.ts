// Business constants used across the application
export const BUSINESS_CONSTANTS = {
  // Currency conversion divisor (e.g., USD to local currency factor)
  CURRENCY_DIVISOR: 6.2,

  // Margin thresholds for status indicators
  MARGIN_THRESHOLDS: {
    LOW: 15,      // Below this = 'low' status (red)
    MEDIUM: 22,   // Below this = 'medium' status (yellow)
    // Above MEDIUM = 'high' status (green)
  },

  // Debounce delays in milliseconds
  DEBOUNCE_MS: 400,

  // Retry configuration
  RETRY: {
    MAX_ATTEMPTS: 3,
    BASE_DELAY_MS: 1000,
  },

  // Currency formatting
  LOCALE: 'en-ZA',
  CURRENCY: 'ZAR',
} as const;

// HTTP status codes for error handling
export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
} as const;

// PocketBase collection names
export const COLLECTIONS = {
  USERS: 'users',
  CUSTOMERS: 'customers',
  STYLES: 'styles',
} as const;
