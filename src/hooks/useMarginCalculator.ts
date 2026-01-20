import { BUSINESS_CONSTANTS } from '../constants/business';
import { StyleRecord } from '../types';
import {
    calculateLC,
    calculateTotalCost,
    calculateMargin,
    calculateVal1,
    calculateVal2,
    getMarginStatus,
} from '../utils/marginCalculations';

// Re-export StyleRecord for backward compatibility
export type { StyleRecord } from '../types';

const { LOCALE, CURRENCY } = BUSINESS_CONSTANTS;

export const useMarginCalculator = (style: Partial<StyleRecord>) => {
    const units = style.units ?? 0;
    const pack = style.pack ?? 1;
    const price = style.price ?? 0;
    const rate = style.rate ?? 0;
    const extraCost = style.extraCost ?? 0;
    const sellingPrice = style.sellingPrice ?? 0;

    // 1. Calculate Landed Cost (LC)
    // Formula: LC = (Price * Rate) / CURRENCY_DIVISOR
    // Verified: 13.95 * 42 / 6.2 = 94.50
    const lc = calculateLC(price, rate);

    // 2. Total Cost (per unit)
    const totalCost = calculateTotalCost(lc, extraCost);

    // 3. Totals
    const revenue = sellingPrice * units;
    const totalExpenses = totalCost * units;
    const profit = revenue - totalExpenses;

    // 4. Margin Percentage
    // Formula: Margin = (Profit / Revenue) * 100
    const marginAchieved = calculateMargin(revenue, totalExpenses);

    // 5. Profit per Pack (actually profit per unit based on sample data)
    // Sample: TP131 Profit=18000, Units=1500, Profit Per Pack=12.00
    // 18000 / 1500 = 12.00 (no multiplication by pack)
    const profitPerPack = units > 0 ? profit / units : 0;

    // 6. Column values (val1 and val2)
    // val1 = Price / CURRENCY_DIVISOR (e.g., 13.95 / 6.2 = 2.25)
    // val2 = val1 / Pack (e.g., 2.25 / 2 = 1.13)
    const val1 = calculateVal1(price);
    const val2 = calculateVal2(val1, pack);

    return {
        ...style,
        lc: lc.toFixed(2),
        totalCost: totalCost.toFixed(2),
        revenue: revenue.toLocaleString(LOCALE, { style: 'currency', currency: CURRENCY }),
        profit: profit.toLocaleString(LOCALE, { style: 'currency', currency: CURRENCY }),
        margin: marginAchieved.toFixed(2),
        profitPerPack: profitPerPack.toFixed(2),
        val1: val1.toFixed(2),
        val2: val2.toFixed(2),
        marginStatus: getMarginStatus(marginAchieved)
    };
};
