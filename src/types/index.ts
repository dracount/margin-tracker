/**
 * Shared type definitions for the Margin Tracker application.
 */

/**
 * Represents a style record from the PocketBase database.
 * Contains all raw data fields for a style/product line item.
 */
export interface StyleRecord {
    id: string;
    customer: string;
    styleId: string;
    factory: string;
    deliveryDate: string;
    description: string;
    fabricTrim: string;
    type: string;
    units: number;
    pack: number;
    price: number;
    rate: number;
    extraCost: number;
    sellingPrice: number;
}

/**
 * Margin status indicator type.
 * Used to categorize margin values for visual feedback.
 */
export type MarginStatus = 'low' | 'medium' | 'high';

/**
 * Calculated values derived from a StyleRecord.
 * All monetary values are in ZAR.
 */
export interface CalculatedStyleValues {
    /** Landed Cost - (price * rate) / CURRENCY_DIVISOR */
    lc: number;
    /** Total Cost per unit - LC + extraCost */
    totalCost: number;
    /** Total Revenue - sellingPrice * units */
    revenue: number;
    /** Total Profit - revenue - (totalCost * units) */
    profit: number;
    /** Margin Percentage - (profit / revenue) * 100 */
    margin: number;
    /** Profit per unit - profit / units */
    profitPerPack: number;
    /** Value 1 - price / CURRENCY_DIVISOR */
    val1: number;
    /** Value 2 - val1 / pack */
    val2: number;
    /** Margin status indicator */
    marginStatus: MarginStatus;
}
