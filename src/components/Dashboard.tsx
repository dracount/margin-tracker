import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Maximize2, Minimize2, Trash2, X, Info, Settings, Eye, EyeOff } from 'lucide-react';
import pb from '../lib/pocketbase';
import { StyleRecord, useMarginCalculator } from '../hooks/useMarginCalculator';
import { useDebounce } from '../hooks/useDebounce';
import { Analytics, TickerTape } from './Analytics';
import { useToast } from './Toast';
import { validateField, getApiErrorMessage, withRetry } from '../utils/validation';

interface DashboardProps {
    customerId: string;
    customerName?: string;
    onStylesLoaded?: (styles: StyleRecord[]) => void;
}

// Persistence keys
const FOCUS_MODE_KEY = 'dashboard_focus_mode';
const HIDDEN_COLUMNS_KEY = 'dashboard_hidden_columns';

// Columns that can be hidden
const HIDEABLE_COLUMNS = [
    { key: 'factory', label: 'Factory' },
    { key: 'description', label: 'Description' },
    { key: 'fabricTrim', label: 'Fabric/Trim' },
    { key: 'pack', label: 'Pack' },
    { key: 'rate', label: 'Rate' },
    { key: 'lc', label: 'LC (ZAR)' },
    { key: 'extraCost', label: 'Extra (ZAR)' },
    { key: 'profitPerPack', label: 'Profit/Pack' },
    { key: 'val1', label: 'Val1' },
    { key: 'val2', label: 'Val2' },
] as const;

type SaveStatus = 'idle' | 'pending' | 'saving' | 'success' | 'error';

interface FieldErrors {
    units?: string;
    pack?: string;
    price?: string;
    rate?: string;
    extraCost?: string;
    sellingPrice?: string;
}

// Editable field columns for keyboard navigation
const EDITABLE_FIELDS = ['fabricTrim', 'units', 'price', 'rate', 'extraCost', 'sellingPrice'] as const;

interface DashboardRowProps {
    style: StyleRecord;
    rowIndex: number;
    isSelected: boolean;
    maxUnits: number;
    isColVisible: (key: string) => boolean;
    onUpdate: (id: string, data: Partial<StyleRecord>) => Promise<boolean>;
    onDelete: (id: string) => Promise<void>;
    onSelect: (id: string, shiftKey: boolean) => void;
    onNavigate: (rowIndex: number, fieldIndex: number, direction: 'up' | 'down' | 'left' | 'right') => void;
    focusedCell: { rowIndex: number; fieldIndex: number } | null;
    onFocusCell: (rowIndex: number, fieldIndex: number) => void;
    onOpenDrawer: (style: StyleRecord) => void;
}

// Inline Selection Actions component (appears in filter bar)
interface InlineSelectionActionsProps {
    selectedCount: number;
    onClearSelection: () => void;
    onBulkDelete: () => void;
    isDeleting: boolean;
}

const InlineSelectionActions: React.FC<InlineSelectionActionsProps> = ({ selectedCount, onClearSelection, onBulkDelete, isDeleting }) => {
    return (
        <div className={`inline-selection-actions ${selectedCount === 0 ? 'hidden' : ''}`}>
            <span className="selection-count">{selectedCount} selected</span>
            <button className="inline-action-btn inline-action-delete" onClick={onBulkDelete} disabled={isDeleting || selectedCount === 0} title="Delete selected rows">
                {isDeleting ? <span className="mini-spinner" /> : <Trash2 size={14} />}
            </button>
            <button className="inline-action-btn inline-action-clear" onClick={onClearSelection} disabled={selectedCount === 0} title="Clear selection">
                <X size={14} />
            </button>
        </div>
    );
};

// Column Settings Dropdown component
interface ColumnSettingsProps {
    hiddenColumns: Set<string>;
    onToggleColumn: (key: string) => void;
    isOpen: boolean;
    onToggle: () => void;
}

