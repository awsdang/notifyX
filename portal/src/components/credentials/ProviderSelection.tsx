import { Plus } from 'lucide-react';
import { clsx } from 'clsx';
import { PROVIDER_INFO, type ProviderKey } from './ProviderIcon';

interface ProviderSelectionProps {
    availableProviders: string[];
    onSelect: (provider: string) => void;
}

export function ProviderSelection({ availableProviders, onSelect }: ProviderSelectionProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableProviders.map(provider => {
                const info = PROVIDER_INFO[provider as ProviderKey];
                const Icon = info.icon;
                return (
                    <button
                        key={provider}
                        onClick={() => onSelect(provider)}
                        className="flex flex-col gap-4 p-6 rounded-3xl border border-gray-100 hover:border-blue-500 hover:bg-blue-50/30 transition-all text-start relative group overflow-hidden"
                    >
                        <div className={clsx("w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform", info.bgColor)}>
                            <Icon className={clsx("w-6 h-6", info.color)} />
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-900">{info.name}</h4>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{info.description}</p>
                        </div>
                        <Plus className="absolute top-6 end-6 w-5 h-5 text-gray-200 group-hover:text-blue-500 transition-colors" />
                    </button>
                );
            })}
        </div>
    );
}
