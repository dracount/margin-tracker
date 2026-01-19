import React, { useEffect, useState, useCallback, useRef } from 'react';
import pb from '../lib/pocketbase';
import { StyleRecord, useMarginCalculator } from '../hooks/useMarginCalculator';
import { useDebounce } from '../hooks/useDebounce';
import { Analytics } from './Analytics';
import { useToast } from './Toast';
import { validateField, getApiErrorMessage, withRetry } from '../utils/validation';

interface DashboardProps {
    customerId: string;
    customerName?: string;
    onStylesLoaded?: (styles: StyleRecord[]) => void;
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'success' | 'error';

interface FieldErrors {
    units?: string;
    pack?: string;
    price?: string;
    rate?: string;
    extraCost?: string;
    sellingPrice?: string;
}

interface DashboardRowProps {
    style: StyleRecord;
    onUpdate: (id: string, data: Partial<StyleRecord>) => Promise<boolean>;
}

const DashboardRow: React.FC<DashboardRowProps> = ({ style, onUpdate }) => {
    const [localStyle, setLocalStyle] = useState(style);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [touchedFields, setTouchedFields] = useState<Set<keyof FieldErrors>>(new Set());
    const previousStyleRef = useRef<StyleRecord>(style);

    const calculated = useMarginCalculator(localStyle);

    // Debounce the entire localStyle object for auto-save (400ms delay)
    const debouncedStyle = useDebounce(localStyle, 400);

    // Sync with external updates (from real-time subscription)
    useEffect(() => {
        // Only update if the external style changed and we don't have unsaved changes
        if (JSON.stringify(style) !== JSON.stringify(previousStyleRef.current)) {
            if (!hasUnsavedChanges) {
                setLocalStyle(style);
                setErrors({});
                setTouchedFields(new Set());
            }
            previousStyleRef.current = style;
        }
    }, [style, hasUnsavedChanges]);

    // Validate all fields and check if save is allowed
    const hasValidationErrors = useCallback((): boolean => {
        const fieldsToCheck: (keyof FieldErrors)[] = ['units', 'price', 'rate', 'extraCost', 'sellingPrice'];
        for (const field of fieldsToCheck) {
            const error = validateField(field, localStyle[field]);
            if (error) {
                return true;
            }
        }
        return false;
    }, [localStyle]);

    // Auto-save when debounced value changes (only if validation passes)
    useEffect(() => {
        const performSave = async () => {
            if (JSON.stringify(debouncedStyle) !== JSON.stringify(style) && hasUnsavedChanges) {
                // Check validation before saving
                if (hasValidationErrors()) {
                    setSaveStatus('error');
                    return;
                }

                setSaveStatus('saving');
                const success = await onUpdate(style.id, debouncedStyle);
                if (success) {
                    setSaveStatus('success');
                    setHasUnsavedChanges(false);
                    setErrors({});
                    setTouchedFields(new Set());
                    // Reset to idle after showing success
                    setTimeout(() => setSaveStatus('idle'), 1500);
                } else {
                    setSaveStatus('error');
                    // Revert optimistic update on failure
                    setLocalStyle(style);
                    setHasUnsavedChanges(false);
                    // Reset to idle after showing error
                    setTimeout(() => setSaveStatus('idle'), 2000);
                }
            }
        };

        performSave();
    }, [debouncedStyle, style, onUpdate, hasUnsavedChanges, hasValidationErrors]);

    const handleChange = (field: keyof StyleRecord, value: string | number) => {
        // Optimistic update - immediately update the UI
        setLocalStyle(prev => ({ ...prev, [field]: value }));
        setHasUnsavedChanges(true);

        // Validate field on change
        if (field in errors || touchedFields.has(field as keyof FieldErrors)) {
            const error = validateField(field as keyof FieldErrors, value);
            setErrors(prev => ({
                ...prev,
                [field]: error || undefined
            }));
        }

        setSaveStatus('pending');
    };

    const handleBlur = (field: keyof FieldErrors) => {
        setTouchedFields(prev => new Set(prev).add(field));
        const error = validateField(field, localStyle[field]);
        setErrors(prev => ({
            ...prev,
            [field]: error || undefined
        }));
    };

    // Determine row class based on save status
    const getRowClassName = () => {
        switch (saveStatus) {
            case 'pending':
                return 'row-pending';
            case 'saving':
                return 'row-saving';
            case 'success':
                return 'row-success';
            case 'error':
                return 'row-error';
            default:
                return '';
        }
    };

    // Determine input class based on save status and validation
    const getInputClassName = (field?: keyof FieldErrors) => {
        const hasError = field && errors[field];
        const baseClass = hasError ? 'input-validation-error' : '';

        switch (saveStatus) {
            case 'saving':
                return `${baseClass} input-saving`.trim();
            case 'success':
                return `${baseClass} input-success`.trim();
            case 'error':
                return `${baseClass} input-error`.trim();
            default:
                return baseClass;
        }
    };

    const renderValidatedInput = (
        field: keyof FieldErrors,
        type: 'number' | 'text' = 'number'
    ) => (
        <div className="validated-input-container">
            <div className="input-wrapper">
                <input
                    type={type}
                    value={localStyle[field]}
                    onChange={e => handleChange(field, type === 'number' ? Number(e.target.value) : e.target.value)}
                    onBlur={() => handleBlur(field)}
                    className={getInputClassName(field)}
                />
                {saveStatus === 'saving' && <span className="input-spinner" />}
            </div>
            {errors[field] && touchedFields.has(field) && (
                <span className="field-error-message">{errors[field]}</span>
            )}
        </div>
    );

    return (
        <tr className={getRowClassName()}>
            <td>{localStyle.styleId}</td>
            <td>{localStyle.factory}</td>
            <td>{localStyle.description}</td>
            <td>
                <div className="input-wrapper">
                    <input
                        type="text"
                        value={localStyle.fabricTrim || ''}
                        onChange={e => handleChange('fabricTrim', e.target.value)}
                        className={getInputClassName()}
                    />
                    {saveStatus === 'saving' && <span className="input-spinner" />}
                </div>
            </td>
            <td>{renderValidatedInput('units')}</td>
            <td>{localStyle.pack}</td>
            <td>{renderValidatedInput('price')}</td>
            <td>{renderValidatedInput('rate')}</td>
            <td>{calculated.lc}</td>
            <td>{renderValidatedInput('extraCost')}</td>
            <td style={{ fontWeight: 700 }}>{calculated.totalCost}</td>
            <td>{renderValidatedInput('sellingPrice')}</td>
            <td>
                <span className={`margin-pill ${calculated.marginStatus}`}>
                    {calculated.margin}%
                </span>
            </td>
            <td style={{ fontWeight: 700 }}>{calculated.profit}</td>
            <td style={{ fontWeight: 700 }}>{calculated.profitPerPack}</td>
            <td>{calculated.val1}</td>
            <td>{calculated.val2}</td>
            <td className="status-cell">
                {saveStatus === 'saving' && (
                    <span className="status-indicator status-saving" title="Saving...">
                        <span className="mini-spinner" />
                    </span>
                )}
                {saveStatus === 'success' && (
                    <span className="status-indicator status-success" title="Saved">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    </span>
                )}
                {saveStatus === 'error' && (
                    <span className="status-indicator status-error" title="Error saving">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                    </span>
                )}
            </td>
        </tr>
    );
};

// Skeleton row for loading state
const SkeletonRow: React.FC = () => (
    <tr className="skeleton-row">
        {[...Array(18)].map((_, i) => (
            <td key={i}>
                <div className="skeleton-cell" />
            </td>
        ))}
    </tr>
);

type SortColumn = keyof StyleRecord | 'margin' | 'totalCost' | 'profit' | 'profitPerPack' | 'lc' | 'val1' | 'val2';
type SortDirection = 'asc' | 'desc';

export const Dashboard: React.FC<DashboardProps> = ({ customerId, onStylesLoaded }) => {
    const [styles, setStyles] = useState<StyleRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const toast = useToast();

    const fetchStyles = useCallback(async () => {
        try {
            const records = await withRetry(
                () => pb.collection('styles').getFullList<StyleRecord>({
                    filter: `customer = "${customerId}"`,
                    sort: 'styleId',
                    requestKey: null, // Disable auto-cancellation
                }),
                3,
                1000,
                (attempt) => {
                    toast.warning('Connection issue', `Retrying... (attempt ${attempt + 1})`);
                }
            );
            setStyles(records);
        } catch (err) {
            console.error('Error fetching styles:', err);
            toast.error('Failed to load styles', getApiErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }, [customerId, toast]);

    useEffect(() => {
        fetchStyles();

        // Real-time subscription
        let unsubscribed = false;

        pb.collection('styles').subscribe<StyleRecord>('*', function (e) {
            if (unsubscribed) return;

            setIsRefreshing(true);
            if (e.action === 'update' && e.record.customer === customerId) {
                setStyles(prev => prev.map(s => s.id === e.record.id ? e.record : s));
            } else if (e.action === 'create' && e.record.customer === customerId) {
                setStyles(prev => [e.record, ...prev]);
            } else if (e.action === 'delete') {
                setStyles(prev => prev.filter(s => s.id !== e.record.id));
            }
            // Brief indicator for real-time updates
            setTimeout(() => setIsRefreshing(false), 500);
        }).catch(err => {
            console.error('Subscription error:', err);
            toast.warning('Real-time updates unavailable', 'Changes from other users may not appear immediately.');
        });

        return () => {
            unsubscribed = true;
            pb.collection('styles').unsubscribe();
        };
    }, [customerId, fetchStyles, toast]);

    // Notify parent when styles change
    useEffect(() => {
        if (onStylesLoaded) {
            onStylesLoaded(styles);
        }
    }, [styles, onStylesLoaded]);

    const handleUpdate = useCallback(async (id: string, data: Partial<StyleRecord>): Promise<boolean> => {
        try {
            await withRetry(
                () => pb.collection('styles').update(id, data),
                3,
                1000,
                (attempt) => {
                    toast.warning('Save failed', `Retrying... (attempt ${attempt + 1})`);
                }
            );
            toast.success('Saved', 'Changes saved successfully');
            return true;
        } catch (err) {
            console.error('Error updating record:', err);
            toast.error('Failed to save', getApiErrorMessage(err));
            return false;
        }
    }, [toast]);

    // Helper function to calculate derived values for sorting
    const getCalculatedValue = useCallback((style: StyleRecord, column: SortColumn): number | string => {
        const lc = style.price * style.rate;
        const totalCost = lc + style.extraCost;
        const margin = style.sellingPrice > 0
            ? ((style.sellingPrice - totalCost) / style.sellingPrice) * 100
            : 0;
        const profit = (style.sellingPrice - totalCost) * style.units;
        const profitPerPack = style.pack > 0 ? profit / (style.units / style.pack) : 0;
        const val1 = style.sellingPrice * style.units;
        const val2 = totalCost * style.units;

        switch (column) {
            case 'lc': return lc;
            case 'totalCost': return totalCost;
            case 'margin': return margin;
            case 'profit': return profit;
            case 'profitPerPack': return profitPerPack;
            case 'val1': return val1;
            case 'val2': return val2;
            default: return style[column as keyof StyleRecord] ?? '';
        }
    }, []);

    // Handle column header click for sorting
    const handleSort = useCallback((column: SortColumn) => {
        if (sortColumn === column) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    }, [sortColumn]);

    // Sort styles based on current sort column and direction
    const sortedStyles = React.useMemo(() => {
        if (!sortColumn) return styles;

        return [...styles].sort((a, b) => {
            const aVal = getCalculatedValue(a, sortColumn);
            const bVal = getCalculatedValue(b, sortColumn);

            let comparison = 0;
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                comparison = aVal - bVal;
            } else {
                comparison = String(aVal).localeCompare(String(bVal));
            }

            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [styles, sortColumn, sortDirection, getCalculatedValue]);

    // Skeleton loading for initial fetch
    if (loading) {
        return (
            <>
                <div className="analytics-loading">
                    <div className="analytics-cards">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="analytics-card skeleton-card">
                                <div className="skeleton-icon" />
                                <div className="analytics-card-content">
                                    <div className="skeleton-text skeleton-label" />
                                    <div className="skeleton-text skeleton-value" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="dashboard-card">
                    <div className="dashboard-loading-header">
                        <span className="loading-text">Loading dashboard</span>
                        <span className="loading-dots">
                            <span>.</span><span>.</span><span>.</span>
                        </span>
                    </div>
                    <div className="dashboard-table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Style #</th>
                                    <th>Factory</th>
                                    <th>Description</th>
                                    <th>Fabric/Trim</th>
                                    <th>Units</th>
                                    <th>Pack</th>
                                    <th>Price</th>
                                    <th>Rate</th>
                                    <th>LC (ZAR)</th>
                                    <th>Extra (ZAR)</th>
                                    <th>Total Cost</th>
                                    <th>Selling (ZAR)</th>
                                    <th>Margin</th>
                                    <th>Profit</th>
                                    <th>Profit/Pack</th>
                                    <th>Val1</th>
                                    <th>Val2</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...Array(5)].map((_, i) => (
                                    <SkeletonRow key={i} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Analytics styles={styles} />
            <div className={`dashboard-card ${isRefreshing ? 'dashboard-refreshing' : ''}`}>
                {isRefreshing && (
                    <div className="refresh-indicator">
                        <span className="mini-spinner" />
                        <span>Syncing...</span>
                    </div>
                )}
                <div className="dashboard-table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th className="sortable-header" onClick={() => handleSort('styleId')}>
                                    Style # {sortColumn === 'styleId' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('factory')}>
                                    Factory {sortColumn === 'factory' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('description')}>
                                    Description {sortColumn === 'description' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('fabricTrim')}>
                                    Fabric/Trim {sortColumn === 'fabricTrim' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('units')}>
                                    Units {sortColumn === 'units' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('pack')}>
                                    Pack {sortColumn === 'pack' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('price')}>
                                    Price {sortColumn === 'price' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('rate')}>
                                    Rate {sortColumn === 'rate' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('lc')}>
                                    LC (ZAR) {sortColumn === 'lc' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('extraCost')}>
                                    Extra (ZAR) {sortColumn === 'extraCost' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('totalCost')}>
                                    Total Cost {sortColumn === 'totalCost' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('sellingPrice')}>
                                    Selling (ZAR) {sortColumn === 'sellingPrice' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('margin')}>
                                    Margin {sortColumn === 'margin' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('profit')}>
                                    Profit {sortColumn === 'profit' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('profitPerPack')}>
                                    Profit/Pack {sortColumn === 'profitPerPack' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('val1')}>
                                    Val1 {sortColumn === 'val1' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th className="sortable-header" onClick={() => handleSort('val2')}>
                                    Val2 {sortColumn === 'val2' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedStyles.map(style => (
                                <DashboardRow key={style.id} style={style} onUpdate={handleUpdate} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
};
