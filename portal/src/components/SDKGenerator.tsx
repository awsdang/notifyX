import { useState } from 'react';
import {
    Code2,
    Copy,
    CheckCircle2,
    Smartphone,
    Terminal,
    Box,
    Server,
    ExternalLink
} from 'lucide-react';
import { Button } from './ui/button';
import { clsx } from 'clsx';

type Language = 'javascript' | 'swift' | 'kotlin' | 'curl' | 'python' | 'go';

interface Snippet {
    id: Language;
    label: string;
    icon: React.ReactNode;
    code: string;
}

export function SDKGenerator() {
    const [selectedLang, setSelectedLang] = useState<Language>('curl');
    const [copied, setCopied] = useState(false);

    const SNIPPETS: Snippet[] = [
        {
            id: 'curl',
            label: 'cURL',
            icon: <Terminal size={16} />,
            code: `curl -X POST https://api.notifyx.io/v1/notifications \\
  -H "X-API-Key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "appId": "app_9210",
    "userIds": ["user_123"],
    "templateId": "welcome_msg",
    "data": { "name": "John" }
  }'`
        },
        {
            id: 'javascript',
            label: 'Node.js',
            icon: <Code2 size={16} />,
            code: `import { NotifyX } from '@notifyx/sdk';

const nx = new NotifyX('YOUR_KEY');

await nx.send({
  appId: 'app_9210',
  userId: 'user_123',
  template: 'welcome_msg',
  variables: { name: 'John' }
});`
        },
        {
            id: 'swift',
            label: 'Swift',
            icon: <Smartphone size={16} />,
            code: `import NotifyX

NotifyX.shared.configure(apiKey: "YOUR_KEY")

NotifyX.shared.registerDevice(
    token: deviceToken,
    userId: "user_123",
    language: "en"
)`
        },
        {
            id: 'kotlin',
            label: 'Kotlin',
            icon: <Smartphone size={16} />,
            code: `import io.notifyx.sdk.NotifyX

NotifyX.init(context, "YOUR_KEY")

NotifyX.registerDevice(
    token = "fcm_token_...",
    userId = "user_123",
    language = "en"
)`
        }
    ];

    const currentSnippet = SNIPPETS.find(s => s.id === selectedLang) || SNIPPETS[0];

    const copyToClipboard = () => {
        navigator.clipboard.writeText(currentSnippet.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500 flex max-w-5xl mx-auto h-[600px]">
            {/* Sidebar */}
            <div className="w-64 bg-gray-50/50 border-e border-gray-100 p-6 flex flex-col">
                <div className="mb-8">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Box className="w-5 h-5 text-blue-600" />
                        SDK Generator
                    </h3>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-bold">Developer Workspace</p>
                </div>

                <div className="space-y-1 flex-1">
                    {SNIPPETS.map(s => (
                        <button
                            key={s.id}
                            onClick={() => setSelectedLang(s.id)}
                            className={clsx(
                                "w-full px-4 py-3 rounded-xl flex items-center gap-3 text-sm font-medium transition-all",
                                selectedLang === s.id
                                    ? "bg-white text-blue-600 shadow-sm border border-blue-50"
                                    : "text-gray-500 hover:bg-white hover:text-gray-900"
                            )}
                        >
                            <div className={clsx(
                                "w-8 h-8 rounded-lg flex items-center justify-center",
                                selectedLang === s.id ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-400"
                            )}>
                                {s.icon}
                            </div>
                            {s.label}
                        </button>
                    ))}
                </div>

                <div className="pt-6 border-t border-gray-100 space-y-4">
                    <a href="#" className="flex items-center justify-between text-xs text-blue-600 font-bold hover:underline">
                        Full API Docs <ExternalLink size={12} />
                    </a>
                    <div className="p-4 bg-blue-600 rounded-2xl text-white">
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-2">New Release</p>
                        <h4 className="text-sm font-bold mb-1">SDK v2.4.0</h4>
                        <p className="text-[10px] opacity-70 leading-relaxed">Added support for React Native and Expo auto-linking.</p>
                    </div>
                </div>
            </div>

            {/* Code Content */}
            <div className="flex-1 flex flex-col bg-slate-900 overflow-hidden relative">
                <header className="px-8 py-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                    <div className="flex items-center gap-4">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                            <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50" />
                            <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                        </div>
                        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">notifyx-integration.sh</span>
                    </div>
                    <Button
                        onClick={copyToClipboard}
                        variant="ghost"
                        size="sm"
                        className="text-gray-400 hover:text-white hover:bg-white/5 rounded-lg px-3 gap-2"
                    >
                        {copied ? <CheckCircle2 size={14} className="text-green-500" /> : <Copy size={14} />}
                        {copied ? 'Copied' : 'Copy'}
                    </Button>
                </header>

                <div className="flex-1 p-8 overflow-auto font-mono text-sm leading-relaxed scrollbar-hide text-blue-300">
                    <pre className="whitespace-pre-wrap">
                        {currentSnippet.code}
                    </pre>
                </div>

                {/* Info Footer */}
                <footer className="px-8 py-4 border-t border-white/5 bg-black/20 text-[10px] text-gray-500 font-mono flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <Server size={12} /> Endpoint: api.notifyx.io/v1
                    </span>
                    <span className="text-gray-600">UTF-8 / LF / Application:JSON</span>
                </footer>

                {/* Decorative background light */}
                <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
            </div>
        </div>
    );
}
