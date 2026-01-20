import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import pb from '../lib/pocketbase';
import type { AuthModel } from 'pocketbase';

/**
 * Authentication Provider for PocketBase
 *
 * SETUP REQUIREMENT:
 * Before using this auth system, you need to create a 'users' collection in PocketBase:
 * 1. Open PocketBase Admin UI (usually http://127.0.0.1:8090/_/)
 * 2. Go to Collections
 * 3. The 'users' collection should already exist as a system collection
 * 4. If not, create a new "Auth" collection named 'users'
 * 5. Create user accounts via the Admin UI or use pb.collection('users').create()
 */

interface AuthContextType {
    user: AuthModel | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [user, setUser] = useState<AuthModel | null>(pb.authStore.model);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Check if user is already logged in on app load
        // PocketBase persists auth state in localStorage automatically
        const checkAuth = () => {
            if (pb.authStore.isValid) {
                setUser(pb.authStore.model);
            } else {
                setUser(null);
            }
            setIsLoading(false);
        };

        checkAuth();

        // Listen for auth state changes
        const unsubscribe = pb.authStore.onChange((_token, model) => {
            setUser(model);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    const login = useCallback(async (email: string, password: string): Promise<void> => {
        // Authenticate with PocketBase users collection
        const authData = await pb.collection('users').authWithPassword(email, password);
        setUser(authData.record);
    }, []);

    const logout = useCallback(() => {
        // Clear the auth store (removes token from localStorage)
        pb.authStore.clear();
        setUser(null);
    }, []);

    const value = useMemo<AuthContextType>(() => ({
        user,
        isAuthenticated: user !== null,
        isLoading,
        login,
        logout,
    }), [user, isLoading, login, logout]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
