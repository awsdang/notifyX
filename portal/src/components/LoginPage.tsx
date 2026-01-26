/**
 * Login Page Component
 */

import { useState } from 'react';
import { Bell, LogIn, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../context/AuthContext';

interface LoginPageProps {
    onSetupNeeded?: () => void;
}

export function LoginPage({ onSetupNeeded }: LoginPageProps) {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await login(email, password);
        } catch (err: any) {
            setError(err.message || 'Login failed');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 mb-4">
                        <Bell className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
                        NotifyX
                    </h1>
                    <p className="text-gray-500 mt-2">Admin Portal</p>
                </div>

                {/* Login Form */}
                <div className="bg-white rounded-2xl shadow-xl border p-8">
                    <h2 className="text-xl font-semibold mb-6">Sign In</h2>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="admin@example.com"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-2">
                                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Signing in...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <LogIn className="w-4 h-4" />
                                    Sign In
                                </span>
                            )}
                        </Button>
                    </form>

                    {onSetupNeeded && (
                        <div className="mt-6 pt-6 border-t text-center">
                            <p className="text-sm text-gray-500 mb-2">
                                First time setup?
                            </p>
                            <button
                                onClick={onSetupNeeded}
                                className="text-sm text-blue-600 hover:underline"
                            >
                                Create initial admin account
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
