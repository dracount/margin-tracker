import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import pb from '../lib/pocketbase';

interface ImportDataProps {
    customerId: string;
    onClose: () => void;
    onImportComplete: () => void;
}

interface ImportedRow {
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

// Column mapping from XLSX headers to our schema
const COLUMN_MAP: Record<string, keyof ImportedRow> = {
    'style #': 'styleId',
    'style': 'styleId',
    'styleid': 'styleId',
    'factory': 'factory',
    'cust del': 'deliveryDate',
    'delivery date': 'deliveryDate',
    'deliverydate': 'deliveryDate',
    'description': 'description',
    'fabric/trim': 'fabricTrim',
    'fabric/ trim': 'fabricTrim',
    'fabric / trim': 'fabricTrim',
    'fabric': 'fabricTrim',
    'trim': 'fabricTrim',
    'fabrictrim': 'fabricTrim',
    'type': 'type',
    'units': 'units',
    'qty': 'units',
    'quantity': 'units',
    'pack': 'pack',
    'price': 'price',
    'cost': 'price',
    'rate': 'rate',
    'exchange rate': 'rate',
    'extra cost': 'extraCost',
    'extracost': 'extraCost',
    'extra': 'extraCost',
    'actual selling price': 'sellingPrice',
    'selling price': 'sellingPrice',
    'sellingprice': 'sellingPrice',
    'selling': 'sellingPrice',
};

export const ImportData: React.FC<ImportDataProps> = ({ customerId, onClose, onImportComplete }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [previewData, setPreviewData] = useState<ImportedRow[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const parseExcelDate = (value: unknown): string => {
        if (!value) return '';

        // If it's a number, it's likely an Excel serial date
        if (typeof value === 'number') {
            const date = XLSX.SSF.parse_date_code(value);
            if (date) {
                return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
            }
        }

        // If it's already a string, return as-is
        return String(value);
    };

    const parseNumber = (value: unknown): number => {
        if (value === null || value === undefined || value === '') return 0;
        const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
        return isNaN(parsed) ? 0 : parsed;
    };

    // Normalize header: lowercase, remove extra spaces, trim
    const normalizeHeader = (header: string): string => {
        return header.toLowerCase().replace(/\s+/g, ' ').trim();
    };

    const mapRowToSchema = (row: Record<string, unknown>): ImportedRow => {
        const mapped: Partial<ImportedRow> = {
            styleId: '',
            factory: '',
            deliveryDate: '',
            description: '',
            fabricTrim: '',
            type: '',
            units: 0,
            pack: 0,
            price: 0,
            rate: 0,
            extraCost: 0,
            sellingPrice: 0,
        };

        for (const [header, value] of Object.entries(row)) {
            const normalizedHeader = normalizeHeader(header);
            const schemaKey = COLUMN_MAP[normalizedHeader];

            if (schemaKey) {
                if (['units', 'pack', 'price', 'rate', 'extraCost', 'sellingPrice'].includes(schemaKey)) {
                    mapped[schemaKey] = parseNumber(value) as never;
                } else if (schemaKey === 'deliveryDate') {
                    mapped[schemaKey] = parseExcelDate(value);
                } else {
                    mapped[schemaKey] = String(value || '') as never;
                }
            }
        }

        return mapped as ImportedRow;
    };

    const processFile = useCallback((file: File) => {
        setError(null);
        setPreviewData([]);

        if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
            setError('Please upload an Excel file (.xlsx, .xls) or CSV file (.csv)');
            return;
        }

        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'array' });

                // Get the first sheet
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];

                // Convert to JSON
                const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

                if (jsonData.length === 0) {
                    setError('No data found in the Excel file');
                    return;
                }

                // Map rows to our schema
                const mappedData = jsonData.map(mapRowToSchema);

                // Filter out rows that don't have at least a styleId
                const validData = mappedData.filter(row => row.styleId && row.styleId.trim() !== '');

