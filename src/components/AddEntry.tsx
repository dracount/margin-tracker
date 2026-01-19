import React, { useState, useCallback } from 'react';
import pb from '../lib/pocketbase';
import { validateField, validateStyleData, getApiErrorMessage } from '../utils/validation';
import { useToast } from './Toast';

interface AddEntryProps {
    customerId: string;
    onClose: () => void;
    onAddComplete: () => void;
}

interface FormData {
    styleId: string;
    factory: string;
    deliveryDate: string;
    description: string;
    fabricTrim: string;
    type: string;
    units: string;
    pack: string;
    price: string;
    rate: string;
    extraCost: string;
    sellingPrice: string;
}

const initialFormData: FormData = {
    styleId: '',
    factory: '',
    deliveryDate: '',
    description: '',
    fabricTrim: '',
    type: '',
    units: '',
    pack: '',
    price: '',
    rate: '',
    extraCost: '',
    sellingPrice: '',
};

export const AddEntry: React.FC<AddEntryProps> = ({ customerId, onClose, onAddComplete }) => {
    const toast = useToast();
    const [formData, setFormData] = useState<FormData>(initialFormData);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const handleFieldChange = useCallback((field: keyof FormData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        // Clear error for this field when user starts typing
        setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[field];
            return newErrors;
        });
        setSubmitError(null);
    }, []);

    const handleFieldBlur = useCallback((field: keyof FormData) => {
        // Only validate numeric fields
        const numericFields = ['units', 'pack', 'price', 'rate', 'extraCost', 'sellingPrice'];
        if (numericFields.includes(field)) {
            const error = validateField(field as keyof typeof validateField, formData[field]);
            if (error) {
                setErrors(prev => ({ ...prev, [field]: error }));
            }
        }
    }, [formData]);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setSubmitError(null);

        // Validate required text field
        const newErrors: Record<string, string> = {};
        if (!formData.styleId.trim()) {
            newErrors.styleId = 'Style # is required';
        }

        // Validate numeric fields
        const { isValid, errors: validationErrors } = validateStyleData({
            units: formData.units,
            pack: formData.pack,
            price: formData.price,
            rate: formData.rate,
            extraCost: formData.extraCost,
            sellingPrice: formData.sellingPrice,
        });

        const allErrors = { ...newErrors, ...validationErrors };

        if (!isValid || Object.keys(newErrors).length > 0) {
            setErrors(allErrors);
            setIsSubmitting(false);
            return;
        }

        try {
            await pb.collection('styles').create({
                customer: customerId,
                styleId: formData.styleId.trim(),
                factory: formData.factory.trim(),
                deliveryDate: formData.deliveryDate,
                description: formData.description.trim(),
                fabricTrim: formData.fabricTrim.trim(),
                type: formData.type.trim(),
                units: parseInt(formData.units, 10),
                pack: parseInt(formData.pack, 10),
                price: parseFloat(formData.price),
                rate: parseFloat(formData.rate),
                extraCost: formData.extraCost ? parseFloat(formData.extraCost) : 0,
                sellingPrice: parseFloat(formData.sellingPrice),
            });

            toast.success('Entry Added', `Style ${formData.styleId} has been added successfully.`);
            onAddComplete();
            onClose();
        } catch (err) {
            const message = getApiErrorMessage(err);
            setSubmitError(message);
            console.error('Error creating entry:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="import-overlay">
            <div className="import-modal add-entry-modal">
                <div className="import-header">
                    <h2>Add New Entry</h2>
                    <button className="btn-close" onClick={onClose}>&times;</button>
                </div>

                {submitError && (
                    <div className="import-error">
                        <strong>Error:</strong> {submitError}
                    </div>
                )}

                {Object.keys(errors).length > 0 && (
                    <div className="import-error">
                        <strong>Validation Errors:</strong>
                        <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0 }}>
                            {Object.entries(errors).map(([field, message]) => (
                                <li key={field}>{message}</li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="add-entry-form">
                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="styleId">Style # *</label>
                            <input
                                id="styleId"
                                type="text"
                                value={formData.styleId}
                                onChange={(e) => handleFieldChange('styleId', e.target.value)}
                                placeholder="e.g., ST-001"
                                className={errors.styleId ? 'input-error' : ''}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="factory">Factory</label>
                            <input
                                id="factory"
                                type="text"
                                value={formData.factory}
                                onChange={(e) => handleFieldChange('factory', e.target.value)}
                                placeholder="Factory name"
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="deliveryDate">Delivery Date</label>
                            <input
                                id="deliveryDate"
                                type="date"
                                value={formData.deliveryDate}
                                onChange={(e) => handleFieldChange('deliveryDate', e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="type">Type</label>
                            <input
                                id="type"
                                type="text"
                                value={formData.type}
                                onChange={(e) => handleFieldChange('type', e.target.value)}
                                placeholder="e.g., Shirt, Pants"
                            />
                        </div>
                    </div>

                    <div className="form-row single">
                        <div className="form-group">
                            <label htmlFor="description">Description</label>
                            <input
                                id="description"
                                type="text"
                                value={formData.description}
                                onChange={(e) => handleFieldChange('description', e.target.value)}
                                placeholder="Item description"
                            />
                        </div>
                    </div>

                    <div className="form-row single">
                        <div className="form-group">
                            <label htmlFor="fabricTrim">Fabric/Trim</label>
                            <input
                                id="fabricTrim"
                                type="text"
                                value={formData.fabricTrim}
                                onChange={(e) => handleFieldChange('fabricTrim', e.target.value)}
                                placeholder="e.g., Cotton, Polyester"
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="units">Units *</label>
                            <input
                                id="units"
                                type="number"
                                min="1"
                                step="1"
                                value={formData.units}
                                onChange={(e) => handleFieldChange('units', e.target.value)}
                                onBlur={() => handleFieldBlur('units')}
                                placeholder="Quantity"
                                className={errors.units ? 'input-error' : ''}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="pack">Pack *</label>
                            <input
                                id="pack"
                                type="number"
                                min="1"
                                step="1"
                                value={formData.pack}
                                onChange={(e) => handleFieldChange('pack', e.target.value)}
                                onBlur={() => handleFieldBlur('pack')}
                                placeholder="Pack size"
                                className={errors.pack ? 'input-error' : ''}
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="price">Price *</label>
                            <input
                                id="price"
                                type="number"
                                min="0"
                                step="0.01"
                                value={formData.price}
                                onChange={(e) => handleFieldChange('price', e.target.value)}
                                onBlur={() => handleFieldBlur('price')}
                                placeholder="0.00"
                                className={errors.price ? 'input-error' : ''}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="rate">Rate *</label>
                            <input
                                id="rate"
                                type="number"
                                min="1"
                                max="200"
                                step="0.01"
                                value={formData.rate}
                                onChange={(e) => handleFieldChange('rate', e.target.value)}
                                onBlur={() => handleFieldBlur('rate')}
                                placeholder="1-200"
                                className={errors.rate ? 'input-error' : ''}
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="extraCost">Extra Cost</label>
                            <input
                                id="extraCost"
                                type="number"
                                min="0"
                                step="0.01"
                                value={formData.extraCost}
                                onChange={(e) => handleFieldChange('extraCost', e.target.value)}
                                onBlur={() => handleFieldBlur('extraCost')}
                                placeholder="0.00 (optional)"
                                className={errors.extraCost ? 'input-error' : ''}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="sellingPrice">Selling Price *</label>
                            <input
                                id="sellingPrice"
                                type="number"
                                min="0"
                                step="0.01"
                                value={formData.sellingPrice}
                                onChange={(e) => handleFieldChange('sellingPrice', e.target.value)}
                                onBlur={() => handleFieldBlur('sellingPrice')}
                                placeholder="0.00"
                                className={errors.sellingPrice ? 'input-error' : ''}
                            />
                        </div>
                    </div>
                </div>

                <div className="import-actions">
                    <button className="btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className="btn-primary"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Adding...' : 'Add Entry'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddEntry;
