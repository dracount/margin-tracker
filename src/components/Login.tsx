import React, { useState, FormEvent } from 'react';
import { useAuth } from './AuthProvider';

/**
 * Login Component
 *
 * Provides email/password authentication using PocketBase's built-in auth.
 * Features glassmorphic styling to match the app's design system.
 *
 * SETUP: Ensure you have created user accounts in PocketBase Admin UI
 * before attempting to log in.
 */

export const Login: React.FC = () => {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            await login(email, password);
            // Successfully logged in - AuthProvider will update state
        } catch (err: unknown) {
            // Handle PocketBase auth errors
            if (err instanceof Error) {
                // PocketBase returns 400 for invalid credentials
                if (err.message.includes('Failed to authenticate')) {
                    setError('Invalid email or password. Please try again.');
                } else {
                    setError(err.message || 'An error occurred during login.');
                }
            } else {
                setError('An unexpected error occurred. Please try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-header">
                    <h1>Margin Tracker</h1>
                    <p>Sign in to your account</p>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    {error && (
                        <div className="login-error">
                            {error}
                        </div>
                    )}

                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your email"
                            required
                            disabled={isLoading}
                            autoComplete="email"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                            disabled={isLoading}
                            autoComplete="current-password"
                        />
                    </div>

                    <button
                        type="submit"
                        className="login-button"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <span className="login-loading">
                                <span className="spinner"></span>
                                Signing in...
                            </span>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>

                <p className="login-footer">
                    Contact your administrator for account access
                </p>
            </div>
        </div>
    );
};
