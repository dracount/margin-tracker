import { useEffect, useState, useCallback } from 'react';
import pb from './lib/pocketbase';
import { Dashboard } from './components/Dashboard';
import { ExportData } from './components/ExportData';
import { ImportData } from './components/ImportData';
import { AddEntry } from './components/AddEntry';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { Login } from './components/Login';
import { ToastProvider, useToast } from './components/Toast';
import { StyleRecord } from './hooks/useMarginCalculator';
import './App.css';

interface Customer {
    id: string;
    name: string;
    customer_id: string;
    logo: string;
}

/**
 * Main application content - only shown when authenticated
 */
function AppContent() {
    const { logout, user } = useAuth();
    const toast = useToast();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentStyles, setCurrentStyles] = useState<StyleRecord[]>([]);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showAddEntryModal, setShowAddEntryModal] = useState(false);
    const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
    const [importKey, setImportKey] = useState(0);
    const [isClearing, setIsClearing] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');
    const [newCustomerId, setNewCustomerId] = useState('');
    const [isAddingCustomer, setIsAddingCustomer] = useState(false);

    const handleStylesLoaded = useCallback((styles: StyleRecord[]) => {
        setCurrentStyles(styles);
    }, []);

    const handleAddCustomer = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCustomerName.trim() || !newCustomerId.trim()) {
            toast.error('Error', 'Please fill in all fields');
            return;
        }

        setIsAddingCustomer(true);
        try {
            const newCustomer = await pb.collection('customers').create<Customer>({
                name: newCustomerName.trim(),
                customer_id: newCustomerId.trim(),
            });
            setCustomers(prev => [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name)));
            setShowAddCustomerModal(false);
            setNewCustomerName('');
            setNewCustomerId('');
            toast.success('Success', `Customer "${newCustomerName}" created successfully`);
        } catch (err) {
            console.error('Error creating customer:', err);
            toast.error('Error', 'Failed to create customer');
        } finally {
            setIsAddingCustomer(false);
        }
    }, [newCustomerName, newCustomerId, toast]);

    const handleClearAllStyles = useCallback(async () => {
        if (!selectedCustomerId) return;

        const confirmed = window.confirm(
            `Are you sure you want to delete ALL ${currentStyles.length} styles for this customer?\n\nThis action cannot be undone.`
        );

        if (!confirmed) return;

        setIsClearing(true);
        let deleted = 0;
        let errors = 0;

        try {
            for (const style of currentStyles) {
                try {
                    await pb.collection('styles').delete(style.id);
                    deleted++;
                } catch {
                    errors++;
                }
            }

            if (errors > 0) {
                toast.warning('Partial success', `Deleted ${deleted} styles. ${errors} failed.`);
            } else {
                toast.success('Cleared', `Deleted ${deleted} styles successfully.`);
            }

            // Refresh the dashboard
            setImportKey(prev => prev + 1);
        } catch (err) {
            console.error('Error clearing styles:', err);
            toast.error('Error', 'Failed to clear styles');
        } finally {
            setIsClearing(false);
        }
    }, [selectedCustomerId, currentStyles, toast]);

    useEffect(() => {
        async function fetchCustomers() {
            try {
                const records = await pb.collection('customers').getFullList<Customer>({
                    sort: 'name',
                    requestKey: null, // Disable auto-cancellation
                });
                setCustomers(records);
            } catch (err) {
                console.error('Error fetching customers:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchCustomers();
    }, []);

    if (loading) return <div>Loading...</div>;

    if (!selectedCustomerId) {
        return (
            <div className="dashboard-container">
                <header className="glass-header">
                    <div>
                        <h1>Margin Tracker</h1>
                        {user && <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: 0 }}>Logged in as {user.email}</p>}
                    </div>
                    <button className="btn-logout" onClick={logout}>
                        Logout
                    </button>
                </header>
                <div className="dashboard-content">
                    <div className="customer-selection grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1.5rem' }}>
                        {customers.map(customer => (
                            <div
                                key={customer.id}
                                className="dashboard-card"
                                style={{ cursor: 'pointer', textAlign: 'center', padding: '1.5rem' }}
                                onClick={() => setSelectedCustomerId(customer.id)}
                            >
                                {customer.logo && <img src={pb.files.getUrl(customer, customer.logo)} alt={customer.name} style={{ maxWidth: '100px', marginBottom: '1rem' }} />}
                                <h3>{customer.name}</h3>
                                <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{customer.customer_id}</p>
                            </div>
                        ))}
                        <div
                            className="dashboard-card add-customer-card"
                            style={{ cursor: 'pointer', textAlign: 'center', padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '150px' }}
                            onClick={() => setShowAddCustomerModal(true)}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '48px', height: '48px', color: '#94a3b8', marginBottom: '1rem' }}>
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            <h3 style={{ color: '#94a3b8', margin: 0 }}>Add Customer</h3>
                        </div>
                    </div>
                </div>
                {showAddCustomerModal && (
                    <div className="import-overlay" onClick={() => setShowAddCustomerModal(false)}>
                        <div className="import-modal add-entry-modal" onClick={e => e.stopPropagation()}>
                            <div className="import-header">
                                <h2>Add New Customer</h2>
                                <button className="btn-close" onClick={() => setShowAddCustomerModal(false)}>&times;</button>
                            </div>
                            <form onSubmit={handleAddCustomer} className="add-entry-form">
                                <div className="form-group">
                                    <label htmlFor="customerName">Customer Name</label>
                                    <input
                                        id="customerName"
                                        type="text"
                                        value={newCustomerName}
                                        onChange={e => setNewCustomerName(e.target.value)}
                                        placeholder="e.g., ABC Company"
                                        autoFocus
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="customerId">Customer ID</label>
                                    <input
                                        id="customerId"
                                        type="text"
                                        value={newCustomerId}
                                        onChange={e => setNewCustomerId(e.target.value)}
                                        placeholder="e.g., ABC-001"
                                    />
                                </div>
                                <div className="import-actions">
                                    <button type="button" className="btn-secondary" onClick={() => setShowAddCustomerModal(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn-primary" disabled={isAddingCustomer}>
                                        {isAddingCustomer ? 'Adding...' : 'Add Customer'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

    return (
        <div className="dashboard-container">
            <header className="glass-header">
                <div>
                    <h1>{selectedCustomer?.name}</h1>
                    <p style={{ color: '#94a3b8' }}>Margin Tracking Dashboard</p>
                </div>
                <div className="header-actions">
                    <button className="btn-import" onClick={() => setShowImportModal(true)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        Import
                    </button>
                    <button className="btn-import" onClick={() => setShowAddEntryModal(true)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add Entry
                    </button>
                    {currentStyles.length > 0 && (
                        <button
                            className="btn-danger"
                            onClick={handleClearAllStyles}
                            disabled={isClearing}
                            title="Delete all styles for this customer"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            {isClearing ? 'Clearing...' : 'Clear All'}
                        </button>
                    )}
                    <ExportData
                        styles={currentStyles}
                        customerName={selectedCustomer?.name || 'Unknown'}
                    />
                    <button className="btn-back" onClick={() => setSelectedCustomerId(null)}>
                        Switch Customer
                    </button>
                    <button className="btn-logout" onClick={logout}>
                        Logout
                    </button>
                </div>
            </header>
            <div className="dashboard-content">
                <Dashboard
                    key={importKey}
                    customerId={selectedCustomerId}
                    customerName={selectedCustomer?.name || 'Unknown'}
                    onStylesLoaded={handleStylesLoaded}
                />
            </div>
            {showImportModal && (
                <ImportData
                    customerId={selectedCustomerId}
                    onClose={() => setShowImportModal(false)}
                    onImportComplete={() => {
                        setImportKey(prev => prev + 1);
                    }}
                />
            )}
            {showAddEntryModal && (
                <AddEntry
                    customerId={selectedCustomerId}
                    onClose={() => setShowAddEntryModal(false)}
                    onAddComplete={() => {
                        setImportKey(prev => prev + 1);
                    }}
                />
            )}
        </div>
    );
}

/**
 * Root App component with authentication wrapper
 */
function AppWithAuth() {
    const { isAuthenticated, isLoading } = useAuth();

    // Show loading state while checking auth
    if (isLoading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading...</p>
            </div>
        );
    }

    // Show login if not authenticated
    if (!isAuthenticated) {
        return <Login />;
    }

    // Show main app content if authenticated
    return <AppContent />;
}

/**
 * Main App component wrapped with AuthProvider
 */
function App() {
    return (
        <AuthProvider>
            <ToastProvider>
                <AppWithAuth />
            </ToastProvider>
        </AuthProvider>
    );
}

export default App;
