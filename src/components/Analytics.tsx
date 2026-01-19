import React, { useMemo } from 'react';
import {
    DollarSign,
    TrendingUp,
    Percent,
    Package,
    AlertTriangle,
    AlertCircle,
    BarChart3
} from 'lucide-react';
import { StyleRecord } from '../hooks/useMarginCalculator';

interface AnalyticsProps {
    styles: StyleRecord[];
}

interface CardData {
    label: string;
    value: string;
    icon: React.ReactNode;
    color: 'green' | 'red' | 'gold' | 'blue';
    subtext?: string;
}

interface MarginBracket {
    label: string;
    count: number;
    percentage: number;
    color: string;
}

const calculateStyleMetrics = (style: StyleRecord) => {
    const units = style.units || 0;
    const price = style.price || 0;
    const rate = style.rate || 0;
    const extraCost = style.extraCost || 0;
    const sellingPrice = style.sellingPrice || 0;

    // Match the formula from useMarginCalculator: LC = (Price * Rate) / 6.2
    const lc = (price * rate) / 6.2;
    const totalCost = lc + extraCost;
    const revenue = sellingPrice * units;
    const totalExpenses = totalCost * units;
    const profit = revenue - totalExpenses;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return { revenue, profit, margin, units };
};

export const Analytics: React.FC<AnalyticsProps> = ({ styles }) => {
    const analytics = useMemo(() => {
        let totalRevenue = 0;
        let totalProfit = 0;
        let totalUnits = 0;
        let belowTarget = 0;
        let atRisk = 0;

        const marginBrackets = {
            negative: 0,
            low: 0,      // < 15%
            medium: 0,   // 15-22%
            good: 0,     // 22-30%
            excellent: 0 // > 30%
        };

        styles.forEach(style => {
            const metrics = calculateStyleMetrics(style);
            totalRevenue += metrics.revenue;
            totalProfit += metrics.profit;
            totalUnits += metrics.units;

            if (metrics.margin < 0) {
                marginBrackets.negative++;
            } else if (metrics.margin < 15) {
                marginBrackets.low++;
                belowTarget++;
            } else if (metrics.margin < 22) {
                marginBrackets.medium++;
                atRisk++;
            } else if (metrics.margin < 30) {
                marginBrackets.good++;
            } else {
                marginBrackets.excellent++;
            }
        });

        // Weighted average margin (weighted by revenue)
        const weightedAvgMargin = totalRevenue > 0
            ? (totalProfit / totalRevenue) * 100
            : 0;

        return {
            totalRevenue,
            totalProfit,
            weightedAvgMargin,
            totalUnits,
            belowTarget,
            atRisk,
            marginBrackets,
            totalItems: styles.length
        };
    }, [styles]);

    const formatCurrency = (value: number) => {
        return value.toLocaleString('en-ZA', {
            style: 'currency',
            currency: 'ZAR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    };

    const cards: CardData[] = [
        {
            label: 'Total Revenue',
            value: formatCurrency(analytics.totalRevenue),
            icon: <DollarSign size={24} />,
            color: 'blue',
            subtext: `${analytics.totalItems} items`
        },
        {
            label: 'Total Profit',
            value: formatCurrency(analytics.totalProfit),
            icon: <TrendingUp size={24} />,
            color: analytics.totalProfit >= 0 ? 'green' : 'red'
        },
        {
            label: 'Average Margin',
            value: `${analytics.weightedAvgMargin.toFixed(1)}%`,
            icon: <Percent size={24} />,
            color: analytics.weightedAvgMargin >= 22 ? 'green' : analytics.weightedAvgMargin >= 15 ? 'gold' : 'red'
        },
        {
            label: 'Total Units',
            value: analytics.totalUnits.toLocaleString(),
            icon: <Package size={24} />,
            color: 'blue'
        },
        {
            label: 'Below Target',
            value: analytics.belowTarget.toString(),
            icon: <AlertTriangle size={24} />,
            color: analytics.belowTarget > 0 ? 'red' : 'green',
            subtext: 'Margin < 15%'
        },
        {
            label: 'At Risk',
            value: analytics.atRisk.toString(),
            icon: <AlertCircle size={24} />,
            color: analytics.atRisk > 0 ? 'gold' : 'green',
            subtext: 'Margin 15-22%'
        }
    ];

    const marginDistribution: MarginBracket[] = [
        {
            label: 'Negative',
            count: analytics.marginBrackets.negative,
            percentage: analytics.totalItems > 0 ? (analytics.marginBrackets.negative / analytics.totalItems) * 100 : 0,
            color: 'var(--red)'
        },
        {
            label: '< 15%',
            count: analytics.marginBrackets.low,
            percentage: analytics.totalItems > 0 ? (analytics.marginBrackets.low / analytics.totalItems) * 100 : 0,
            color: '#f87171'
        },
        {
            label: '15-22%',
            count: analytics.marginBrackets.medium,
            percentage: analytics.totalItems > 0 ? (analytics.marginBrackets.medium / analytics.totalItems) * 100 : 0,
            color: 'var(--gold)'
        },
        {
            label: '22-30%',
            count: analytics.marginBrackets.good,
            percentage: analytics.totalItems > 0 ? (analytics.marginBrackets.good / analytics.totalItems) * 100 : 0,
            color: '#4ade80'
        },
        {
            label: '> 30%',
            count: analytics.marginBrackets.excellent,
            percentage: analytics.totalItems > 0 ? (analytics.marginBrackets.excellent / analytics.totalItems) * 100 : 0,
            color: 'var(--green)'
        }
    ];

    const maxCount = Math.max(...marginDistribution.map(b => b.count), 1);

    if (styles.length === 0) {
        return null;
    }

    return (
        <div className="analytics-container">
            <div className="analytics-cards">
                {cards.map((card, index) => (
                    <div key={index} className={`analytics-card analytics-card-${card.color}`}>
                        <div className="analytics-card-icon">{card.icon}</div>
                        <div className="analytics-card-content">
                            <span className="analytics-card-label">{card.label}</span>
                            <span className="analytics-card-value">{card.value}</span>
                            {card.subtext && (
                                <span className="analytics-card-subtext">{card.subtext}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="analytics-chart-container dashboard-card">
                <div className="analytics-chart-header">
                    <BarChart3 size={20} />
                    <h3>Margin Distribution</h3>
                </div>
                <div className="analytics-chart">
                    {marginDistribution.map((bracket, index) => (
                        <div key={index} className="analytics-bar-group">
                            <div className="analytics-bar-label">{bracket.label}</div>
                            <div className="analytics-bar-wrapper">
                                <div
                                    className="analytics-bar"
                                    style={{
                                        width: `${(bracket.count / maxCount) * 100}%`,
                                        backgroundColor: bracket.color,
                                        minWidth: bracket.count > 0 ? '20px' : '0'
                                    }}
                                />
                                <span className="analytics-bar-count">
                                    {bracket.count} ({bracket.percentage.toFixed(0)}%)
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
