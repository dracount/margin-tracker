import React, { useMemo } from 'react';
import {
    DollarSign,
    TrendingUp,
    Percent,
    Package,
    AlertTriangle,
    AlertCircle,
    BarChart3,
    Maximize2
} from 'lucide-react';
import { StyleRecord } from '../hooks/useMarginCalculator';
import { BUSINESS_CONSTANTS } from '../constants/business';
import { calculateStyleMetrics as calcStyleMetrics } from '../utils/marginCalculations';

const { MARGIN_THRESHOLDS, LOCALE, CURRENCY } = BUSINESS_CONSTANTS;

// Shared calculation function using centralized utilities
const calculateStyleMetrics = (style: StyleRecord) => {
    const units = style.units || 0;
    const price = style.price || 0;
    const rate = style.rate || 0;
    const extraCost = style.extraCost || 0;
    const sellingPrice = style.sellingPrice || 0;
    const pack = style.pack || 1;

    const metrics = calcStyleMetrics({
        price,
        rate,
        extraCost,
        sellingPrice,
        units,
        pack
    });

    return { revenue: metrics.revenue, profit: metrics.profit, margin: metrics.margin, units };
};

// Shared analytics calculation hook
const useAnalyticsData = (styles: StyleRecord[]) => {
    return useMemo(() => {
        let totalRevenue = 0;
        let totalProfit = 0;
        let totalUnits = 0;
        let belowTarget = 0;
        let atRisk = 0;

        const marginBrackets = {
            negative: 0,
            low: 0,
            medium: 0,
            good: 0,
            excellent: 0
        };

        styles.forEach(style => {
            const metrics = calculateStyleMetrics(style);
            totalRevenue += metrics.revenue;
            totalProfit += metrics.profit;
            totalUnits += metrics.units;

            if (metrics.margin < 0) {
                marginBrackets.negative++;
            } else if (metrics.margin < MARGIN_THRESHOLDS.LOW) {
                marginBrackets.low++;
                belowTarget++;
            } else if (metrics.margin < MARGIN_THRESHOLDS.MEDIUM) {
                marginBrackets.medium++;
                atRisk++;
            } else if (metrics.margin < 30) {
                marginBrackets.good++;
            } else {
                marginBrackets.excellent++;
            }
        });

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
};

const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1000000) {
        return `R${(value / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1000) {
        return `R${(value / 1000).toFixed(0)}K`;
    }
    return value.toLocaleString(LOCALE, {
        style: 'currency',
        currency: CURRENCY,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
};

const formatCurrencyFull = (value: number) => {
    return value.toLocaleString(LOCALE, {
        style: 'currency',
        currency: CURRENCY,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
};

// Ticker Tape component for Focus Mode
interface TickerTapeProps {
    styles: StyleRecord[];
}

export const TickerTape: React.FC<TickerTapeProps> = ({ styles }) => {
    const analytics = useAnalyticsData(styles);

    if (styles.length === 0) return null;

    return (
        <div className="ticker-tape">
            <div className="ticker-item">
                <DollarSign size={14} />
                <span className="ticker-label">Rev:</span>
                <span className="ticker-value">{formatCurrency(analytics.totalRevenue)}</span>
            </div>
            <div className="ticker-separator">|</div>
            <div className="ticker-item ticker-profit">
                <TrendingUp size={14} />
                <span className="ticker-label">Prof:</span>
                <span className={`ticker-value ${analytics.totalProfit >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(analytics.totalProfit)}
                </span>
            </div>
            <div className="ticker-separator">|</div>
            <div className="ticker-item">
                <Percent size={14} />
                <span className="ticker-label">Margin:</span>
                <span className={`ticker-value ${analytics.weightedAvgMargin >= MARGIN_THRESHOLDS.MEDIUM ? 'positive' : analytics.weightedAvgMargin >= MARGIN_THRESHOLDS.LOW ? 'warning' : 'negative'}`}>
                    {analytics.weightedAvgMargin.toFixed(1)}%
                </span>
            </div>
            <div className="ticker-separator">|</div>
            <div className="ticker-item">
                <Package size={14} />
                <span className="ticker-label">Units:</span>
                <span className="ticker-value">{analytics.totalUnits.toLocaleString()}</span>
            </div>
            {analytics.belowTarget > 0 && (
                <>
                    <div className="ticker-separator">|</div>
                    <div className="ticker-item ticker-alert">
                        <AlertTriangle size={14} />
                        <span className="ticker-value negative">{analytics.belowTarget} critical</span>
                    </div>
                </>
            )}
            {analytics.atRisk > 0 && (
                <>
                    <div className="ticker-separator">|</div>
                    <div className="ticker-item ticker-warning">
                        <AlertCircle size={14} />
                        <span className="ticker-value warning">{analytics.atRisk} at risk</span>
                    </div>
                </>
            )}
        </div>
    );
};

