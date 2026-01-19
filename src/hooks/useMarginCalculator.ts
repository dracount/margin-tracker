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

export const useMarginCalculator = (style: Partial<StyleRecord>) => {
    const units = style.units || 0;
    const pack = style.pack || 1;
    const price = style.price || 0;
    const rate = style.rate || 0;
    const extraCost = style.extraCost || 0;
    const sellingPrice = style.sellingPrice || 0;

    // 1. Calculate Landed Cost (LC)
    // Formula: LC = (Price * Rate) / 6.2
    // Verified: 13.95 * 42 / 6.2 = 94.50
    const lc = (price * rate) / 6.2;

    // 2. Total Cost (per unit)
    const totalCost = lc + extraCost;

    // 3. Totals
    const revenue = sellingPrice * units;
    const totalExpenses = totalCost * units;
    const profit = revenue - totalExpenses;

    // 4. Margin Percentage
    // Formula: Margin = (Profit / Revenue) * 100
    const marginAchieved = revenue > 0 ? (profit / revenue) * 100 : 0;

    // 5. Profit per Pack (actually profit per unit based on sample data)
    // Sample: TP131 Profit=18000, Units=1500, Profit Per Pack=12.00
    // 18000 / 1500 = 12.00 (no multiplication by pack)
    const profitPerPack = units > 0 ? profit / units : 0;

    // 6. Column values (val1 and val2)
    // val1 = Price / 6.2 (e.g., 13.95 / 6.2 = 2.25)
    // val2 = val1 / Pack (e.g., 2.25 / 2 = 1.13)
    const val1 = price / 6.2;
    const val2 = pack > 0 ? val1 / pack : 0;

    return {
        ...style,
        lc: lc.toFixed(2),
        totalCost: totalCost.toFixed(2),
        revenue: revenue.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' }),
        profit: profit.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' }),
        margin: marginAchieved.toFixed(2),
        profitPerPack: profitPerPack.toFixed(2),
        val1: val1.toFixed(2),
        val2: val2.toFixed(2),
        marginStatus: marginAchieved < 15 ? 'low' : marginAchieved < 22 ? 'medium' : 'high'
    };
};