                if (validData.length === 0) {
                    setError('No valid rows found. Make sure your file has a "Style #" column.');
                    return;
                }

                setPreviewData(validData);
            } catch (err) {
                console.error('Error parsing file:', err);
                setError('Failed to parse the Excel file. Please check the format.');
            }
        };

        reader.onerror = () => {
            setError('Failed to read the file');
        };

        reader.readAsArrayBuffer(file);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    }, [processFile]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            processFile(files[0]);
        }
    }, [processFile]);

    const handleImport = async () => {
        if (previewData.length === 0) return;

        setImporting(true);
        setImportProgress({ current: 0, total: previewData.length });
        setError(null);

        let successCount = 0;
        const errors: string[] = [];

        for (let i = 0; i < previewData.length; i++) {
            const row = previewData[i];

            try {
                await pb.collection('styles').create({
                    customer: customerId,
                    styleId: row.styleId,
                    factory: row.factory,
                    deliveryDate: row.deliveryDate,
                    description: row.description,
                    fabricTrim: row.fabricTrim,
                    type: row.type,
                    units: row.units,
                    pack: row.pack,
                    price: row.price,
                    rate: row.rate,
                    extraCost: row.extraCost,
                    sellingPrice: row.sellingPrice,
                });
                successCount++;
            } catch (err) {
                console.error(`Error importing row ${i + 1}:`, err);
                errors.push(`Row ${i + 1} (${row.styleId}): Failed to import`);
            }

            setImportProgress({ current: i + 1, total: previewData.length });
        }

        setImporting(false);

        if (errors.length > 0) {
            setError(`Imported ${successCount} of ${previewData.length} rows. Errors:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...and ${errors.length - 5} more` : ''}`);
        } else {
            onImportComplete();
            onClose();
        }
    };

    const handleRemoveRow = (index: number) => {
        setPreviewData(prev => prev.filter((_, i) => i !== index));
    };

    const handleDownloadTemplate = useCallback(() => {
        // Create template data with headers and one example row
        const templateData = [
            {
                'Style #': 'EXAMPLE-001',
                'Factory': 'Factory Name',
                'Cust Del': '2024-01-15',
                'Description': 'Product description',
                'Fabric/Trim': 'Cotton',
                'Type': 'Type A',
                'Units': 100,
                'Pack': 10,
                'Price': 5.50,
                'Rate': 18.5,
                'Extra Cost': 2.00,
                'Selling Price': 150.00,
            }
        ];

        // Create workbook and worksheet
        const ws = XLSX.utils.json_to_sheet(templateData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Import Template');

        // Set column widths for better readability
        ws['!cols'] = [
            { wch: 15 }, // Style #
            { wch: 15 }, // Factory
            { wch: 12 }, // Cust Del
            { wch: 25 }, // Description
            { wch: 15 }, // Fabric/Trim
            { wch: 10 }, // Type
            { wch: 10 }, // Units
            { wch: 8 },  // Pack
            { wch: 10 }, // Price
            { wch: 10 }, // Rate
            { wch: 12 }, // Extra Cost
            { wch: 14 }, // Selling Price
        ];

        // Download the file
        XLSX.writeFile(wb, 'margin_tracker_import_template.xlsx');
    }, []);

    return (
        <div className="import-overlay">
            <div className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-modal-title">
                <div className="import-header">
                    <h2 id="import-modal-title">Import Data from Excel</h2>
                    <button className="btn-close" onClick={onClose} aria-label="Close import dialog">&times;</button>
                </div>

                {!previewData.length && (
                    <>
                        <div className="template-download-section">
                            <button className="btn-template" onClick={handleDownloadTemplate}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Download Template
                            </button>
                            <span className="template-hint">Download a template file with the correct column headers</span>
                        </div>
                        <div
                            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={handleFileSelect}
                                style={{ display: 'none' }}
                                id="file-upload-input"
                                aria-describedby="file-upload-description"
                            />
                            <div className="drop-zone-content">
                                <div className="drop-icon">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="17 8 12 3 7 8" />
                                        <line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                </div>
                                <p id="file-upload-description">Drag and drop your Excel or CSV file here</p>
                                <p className="drop-hint">or click to browse</p>
                            </div>
                        </div>
                    </>
                )}

                {error && (
                    <div className="import-error">
                        <strong>Error:</strong> {error}
                    </div>
                )}

                {previewData.length > 0 && (
                    <>
                        <div className="preview-info">
                            <span>{previewData.length} rows ready to import</span>
                            <button
                                className="btn-secondary"
                                onClick={() => {
                                    setPreviewData([]);
                                    if (fileInputRef.current) {
                                        fileInputRef.current.value = '';
                                    }
                                }}
                            >
                                Clear & Upload New
                            </button>
                        </div>

                        <div className="preview-table-container">
                            <table className="preview-table">
                                <thead>
                                    <tr>
                                        <th>Style #</th>
                                        <th>Factory</th>
                                        <th>Delivery</th>
                                        <th>Description</th>
                                        <th>Fabric/Trim</th>
                                        <th>Type</th>
                                        <th>Units</th>
                                        <th>Pack</th>
                                        <th>Price</th>
                                        <th>Rate</th>
                                        <th>Extra</th>
                                        <th>Selling</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.slice(0, 50).map((row, index) => (
                                        <tr key={`${row.styleId}-${index}`}>
                                            <td>{row.styleId}</td>
                                            <td>{row.factory}</td>
                                            <td>{row.deliveryDate}</td>
                                            <td>{row.description}</td>
                                            <td>{row.fabricTrim}</td>
                                            <td>{row.type}</td>
                                            <td>{row.units}</td>
                                            <td>{row.pack}</td>
                                            <td>{row.price}</td>
                                            <td>{row.rate}</td>
                                            <td>{row.extraCost}</td>
                                            <td>{row.sellingPrice}</td>
                                            <td>
                                                <button
                                                    className="btn-remove"
                                                    onClick={() => handleRemoveRow(index)}
                                                    title="Remove row"
                                                    aria-label={`Remove row ${index + 1}`}
                                                >
                                                    &times;
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {previewData.length > 50 && (
                                <p className="preview-truncated">
                                    Showing first 50 rows of {previewData.length} total
                                </p>
                            )}
                        </div>

                        <div className="import-actions">
                            <button className="btn-secondary" onClick={onClose}>
                                Cancel
                            </button>
                            <button
                                className="btn-primary"
                                onClick={handleImport}
                                disabled={importing}
                            >
                                {importing
                                    ? `Importing... (${importProgress.current}/${importProgress.total})`
                                    : `Import ${previewData.length} Rows`
                                }
                            </button>
                        </div>
                    </>
                )}

                {importing && (
                    <div className="import-progress">
                        <div
                            className="progress-bar"
                            style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                        />
                    </div>
                )}

                <div className="column-mapping-info">
                    <h4>Column Mapping Guide</h4>
                    <div className="mapping-grid">
                        <div><strong>Style #</strong> or <strong>Style</strong></div>
                        <div><strong>Factory</strong></div>
                        <div><strong>Cust Del</strong> or <strong>Delivery Date</strong></div>
                        <div><strong>Description</strong></div>
                        <div><strong>Fabric/Trim</strong> or <strong>Fabric</strong></div>
                        <div><strong>Type</strong></div>
                        <div><strong>Units</strong> or <strong>Qty</strong></div>
                        <div><strong>Pack</strong></div>
                        <div><strong>Price</strong> or <strong>Cost</strong></div>
                        <div><strong>Rate</strong> or <strong>Exchange Rate</strong></div>
                        <div><strong>Extra Cost</strong></div>
                        <div><strong>Selling Price</strong> or <strong>Actual Selling Price</strong></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImportData;
