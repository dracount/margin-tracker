import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { StyleRecord } from '../hooks/useMarginCalculator';
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';

interface ExportDataProps {
    styles: StyleRecord[];
    customerName: string;
}

// Helper function to calculate values for a single style
const calculateStyleData = (style: StyleRecord) => {
    const units = style.units || 0;
    const pack = style.pack || 1;
    const price = style.price || 0;
    const rate = style.rate || 0;
    const extraCost = style.extraCost || 0;
    const sellingPrice = style.sellingPrice || 0;

    // LC = (Price * Rate) / 6.2
    const lc = (price * rate) / 6.2;
    const totalCost = lc + extraCost;
    const revenue = sellingPrice * units;
    const totalExpenses = totalCost * units;
    const profit = revenue - totalExpenses;
    const marginAchieved = revenue > 0 ? (profit / revenue) * 100 : 0;
    // Profit per pack = Profit / Units (per unit, not multiplied by pack)
    const profitPerPack = units > 0 ? profit / units : 0;
    // val1 = Price / 6.2
    const val1 = price / 6.2;
    // val2 = val1 / Pack
    const val2 = pack > 0 ? val1 / pack : 0;

    return {
        lc,
        totalCost,
        revenue,
        profit,
        marginAchieved,
        profitPerPack,
        val1,
        val2
    };
};

