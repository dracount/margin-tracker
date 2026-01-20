import {
    calculateLC,
    calculateTotalCost,
    calculateMargin,
    calculateVal1,
    calculateVal2,
} from './marginCalculations';

export interface LineItem {
    id: string;
    styleId: string;
    factory: string;
    deliveryDate: string;
    description: string;
    fabricTrim: string;
    type: string;
    units: number;
    pack: number;
    price: number; // USD/Foreign
    rate: number; // Exchange Rate
    extraCost: number;
}

export interface CalculatedValues {
    lc: number;
    totalCost: number;
    actualSellingPrice: number;
    marginAchieved: number;
    cost: number;
    revenue: number;
    profit: number;
    profitPerPack: number;
    val1: number;
    val2: number;
}

/**
 * Calculate all derived values for a line item.
 *
 * Formulas reverse-engineered from XLSX sample data:
 *
 * Sample TP131: Units=1500, Pack=2, Price=13.95, Rate=42.00
 *   LC: R94.50, Extra Cost: R23.00, Total Cost: R117.50
 *   Selling Price: 129.50, Margin: 9.27%
 *   Cost: R176,250, Revenue: R194,250, Profit: R18,000
 *   Profit Per Pack: R12.00, Column1: 2.25, Column2: 1.13
 *
 * Sample TP133: Units=2500, Pack=2, Price=13.33, Rate=46.00
 *   LC: R98.90, Extra Cost: 0, Total Cost: R98.90
 *   Selling Price: 124.00, Margin: 20.24%
 *   Cost: R247,250, Revenue: R310,000, Profit: R62,750
 *   Profit Per Pack: R25.10, Column1: 2.15, Column2: 1.08
 */
export const calculateRow = (item: LineItem, sellingPrice: number): CalculatedValues => {
    // 1. Landed Cost (LC)
    // Formula: LC = (Price * Rate) / CURRENCY_DIVISOR
    // Verified: 13.95 * 42 / 6.2 = 94.50
    // Verified: 13.33 * 46 / 6.2 = 98.90
    const lc = calculateLC(item.price, item.rate);

    // 2. Total Cost (per unit)
    // Formula: Total Cost = LC + Extra Cost
    // Verified: 94.50 + 23.00 = 117.50
    const totalCost = calculateTotalCost(lc, item.extraCost);

    const actualSellingPrice = sellingPrice;

    // 3. Cost (total expenses)
    // Formula: Cost = Total Cost * Units
    // Verified: 117.50 * 1500 = 176,250
    const cost = totalCost * item.units;

    // 4. Revenue
    // Formula: Revenue = Selling Price * Units
    // Verified: 129.50 * 1500 = 194,250
    const revenue = actualSellingPrice * item.units;

    // 5. Profit
    // Formula: Profit = Revenue - Cost
    // Verified: 194,250 - 176,250 = 18,000
    const profit = revenue - cost;

    // 6. Margin Achieved (percentage)
    // Formula: Margin = (Profit / Revenue) * 100
    // Verified: (18,000 / 194,250) * 100 = 9.27%
    const marginAchieved = calculateMargin(revenue, cost);

    // 7. Profit Per Pack (actually profit per unit based on sample data)
    // Formula: Profit Per Pack = Profit / Units
    // Verified: 18,000 / 1500 = 12.00
    // Note: Despite the name, this is NOT multiplied by pack count
    const profitPerPack = item.units > 0 ? profit / item.units : 0;

    // 8. Column1 (val1)
    // Formula: val1 = Price / CURRENCY_DIVISOR
    // Verified: 13.95 / 6.2 = 2.25
    const val1 = calculateVal1(item.price);

    // 9. Column2 (val2)
    // Formula: val2 = val1 / Pack
    // Verified: 2.25 / 2 = 1.13 (rounded from 1.125)
    const val2 = calculateVal2(val1, item.pack);

    return {
        lc,
        totalCost,
        actualSellingPrice,
        marginAchieved,
        cost,
        revenue,
        profit,
        profitPerPack,
        val1,
        val2
    };
};