const ColumnSettings: React.FC<ColumnSettingsProps> = ({ hiddenColumns, onToggleColumn, isOpen, onToggle }) => {
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                if (isOpen) onToggle();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onToggle]);

    return (
        <div className="column-settings" ref={dropdownRef}>
            <button
                className={`column-settings-btn ${isOpen ? 'active' : ''}`}
                onClick={onToggle}
                title="Column visibility"
            >
                <Settings size={18} />
            </button>
            {isOpen && (
                <div className="column-settings-dropdown">
                    <div className="column-settings-header">Column Visibility</div>
                    {HIDEABLE_COLUMNS.map(col => (
                        <label key={col.key} className="column-settings-item">
                            <input
                                type="checkbox"
                                checked={!hiddenColumns.has(col.key)}
                                onChange={() => onToggleColumn(col.key)}
                            />
                            {hiddenColumns.has(col.key) ? <EyeOff size={14} /> : <Eye size={14} />}
                            <span>{col.label}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

// Context Drawer component for style details
interface ContextDrawerProps {
    style: StyleRecord | null;
    isOpen: boolean;
    onClose: () => void;
    onUpdate: (id: string, data: Partial<StyleRecord>) => Promise<boolean>;
}

interface DrawerEditState {
    fabricTrim: string;
    units: number;
    pack: number;
    price: number;
    rate: number;
    extraCost: number;
    sellingPrice: number;
}

const ContextDrawer: React.FC<ContextDrawerProps> = ({ style, isOpen, onClose, onUpdate }) => {
    // Local state for editable fields
    const [editState, setEditState] = useState<DrawerEditState>({
        fabricTrim: '',
        units: 0,
        pack: 0,
        price: 0,
        rate: 0,
        extraCost: 0,
        sellingPrice: 0,
    });
    const [hasChanges, setHasChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Sync local state with incoming style
    useEffect(() => {
        if (style) {
            setEditState({
                fabricTrim: style.fabricTrim || '',
                units: style.units,
                pack: style.pack,
                price: style.price,
                rate: style.rate,
                extraCost: style.extraCost,
                sellingPrice: style.sellingPrice,
            });
            setHasChanges(false);
        }
    }, [style]);

    // Calculate derived values using the edited state
    const calculatedStyle = style ? { ...style, ...editState } : ({} as StyleRecord);
    const calculated = useMarginCalculator(calculatedStyle);

    // Handle field changes
    const handleFieldChange = (field: keyof DrawerEditState, value: string | number) => {
        setEditState(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    // Handle save
    const handleSave = async () => {
        if (!style || !hasChanges) return;

        setIsSaving(true);
        const success = await onUpdate(style.id, editState);
        setIsSaving(false);

        if (success) {
            setHasChanges(false);
        }
    };

    // Handle escape key to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!style) return null;

    return (
        <>
            <div className={`context-drawer-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
            <div className={`context-drawer ${isOpen ? 'open' : ''}`}>
                <div className="context-drawer-header">
                    <div className="context-drawer-title">
                        <Info size={20} />
                        Style Details
                    </div>
                    <button className="context-drawer-close" onClick={onClose} title="Close (Esc)">
                        <X size={20} />
                    </button>
                </div>
                <div className="context-drawer-content">
                    <div className="context-section">
                        <div className="context-section-title">Basic Information</div>
                        <div className="context-detail-grid">
                            <div className="context-detail-item">
                                <div className="context-detail-label">Style #</div>
                                <div className="context-detail-value">{style.styleId}</div>
                            </div>
                            <div className="context-detail-item">
                                <div className="context-detail-label">Factory</div>
                                <div className="context-detail-value">{style.factory || '-'}</div>
                            </div>
                            <div className="context-detail-item full-width">
                                <div className="context-detail-label">Description</div>
                                <div className="context-detail-value">{style.description || '-'}</div>
                            </div>
                            <div className="context-detail-item full-width editable">
                                <div className="context-detail-label">Fabric/Trim</div>
                                <input
                                    type="text"
                                    className="drawer-input"
                                    value={editState.fabricTrim}
                                    onChange={(e) => handleFieldChange('fabricTrim', e.target.value)}
                                    placeholder="Enter fabric/trim..."
                                />
                            </div>
                        </div>
                    </div>

                    <div className="context-section">
                        <div className="context-section-title">Quantity</div>
                        <div className="context-detail-grid">
                            <div className="context-detail-item editable">
                                <div className="context-detail-label">Units</div>
                                <input
                                    type="number"
                                    className="drawer-input"
                                    value={editState.units}
                                    onChange={(e) => handleFieldChange('units', Number(e.target.value))}
                                    min="0"
                                />
                            </div>
                            <div className="context-detail-item editable">
                                <div className="context-detail-label">Pack</div>
                                <input
                                    type="number"
                                    className="drawer-input"
                                    value={editState.pack}
                                    onChange={(e) => handleFieldChange('pack', Number(e.target.value))}
                                    min="1"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="context-section">
                        <div className="context-section-title">Pricing</div>
                        <div className="context-detail-grid">
                            <div className="context-detail-item editable">
                                <div className="context-detail-label">Price</div>
                                <input
                                    type="number"
                                    className="drawer-input"
                                    value={editState.price}
                                    onChange={(e) => handleFieldChange('price', Number(e.target.value))}
                                    step="0.01"
                                    min="0"
                                />
                            </div>
                            <div className="context-detail-item editable">
                                <div className="context-detail-label">Rate</div>
                                <input
                                    type="number"
                                    className="drawer-input"
                                    value={editState.rate}
                                    onChange={(e) => handleFieldChange('rate', Number(e.target.value))}
                                    step="0.0001"
                                    min="0"
                                />
                            </div>
                            <div className="context-detail-item">
                                <div className="context-detail-label">LC (ZAR)</div>
                                <div className="context-detail-value">{calculated.lc}</div>
                            </div>
                            <div className="context-detail-item editable">
                                <div className="context-detail-label">Extra Cost (ZAR)</div>
                                <input
                                    type="number"
                                    className="drawer-input"
                                    value={editState.extraCost}
                                    onChange={(e) => handleFieldChange('extraCost', Number(e.target.value))}
                                    step="0.01"
                                    min="0"
                                />
                            </div>
                            <div className="context-detail-item">
                                <div className="context-detail-label">Total Cost</div>
                                <div className="context-detail-value">{calculated.totalCost}</div>
                            </div>
                            <div className="context-detail-item editable">
                                <div className="context-detail-label">Selling Price (ZAR)</div>
                                <input
                                    type="number"
                                    className="drawer-input"
                                    value={editState.sellingPrice}
                                    onChange={(e) => handleFieldChange('sellingPrice', Number(e.target.value))}
                                    step="0.01"
                                    min="0"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="context-section">
                        <div className="context-section-title">Profitability</div>
                        <div className="context-margin-display">
                            <div className={`context-margin-value ${calculated.marginStatus}`}>
                                {calculated.margin}%
                            </div>
                            <div className="context-margin-label">Margin</div>
                        </div>
                        <div className="context-detail-grid" style={{ marginTop: '0.75rem' }}>
                            <div className="context-detail-item">
                                <div className="context-detail-label">Total Profit</div>
                                <div className="context-detail-value">{calculated.profit}</div>
                            </div>
                            <div className="context-detail-item">
                                <div className="context-detail-label">Profit/Pack</div>
                                <div className="context-detail-value">{calculated.profitPerPack}</div>
                            </div>
                            <div className="context-detail-item">
                                <div className="context-detail-label">Revenue (Val1)</div>
                                <div className="context-detail-value">{calculated.val1}</div>
                            </div>
                            <div className="context-detail-item">
                                <div className="context-detail-label">Cost (Val2)</div>
                                <div className="context-detail-value">{calculated.val2}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="context-drawer-footer">
                    <button
                        className="drawer-save-btn"
                        onClick={handleSave}
                        disabled={!hasChanges || isSaving}
                    >
                        {isSaving ? (
                            <>
                                <span className="mini-spinner" />
                                Saving...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </button>
                </div>
            </div>
        </>
    );
};

const DashboardRow: React.FC<DashboardRowProps> = React.memo(({
    style,
    rowIndex,
    isSelected,
    maxUnits,
    isColVisible,
    onUpdate,
    onDelete,
    onSelect,
    onNavigate,
    focusedCell,
    onFocusCell,
    onOpenDrawer
}) => {
    const [localStyle, setLocalStyle] = useState(style);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [isDeleting, setIsDeleting] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [touchedFields, setTouchedFields] = useState<Set<keyof FieldErrors>>(new Set());
    const previousStyleRef = useRef<StyleRecord>(style);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const calculated = useMarginCalculator(localStyle);

    // Focus the cell when focusedCell matches this row
    useEffect(() => {
        if (focusedCell && focusedCell.rowIndex === rowIndex) {
            const input = inputRefs.current[focusedCell.fieldIndex];
            if (input) {
                input.focus();
                input.select();
            }
        }
    }, [focusedCell, rowIndex]);

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

    // Keyboard navigation handler
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, fieldIndex: number) => {
        switch (e.key) {
            case 'Tab':
                e.preventDefault();
                if (e.shiftKey) {
                    // Move left or to previous row
                    if (fieldIndex > 0) {
                        onNavigate(rowIndex, fieldIndex, 'left');
                    } else {
                        onNavigate(rowIndex, fieldIndex, 'up');
                    }
                } else {
                    // Move right or to next row
                    if (fieldIndex < EDITABLE_FIELDS.length - 1) {
                        onNavigate(rowIndex, fieldIndex, 'right');
                    } else {
                        onNavigate(rowIndex, fieldIndex, 'down');
                    }
                }
                break;
            case 'Enter':
                e.preventDefault();
                onNavigate(rowIndex, fieldIndex, 'down');
                break;
            case 'ArrowUp':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    onNavigate(rowIndex, fieldIndex, 'up');
                }
                break;
            case 'ArrowDown':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    onNavigate(rowIndex, fieldIndex, 'down');
                }
                break;
            case 'ArrowLeft':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    onNavigate(rowIndex, fieldIndex, 'left');
                }
                break;
            case 'ArrowRight':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    onNavigate(rowIndex, fieldIndex, 'right');
                }
                break;
        }
    };

    // Handle row checkbox click
    const handleCheckboxClick = (e: React.MouseEvent) => {
        onSelect(style.id, e.shiftKey);
    };

    const handleDelete = async () => {
        if (isDeleting) return;
        setIsDeleting(true);
        try {
            await onDelete(style.id);
        } finally {
            setIsDeleting(false);
        }
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
        fieldIndex: number,
        type: 'number' | 'text' = 'number'
    ) => (
        <div className="validated-input-container">
            <div className="input-wrapper">
                <input
                    ref={el => inputRefs.current[fieldIndex] = el}
                    type={type}
                    value={localStyle[field]}
                    onChange={e => handleChange(field, type === 'number' ? Number(e.target.value) : e.target.value)}
                    onBlur={() => handleBlur(field)}
                    onKeyDown={e => handleKeyDown(e, fieldIndex)}
                    onFocus={() => onFocusCell(rowIndex, fieldIndex)}
                    className={getInputClassName(field)}
                />
                {saveStatus === 'saving' && <span className="input-spinner" />}
            </div>
            {errors[field] && touchedFields.has(field) && (
                <span className="field-error-message">{errors[field]}</span>
            )}
        </div>
    );

    // Get margin status class for status pillar
    const getMarginStatusClass = () => {
        const marginNum = parseFloat(calculated.margin);
        if (marginNum < 15) return 'status-critical';
        if (marginNum < 22) return 'status-warning';
        if (marginNum >= 30) return 'status-excellent';
        return 'status-good';
    };

    return (
        <tr className={`${getRowClassName()} ${isSelected ? 'row-selected' : ''} ${getMarginStatusClass()}`}>
            <td className="checkbox-cell">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    onClick={handleCheckboxClick}
                    className="row-checkbox"
                />
            </td>
            <td className="sticky-col-style" onClick={() => onOpenDrawer(style)}>
                {localStyle.styleId}
            </td>
            {isColVisible('factory') && <td>{localStyle.factory}</td>}
            {isColVisible('description') && <td>{localStyle.description}</td>}
            {isColVisible('fabricTrim') && (
                <td>
                    <div className="input-wrapper">
                        <input
                            ref={el => inputRefs.current[0] = el}
                            type="text"
                            value={localStyle.fabricTrim || ''}
                            onChange={e => handleChange('fabricTrim', e.target.value)}
                            onKeyDown={e => handleKeyDown(e, 0)}
                            onFocus={() => onFocusCell(rowIndex, 0)}
                            className={getInputClassName()}
                        />
                        {saveStatus === 'saving' && <span className="input-spinner" />}
                    </div>
                </td>
            )}
            <td className="sparkline-cell">
                <div className="sparkline-bar" style={{ width: `${Math.min(100, (localStyle.units / maxUnits) * 100)}%` }} />
                <div className="sparkline-value">{renderValidatedInput('units', 1)}</div>
            </td>
            {isColVisible('pack') && <td>{localStyle.pack}</td>}
            <td>{renderValidatedInput('price', 2)}</td>
            {isColVisible('rate') && <td>{renderValidatedInput('rate', 3)}</td>}
            {isColVisible('lc') && <td>{calculated.lc}</td>}
            {isColVisible('extraCost') && <td>{renderValidatedInput('extraCost', 4)}</td>}
            <td style={{ fontWeight: 700 }}>{calculated.totalCost}</td>
            <td>{renderValidatedInput('sellingPrice', 5)}</td>
            <td>
                <span className={`margin-pill ${calculated.marginStatus}`}>
                    {calculated.margin}%
                </span>
            </td>
            <td style={{ fontWeight: 700 }}>{calculated.profit}</td>
            {isColVisible('profitPerPack') && <td style={{ fontWeight: 700 }}>{calculated.profitPerPack}</td>}
            {isColVisible('val1') && <td>{calculated.val1}</td>}
            {isColVisible('val2') && <td>{calculated.val2}</td>}
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
            <td className="delete-cell">
                <button
                    className="btn-delete-row"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    title="Delete row"
                >
                    {isDeleting ? (
                        <span className="mini-spinner" />
                    ) : (
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                    )}
                </button>
            </td>
        </tr>
    );
});

// Skeleton row for loading state
const SkeletonRow: React.FC = () => (
    <tr className="skeleton-row">
        {[...Array(20)].map((_, i) => (
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
    const [filterText, setFilterText] = useState('');
    const [focusMode, setFocusMode] = useState<boolean>(() => {
        const saved = localStorage.getItem(FOCUS_MODE_KEY);
        return saved === 'true';
    });
    // Selection state for bulk actions
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
    const [focusedCell, setFocusedCell] = useState<{ rowIndex: number; fieldIndex: number } | null>(null);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    // Margin filter from chart interaction
    const [marginFilter, setMarginFilter] = useState<string | null>(null);
    // Context drawer state
    const [drawerStyle, setDrawerStyle] = useState<StyleRecord | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    // Column visibility state
    const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
        const saved = localStorage.getItem(HIDDEN_COLUMNS_KEY);
        return saved ? new Set(JSON.parse(saved)) : new Set();
    });
    const [showColumnSettings, setShowColumnSettings] = useState(false);
    // Dirty state tracking (set by row components when they have unsaved changes)
    const [hasDirtyRows] = useState(false); // TODO: Implement dirty state tracking from rows
    const toast = useToast();

    // Open context drawer
    const openDrawer = useCallback((style: StyleRecord) => {
        setDrawerStyle(style);
        setIsDrawerOpen(true);
    }, []);

    // Close context drawer
    const closeDrawer = useCallback(() => {
        setIsDrawerOpen(false);
    }, []);

    // Toggle column visibility
    const toggleColumn = useCallback((columnKey: string) => {
        setHiddenColumns(prev => {
            const newSet = new Set(prev);
            if (newSet.has(columnKey)) {
                newSet.delete(columnKey);
            } else {
                newSet.add(columnKey);
            }
            localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify([...newSet]));
            return newSet;
        });
    }, []);

    // Check if column is visible
    const isColumnVisible = useCallback((columnKey: string) => {
        return !hiddenColumns.has(columnKey);
    }, [hiddenColumns]);

    // Dirty state warning on page unload
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasDirtyRows) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasDirtyRows]);

    // Toggle focus mode with localStorage persistence
    const toggleFocusMode = useCallback(() => {
        setFocusMode(prev => {
            const newValue = !prev;
            localStorage.setItem(FOCUS_MODE_KEY, String(newValue));
            return newValue;
        });
    }, []);

    // Keyboard shortcut: Shift+F for focus mode toggle, Escape to clear selection
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.shiftKey && e.key === 'F') {
                e.preventDefault();
                toggleFocusMode();
            }
            if (e.key === 'Escape') {
                setSelectedIds(new Set());
                setFocusedCell(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleFocusMode]);

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

    const handleDelete = useCallback(async (id: string): Promise<void> => {
        try {
            await withRetry(
                () => pb.collection('styles').delete(id),
                3,
                1000,
                (attempt) => {
                    toast.warning('Delete failed', `Retrying... (attempt ${attempt + 1})`);
                }
            );
            setStyles(prev => prev.filter(s => s.id !== id));
            toast.success('Deleted', 'Row deleted successfully');
        } catch (err) {
            console.error('Error deleting record:', err);
            toast.error('Failed to delete', getApiErrorMessage(err));
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

    // Helper to calculate margin for a style
    const calculateMargin = useCallback((style: StyleRecord) => {
        const lc = (style.price * style.rate) / 6.2;
        const totalCost = lc + style.extraCost;
        return style.sellingPrice > 0
            ? ((style.sellingPrice - totalCost) / style.sellingPrice) * 100
            : 0;
    }, []);

    // Filter styles based on search text and margin filter
    const filteredStyles = React.useMemo(() => {
        let result = styles;

        // Apply text filter
        if (filterText.trim()) {
            const searchLower = filterText.toLowerCase().trim();
            result = result.filter(style => {
                return (
                    style.styleId?.toLowerCase().includes(searchLower) ||
                    style.factory?.toLowerCase().includes(searchLower) ||
                    style.description?.toLowerCase().includes(searchLower) ||
                    style.fabricTrim?.toLowerCase().includes(searchLower) ||
                    style.type?.toLowerCase().includes(searchLower)
                );
            });
        }

        // Apply margin filter from chart interaction
        if (marginFilter) {
            result = result.filter(style => {
                const margin = calculateMargin(style);
                switch (marginFilter) {
                    case 'negative': return margin < 0;
                    case 'low': return margin >= 0 && margin < 15;
                    case 'medium': return margin >= 15 && margin < 22;
                    case 'good': return margin >= 22 && margin < 30;
                    case 'excellent': return margin >= 30;
                    default: return true;
                }
            });
        }

        return result;
    }, [styles, filterText, marginFilter, calculateMargin]);

    // Calculate max units for sparklines
    const maxUnits = React.useMemo(() => {
        return Math.max(...styles.map(s => s.units), 1);
    }, [styles]);

    // Sort styles based on current sort column and direction
    const sortedStyles = React.useMemo(() => {
        if (!sortColumn) return filteredStyles;

        return [...filteredStyles].sort((a, b) => {
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
    }, [filteredStyles, sortColumn, sortDirection, getCalculatedValue]);

    // Row selection handler with shift-select support
    const handleRowSelect = useCallback((id: string, shiftKey: boolean) => {
        const currentIndex = sortedStyles.findIndex(s => s.id === id);

        setSelectedIds(prev => {
            const newSet = new Set(prev);

            if (shiftKey && lastSelectedIndex !== null && currentIndex !== -1) {
                // Shift-select: select range
                const start = Math.min(lastSelectedIndex, currentIndex);
                const end = Math.max(lastSelectedIndex, currentIndex);
                for (let i = start; i <= end; i++) {
                    newSet.add(sortedStyles[i].id);
                }
            } else {
                // Toggle single selection
                if (newSet.has(id)) {
                    newSet.delete(id);
                } else {
                    newSet.add(id);
                }
            }
            return newSet;
        });
        setLastSelectedIndex(currentIndex);
    }, [sortedStyles, lastSelectedIndex]);

    // Select/deselect all visible rows
    const handleSelectAll = useCallback(() => {
        if (selectedIds.size === sortedStyles.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(sortedStyles.map(s => s.id)));
        }
    }, [sortedStyles, selectedIds.size]);

    // Cell navigation handler
    const handleCellNavigate = useCallback((rowIndex: number, fieldIndex: number, direction: 'up' | 'down' | 'left' | 'right') => {
        let newRow = rowIndex;
        let newField = fieldIndex;

        switch (direction) {
            case 'up':
                newRow = Math.max(0, rowIndex - 1);
                break;
            case 'down':
                newRow = Math.min(sortedStyles.length - 1, rowIndex + 1);
                break;
            case 'left':
                newField = Math.max(0, fieldIndex - 1);
                break;
            case 'right':
                newField = Math.min(EDITABLE_FIELDS.length - 1, fieldIndex + 1);
                break;
        }

        setFocusedCell({ rowIndex: newRow, fieldIndex: newField });
    }, [sortedStyles.length]);

    // Focus cell handler
    const handleFocusCell = useCallback((rowIndex: number, fieldIndex: number) => {
        setFocusedCell({ rowIndex, fieldIndex });
    }, []);

    // Bulk delete handler
    const handleBulkDelete = useCallback(async () => {
        if (selectedIds.size === 0) return;

        const confirmed = window.confirm(`Delete ${selectedIds.size} selected row${selectedIds.size > 1 ? 's' : ''}?`);
        if (!confirmed) return;

        setIsBulkDeleting(true);
        const idsToDelete = Array.from(selectedIds);
        let successCount = 0;
        let failCount = 0;

        for (const id of idsToDelete) {
            try {
                await pb.collection('styles').delete(id);
                successCount++;
            } catch (err) {
                console.error('Error deleting record:', err);
                failCount++;
            }
        }

        setStyles(prev => prev.filter(s => !selectedIds.has(s.id)));
        setSelectedIds(new Set());
        setIsBulkDeleting(false);

        if (failCount === 0) {
            toast.success('Deleted', `${successCount} row${successCount > 1 ? 's' : ''} deleted successfully`);
        } else {
            toast.warning('Partial delete', `${successCount} deleted, ${failCount} failed`);
        }
    }, [selectedIds, toast]);

    // Clear selection
    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
        setLastSelectedIndex(null);
    }, []);

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
        <div className={focusMode ? 'focus-mode-active' : ''}>
            {focusMode ? (
                <TickerTape styles={styles} />
            ) : (
                <Analytics
                    styles={styles}
                    activeFilter={marginFilter}
                    onFilterChange={setMarginFilter}
                    onToggleFocusMode={toggleFocusMode}
                />
            )}
            <div className={`dashboard-card ${isRefreshing ? 'dashboard-refreshing' : ''} ${focusMode ? 'dashboard-card-focus' : ''}`}>
                {isRefreshing && (
                    <div className="refresh-indicator">
                        <span className="mini-spinner" />
                        <span>Syncing...</span>
                    </div>
                )}
                <div className="filter-bar">
                    <InlineSelectionActions
                        selectedCount={selectedIds.size}
                        onClearSelection={clearSelection}
                        onBulkDelete={handleBulkDelete}
                        isDeleting={isBulkDeleting}
                    />
                    <button
                        className="focus-mode-toggle"
                        onClick={toggleFocusMode}
                        title={focusMode ? 'Exit Focus Mode (Shift+F)' : 'Enter Focus Mode (Shift+F)'}
                    >
                        {focusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                        <span>{focusMode ? 'Dashboard' : 'Focus'}</span>
                    </button>
                    <ColumnSettings
                        hiddenColumns={hiddenColumns}
                        onToggleColumn={toggleColumn}
                        isOpen={showColumnSettings}
                        onToggle={() => setShowColumnSettings(prev => !prev)}
                    />
                    <div className="filter-input-wrapper">
                        <svg className="filter-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Filter by style, factory, description..."
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            className="filter-input"
                        />
                        {filterText && (
                            <button className="filter-clear" onClick={() => setFilterText('')} title="Clear filter">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        )}
                    </div>
                    {(filterText || marginFilter) && (
                        <span className="filter-count">
                            Showing {sortedStyles.length} of {styles.length} rows
                        </span>
                    )}
                    {marginFilter && (
                        <div className="filter-chips">
                            <span className="filter-chip">
                                Status: {marginFilter === 'negative' ? 'Negative' : marginFilter === 'low' ? 'Critical (<15%)' : marginFilter === 'medium' ? 'At Risk (15-22%)' : marginFilter === 'good' ? 'Good (22-30%)' : 'Excellent (>30%)'}
                                <button className="filter-chip-remove" onClick={() => setMarginFilter(null)} title="Remove filter">
                                    <X size={12} />
                                </button>
                            </span>
                        </div>
                    )}
                </div>
                <div className="dashboard-table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th className="checkbox-header">
                                    <input
                                        type="checkbox"
                                        checked={sortedStyles.length > 0 && selectedIds.size === sortedStyles.length}
                                        onChange={handleSelectAll}
                                        className="header-checkbox"
                                        title="Select all"
                                    />
                                </th>
                                <th className="sortable-header sticky-col-style" onClick={() => handleSort('styleId')}>
                                    Style # {sortColumn === 'styleId' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                {isColumnVisible('factory') && (
                                    <th className="sortable-header" onClick={() => handleSort('factory')}>
                                        Factory {sortColumn === 'factory' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                    </th>
                                )}
                                {isColumnVisible('description') && (
                                    <th className="sortable-header" onClick={() => handleSort('description')}>
                                        Description {sortColumn === 'description' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                    </th>
                                )}
                                {isColumnVisible('fabricTrim') && (
                                    <th className="sortable-header" onClick={() => handleSort('fabricTrim')}>
                                        Fabric/Trim {sortColumn === 'fabricTrim' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                    </th>
                                )}
                                <th className="sortable-header" onClick={() => handleSort('units')}>
                                    Units {sortColumn === 'units' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                {isColumnVisible('pack') && (
                                    <th className="sortable-header" onClick={() => handleSort('pack')}>
                                        Pack {sortColumn === 'pack' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                    </th>
                                )}
                                <th className="sortable-header" onClick={() => handleSort('price')}>
                                    Price {sortColumn === 'price' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                </th>
                                {isColumnVisible('rate') && (
                                    <th className="sortable-header" onClick={() => handleSort('rate')}>
                                        Rate {sortColumn === 'rate' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                    </th>
                                )}
                                {isColumnVisible('lc') && (
                                    <th className="sortable-header" onClick={() => handleSort('lc')}>
                                        LC (ZAR) {sortColumn === 'lc' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                    </th>
                                )}
                                {isColumnVisible('extraCost') && (
                                    <th className="sortable-header" onClick={() => handleSort('extraCost')}>
                                        Extra (ZAR) {sortColumn === 'extraCost' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                    </th>
                                )}
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
                                {isColumnVisible('profitPerPack') && (
                                    <th className="sortable-header" onClick={() => handleSort('profitPerPack')}>
                                        Profit/Pack {sortColumn === 'profitPerPack' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                    </th>
                                )}
                                {isColumnVisible('val1') && (
                                    <th className="sortable-header" onClick={() => handleSort('val1')}>
                                        Val1 {sortColumn === 'val1' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                    </th>
                                )}
                                {isColumnVisible('val2') && (
                                    <th className="sortable-header" onClick={() => handleSort('val2')}>
                                        Val2 {sortColumn === 'val2' && <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>}
                                    </th>
                                )}
                                <th></th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedStyles.map((style, index) => (
                                <DashboardRow
                                    key={style.id}
                                    style={style}
                                    rowIndex={index}
                                    isSelected={selectedIds.has(style.id)}
                                    maxUnits={maxUnits}
                                    isColVisible={isColumnVisible}
                                    onUpdate={handleUpdate}
                                    onDelete={handleDelete}
                                    onSelect={handleRowSelect}
                                    onNavigate={handleCellNavigate}
                                    focusedCell={focusedCell}
                                    onFocusCell={handleFocusCell}
                                    onOpenDrawer={openDrawer}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <ContextDrawer
                style={drawerStyle}
                isOpen={isDrawerOpen}
                onClose={closeDrawer}
                onUpdate={handleUpdate}
            />
        </div>
    );
};
