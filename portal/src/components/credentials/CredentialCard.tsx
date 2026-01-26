import { Trash2, TestTube } from 'lucide-react';
import { Button } from '../ui/button';
import { clsx } from 'clsx';
import { ProviderIcon, PROVIDER_INFO, type ProviderKey } from './ProviderIcon';
import type { Credential } from '../../services/credentialService';

interface CredentialCardProps {
    credential: Credential;
    onDelete: (provider: string) => void;
    onToggle: (provider: string, isActive: boolean) => void;
    onOpenTest: (provider: string) => void;
}

export function CredentialCard({ credential, onDelete, onToggle, onOpenTest }: CredentialCardProps) {
    const info = PROVIDER_INFO[credential.provider as ProviderKey];
    if (!info) return null;

    return (
        <div
            className={clsx(
                "bg-white rounded-3xl border p-6 flex flex-col gap-6 shadow-sm hover:shadow-md transition-all relative overflow-hidden group",
                !credential.isActive && "opacity-60 bg-gray-50"
            )}
        >
            <div className="flex items-center gap-4">
                <ProviderIcon provider={credential.provider} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h4 className="font-bold text-gray-900">{info.name}</h4>
                        {credential.isActive ? (
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        ) : (
                            <span className="w-2 h-2 rounded-full bg-gray-300" />
                        )}
                    </div>
                    <p className="text-xs text-gray-400 font-medium mt-0.5 truncate uppercase tracking-widest">
                        Connected • {new Date(credential.updatedAt).toLocaleDateString()}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full w-9 h-9"
                        onClick={() => onOpenTest(credential.provider)}
                    >
                        <TestTube className="w-4 h-4 text-blue-600" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full w-9 h-9"
                        onClick={() => onDelete(credential.provider)}
                    >
                        <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                <div className="flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={credential.isActive}
                            onChange={() => onToggle(credential.provider, !credential.isActive)}
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                    <span className="text-sm font-semibold text-gray-700">{credential.isActive ? 'Active' : 'Paused'}</span>
                </div>
                <span className="text-[10px] font-bold text-gray-300 uppercase tracking-tighter">Encrypted at rest</span>
            </div>
        </div>
    );
}