// Format number as currency with R prefix
const formatCurrency = (value: number): string => {
    return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Format number as percentage
const formatPercentage = (value: number): string => {
    return `${value.toFixed(2)}%`;
};

// Get current date formatted for filename
const getFormattedDate = (): string => {
    const now = new Date();
    return now.toISOString().split('T')[0];
};

// Sanitize customer name for filename
const sanitizeFilename = (name: string): string => {
    return name.replace(/[^a-zA-Z0-9]/g, '_');
};

export const ExportData: React.FC<ExportDataProps> = ({ styles, customerName }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [exporting, setExporting] = useState(false);

    const prepareExportData = () => {
        return styles.map(style => {
            const calc = calculateStyleData(style);
            return {
                'Style ID': style.styleId,
                'Factory': style.factory,
                'Delivery Date': style.deliveryDate,
                'Description': style.description,
                'Fabric/Trim': style.fabricTrim || '',
                'Type': style.type,
                'Units': style.units,
                'Pack': style.pack,
                'Price (USD)': style.price,
                'Rate': style.rate,
                'Extra Cost (ZAR)': style.extraCost,
                'Selling Price (ZAR)': style.sellingPrice,
                'LC (ZAR)': formatCurrency(calc.lc),
                'Total Cost (ZAR)': formatCurrency(calc.totalCost),
                'Margin %': formatPercentage(calc.marginAchieved),
                'Revenue (ZAR)': formatCurrency(calc.revenue),
                'Profit (ZAR)': formatCurrency(calc.profit),
                'Profit Per Pack (ZAR)': formatCurrency(calc.profitPerPack),
                'Val1': calc.val1.toFixed(2),
                'Val2': calc.val2.toFixed(2)
            };
        });
    };

    const prepareNumericExportData = () => {
        return styles.map(style => {
            const calc = calculateStyleData(style);
            return {
                'Style ID': style.styleId,
                'Factory': style.factory,
                'Delivery Date': style.deliveryDate,
                'Description': style.description,
                'Fabric/Trim': style.fabricTrim || '',
                'Type': style.type,
                'Units': style.units,
                'Pack': style.pack,
                'Price (USD)': style.price,
                'Rate': style.rate,
                'Extra Cost (ZAR)': style.extraCost,
                'Selling Price (ZAR)': style.sellingPrice,
                'LC (ZAR)': Math.round(calc.lc * 100) / 100,
                'Total Cost (ZAR)': Math.round(calc.totalCost * 100) / 100,
                'Margin %': Math.round(calc.marginAchieved * 100) / 100,
                'Revenue (ZAR)': Math.round(calc.revenue * 100) / 100,
                'Profit (ZAR)': Math.round(calc.profit * 100) / 100,
                'Profit Per Pack (ZAR)': Math.round(calc.profitPerPack * 100) / 100,
                'Val1': Math.round(calc.val1 * 100) / 100,
                'Val2': Math.round(calc.val2 * 100) / 100
            };
        });
    };

    const exportToXLSX = () => {
        setExporting(true);
        try {
            const data = prepareNumericExportData();
            const worksheet = XLSX.utils.json_to_sheet(data);

            // Set column widths
            const columnWidths = [
                { wch: 12 }, // Style ID
                { wch: 15 }, // Factory
                { wch: 12 }, // Delivery Date
                { wch: 30 }, // Description
                { wch: 15 }, // Fabric/Trim
                { wch: 10 }, // Type
                { wch: 8 },  // Units
                { wch: 8 },  // Pack
                { wch: 12 }, // Price
                { wch: 8 },  // Rate
                { wch: 15 }, // Extra Cost
                { wch: 15 }, // Selling Price
                { wch: 15 }, // LC
                { wch: 15 }, // Total Cost
                { wch: 10 }, // Margin %
                { wch: 15 }, // Revenue
                { wch: 15 }, // Profit
                { wch: 18 }, // Profit Per Pack
                { wch: 10 }, // Val1
                { wch: 10 }, // Val2
            ];
            worksheet['!cols'] = columnWidths;

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Styles Data');

            const filename = `${sanitizeFilename(customerName)}_styles_${getFormattedDate()}.xlsx`;
            XLSX.writeFile(workbook, filename);
        } catch (error) {
            console.error('Error exporting to XLSX:', error);
        } finally {
            setExporting(false);
            setIsOpen(false);
        }
    };

    const exportToCSV = () => {
        setExporting(true);
        try {
            const data = prepareExportData();
            const worksheet = XLSX.utils.json_to_sheet(data);
            const csv = XLSX.utils.sheet_to_csv(worksheet);

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${sanitizeFilename(customerName)}_styles_${getFormattedDate()}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting to CSV:', error);
        } finally {
            setExporting(false);
            setIsOpen(false);
        }
    };

    if (styles.length === 0) {
        return null;
    }

    return (
        <div className="export-dropdown" style={{ position: 'relative' }}>
            <button
                className="btn-export"
                onClick={() => setIsOpen(!isOpen)}
                disabled={exporting}
                style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'white',
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s ease',
                    fontWeight: 600,
                    fontSize: '0.9rem'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                }}
            >
                <Download size={16} />
                {exporting ? 'Exporting...' : 'Export'}
                <ChevronDown size={14} style={{
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                }} />
            </button>

            {isOpen && (
                <div
                    className="export-menu"
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 0.5rem)',
                        right: 0,
                        background: 'rgba(15, 23, 42, 0.95)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '12px',
                        padding: '0.5rem',
                        minWidth: '180px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        zIndex: 1000,
                    }}
                >
                    <button
                        onClick={exportToXLSX}
                        style={{
                            width: '100%',
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            padding: '0.75rem 1rem',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            transition: 'all 0.2s ease',
                            fontSize: '0.9rem',
                            textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        <FileSpreadsheet size={18} style={{ color: '#10b981' }} />
                        <div>
                            <div style={{ fontWeight: 600 }}>Excel (.xlsx)</div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Spreadsheet format</div>
                        </div>
                    </button>
                    <button
                        onClick={exportToCSV}
                        style={{
                            width: '100%',
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            padding: '0.75rem 1rem',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            transition: 'all 0.2s ease',
                            fontSize: '0.9rem',
                            textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                        }}
                    >
                        <FileText size={18} style={{ color: '#f59e0b' }} />
                        <div>
                            <div style={{ fontWeight: 600 }}>CSV (.csv)</div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Comma-separated</div>
                        </div>
                    </button>
                </div>
            )}

            {/* Click outside to close */}
            {isOpen && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 999,
                    }}
                    onClick={() => setIsOpen(false)}
                />
            )}
        </div>
    );
};
