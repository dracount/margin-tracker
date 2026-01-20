/**
 * Centralized margin calculation utilities.
 * All monetary calculations and margin-related logic should use these functions
 * to ensure consistency across the application.
 */

import { BUSINESS_CONSTANTS } from '../constants/business';
import { MarginStatus } from '../types';

const { CURRENCY_DIVISOR, MARGIN_THRESHOLDS } = BUSINESS_CONSTANTS;

/**
 * Calculates the Landed Cost (LC) from price and exchange rate.
 * Formula: LC = (price * rate) / CURRENCY_DIVISOR
 *
 * @param price - The item price in foreign currency (e.g., USD)
 * @param rate - The exchange rate
 * @returns The landed cost in local currency (ZAR)
 *
 * @example
 * calculateLC(13.95, 42) // Returns 94.50 (13.95 * 42 / 6.2)
 */
export const calculateLC = (price: number, rate: number): number => {
    return (price * rate) / CURRENCY_DIVISOR;
};

/**
 * Calculates the margin percentage from revenue and cost.
 * Formula: Margin = ((revenue - cost) / revenue) * 100
 *
 * @param revenue - Total revenue amount
 * @param cost - Total cost amount
 * @returns The margin percentage (0-100 scale)
 *
 * @example
 * calculateMargin(194250, 176250) // Returns 9.27
 */
export const calculateMargin = (revenue: number, cost: number): number => {
    if (revenue <= 0) return 0;
    return ((revenue - cost) / revenue) * 100;
};

/**
 * Calculates the profit from selling price, landed cost, and extra cost.
 * Formula: Profit = (sellingPrice - lc - extraCost) * units
 *
 * @param sellingPrice - The selling price per unit in local currency
 * @param lc - The landed cost per unit
 * @param extraCost - Any additional cost per unit
 * @param units - Number of units (defaults to 1 for per-unit calculation)
 * @returns The total profit
 *
 * @example
 * calculateProfit(129.50, 94.50, 23.00, 1500) // Returns 18000
 */
export const calculateProfit = (
    sellingPrice: number,
    lc: number,
    extraCost: number,
    units: number = 1
): number => {
    const totalCostPerUnit = lc + extraCost;
    return (sellingPrice - totalCostPerUnit) * units;
};

/**
 * Determines the margin status based on configured thresholds.
 * - Below LOW threshold: 'low' (critical - red)
 * - Between LOW and MEDIUM: 'medium' (at risk - yellow)
 * - Above MEDIUM threshold: 'high' (good - green)
 *
 * @param margin - The margin percentage
 * @returns The margin status indicator
 *
 * @example
 * getMarginStatus(10)  // Returns 'low'
 * getMarginStatus(18)  // Returns 'medium'
 * getMarginStatus(25)  // Returns 'high'
 */
export const getMarginStatus = (margin: number): MarginStatus => {
    if (margin < MARGIN_THRESHOLDS.LOW) return 'low';
    if (margin < MARGIN_THRESHOLDS.MEDIUM) return 'medium';
    return 'high';
};

/**
 * Calculates val1 (price divided by currency divisor).
 * Formula: val1 = price / CURRENCY_DIVISOR
 *
 * @param price - The item price in foreign currency
 * @returns The calculated value
 *
 * @example
 * calculateVal1(13.95) // Returns 2.25 (13.95 / 6.2)
 */
export const calculateVal1 = (price: number): number => {
    return price / CURRENCY_DIVISOR;
};

/**
 * Calculates val2 (val1 divided by pack).
 * Formula: val2 = val1 / pack
 *
 * @param val1 - The val1 value
 * @param pack - The pack size
 * @returns The calculated value
 *
 * @example
 * calculateVal2(2.25, 2) // Returns 1.125
 */
export const calculateVal2 = (val1: number, pack: number): number => {
    if (pack <= 0) return 0;
    return val1 / pack;
};

/**
 * Calculates the total cost per unit (LC + extra cost).
 *
 * @param lc - The landed cost
 * @param extraCost - Any additional cost per unit
 * @returns The total cost per unit
 */
export const calculateTotalCost = (lc: number, extraCost: number): number => {
    return lc + extraCost;
};

/**
 * Calculates all derived values for a style record.
 * This is a convenience function that combines all individual calculations.
 *
 * @param params - Object containing all required input values
 * @returns Object containing all calculated values
 */
export const calculateStyleMetrics = (params: {
    price: number;
    rate: number;
    extraCost: number;
    sellingPrice: number;
    units: number;
    pack: number;
}) => {
    const { price, rate, extraCost, sellingPrice, units, pack } = params;

    const lc = calculateLC(price, rate);
    const totalCost = calculateTotalCost(lc, extraCost);
    const revenue = sellingPrice * units;
    const totalExpenses = totalCost * units;
    const profit = revenue - totalExpenses;
    const margin = calculateMargin(revenue, totalExpenses);
    const profitPerPack = units > 0 ? profit / units : 0;
    const val1 = calculateVal1(price);
    const val2 = calculateVal2(val1, pack);
    const marginStatus = getMarginStatus(margin);

    return {
        lc,
        totalCost,
        revenue,
        profit,
        margin,
        profitPerPack,
        val1,
        val2,
        marginStatus,
    };
};
