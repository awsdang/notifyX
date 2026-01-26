import { Smartphone, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { clsx } from 'clsx';
import { PROVIDER_INFO, type ProviderKey } from './ProviderIcon';

interface TestCredentialModalProps {
    provider: string;
    testToken: string;
    onTokenChange: (token: string) => void;
    onTest: () => void;
    onClose: () => void;
    testResult: { success: boolean; message: string } | null;
}

export function TestCredentialModal({
    provider,
    testToken,
    onTokenChange,
    onTest,
    onClose,
    testResult
}: TestCredentialModalProps) {
    const info = PROVIDER_INFO[provider as ProviderKey];

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true">
            <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl">
                <div className="p-8 border-b">
                    <h3 className="text-xl font-bold text-gray-900">Connectivity Test</h3>
                    <p className="text-sm text-gray-500 mt-1">
                        Validate {info?.name} integration
                    </p>
                </div>

                <div className="p-8 space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">
                            Target Device Token
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                value={testToken}
                                onChange={(e) => onTokenChange(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 border border-gray-100 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-300"
                                placeholder="Enter push token..."
                            />
                            <Smartphone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2 font-medium">
                            {provider === 'web'
                                ? 'REQUIRED: Paste the full subscription JSON object'
                                : 'REQUIRED: Paste the device FCM/APNS/HMS unique token'
                            }
                        </p>
                    </div>

                    {testResult && (
                        <div className={clsx(
                            "p-4 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-2 duration-300",
                            testResult.success ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"
                        )}>
                            <div className={clsx(
                                "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                                testResult.success ? "bg-green-200" : "bg-red-200"
                            )}>
                                {testResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                            </div>
                            <div>
                                <p className="text-sm font-bold">{testResult.success ? 'Integration Valid' : 'Connection Failed'}</p>
                                <p className="text-xs opacity-80 mt-1 leading-relaxed">{testResult.message}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-8 bg-gray-50 border-t flex justify-end gap-3 rounded-b-[2rem]">
                    <Button variant="outline" className="rounded-xl" onClick={onClose}>
                        Close
                    </Button>
                    <Button
                        onClick={onTest}
                        className="rounded-xl px-6 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Run Health Check
                    </Button>
                </div>
            </div>
        </div>
    );
}