interface AnalyticsProps {
    styles: StyleRecord[];
    activeFilter?: string | null;
    onFilterChange?: (filter: string | null) => void;
    onToggleFocusMode?: () => void;
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

export const Analytics: React.FC<AnalyticsProps> = ({ styles, activeFilter, onFilterChange, onToggleFocusMode }) => {
    const analytics = useAnalyticsData(styles);

    // Handle bar click for filtering
    const handleBarClick = (filterKey: string) => {
        if (onFilterChange) {
            onFilterChange(activeFilter === filterKey ? null : filterKey);
        }
    };

    const cards: CardData[] = [
        {
            label: 'Total Revenue',
            value: formatCurrencyFull(analytics.totalRevenue),
            icon: <DollarSign size={24} />,
            color: 'blue',
            subtext: `${analytics.totalItems} items`
        },
        {
            label: 'Total Profit',
            value: formatCurrencyFull(analytics.totalProfit),
            icon: <TrendingUp size={24} />,
            color: analytics.totalProfit >= 0 ? 'green' : 'red'
        },
        {
            label: 'Average Margin',
            value: `${analytics.weightedAvgMargin.toFixed(1)}%`,
            icon: <Percent size={24} />,
            color: analytics.weightedAvgMargin >= MARGIN_THRESHOLDS.MEDIUM ? 'green' : analytics.weightedAvgMargin >= MARGIN_THRESHOLDS.LOW ? 'gold' : 'red'
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
            subtext: `Margin < ${MARGIN_THRESHOLDS.LOW}%`
        },
        {
            label: 'At Risk',
            value: analytics.atRisk.toString(),
            icon: <AlertCircle size={24} />,
            color: analytics.atRisk > 0 ? 'gold' : 'green',
            subtext: `Margin ${MARGIN_THRESHOLDS.LOW}-${MARGIN_THRESHOLDS.MEDIUM}%`
        }
    ];

    const marginDistribution: (MarginBracket & { filterKey: string })[] = [
        {
            label: 'Negative',
            count: analytics.marginBrackets.negative,
            percentage: analytics.totalItems > 0 ? (analytics.marginBrackets.negative / analytics.totalItems) * 100 : 0,
            color: 'var(--red)',
            filterKey: 'negative'
        },
        {
            label: `< ${MARGIN_THRESHOLDS.LOW}%`,
            count: analytics.marginBrackets.low,
            percentage: analytics.totalItems > 0 ? (analytics.marginBrackets.low / analytics.totalItems) * 100 : 0,
            color: '#f87171',
            filterKey: 'low'
        },
        {
            label: `${MARGIN_THRESHOLDS.LOW}-${MARGIN_THRESHOLDS.MEDIUM}%`,
            count: analytics.marginBrackets.medium,
            percentage: analytics.totalItems > 0 ? (analytics.marginBrackets.medium / analytics.totalItems) * 100 : 0,
            color: 'var(--gold)',
            filterKey: 'medium'
        },
        {
            label: `${MARGIN_THRESHOLDS.MEDIUM}-30%`,
            count: analytics.marginBrackets.good,
            percentage: analytics.totalItems > 0 ? (analytics.marginBrackets.good / analytics.totalItems) * 100 : 0,
            color: '#4ade80',
            filterKey: 'good'
        },
        {
            label: '> 30%',
            count: analytics.marginBrackets.excellent,
            percentage: analytics.totalItems > 0 ? (analytics.marginBrackets.excellent / analytics.totalItems) * 100 : 0,
            color: 'var(--green)',
            filterKey: 'excellent'
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
                    {onToggleFocusMode && (
                        <button
                            className="focus-mode-btn-large"
                            onClick={onToggleFocusMode}
                            title="Enter Focus Mode (Shift+F)"
                        >
                            <Maximize2 size={20} />
                            <span>Focus Mode</span>
                        </button>
                    )}
                </div>
                <div className="analytics-chart">
                    {marginDistribution.map((bracket, index) => (
                        <div
                            key={index}
                            className={`analytics-bar-group ${activeFilter === bracket.filterKey ? 'active-filter' : ''}`}
                            onClick={() => handleBarClick(bracket.filterKey)}
                            title={`Click to filter by ${bracket.label}`}
                        >
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
