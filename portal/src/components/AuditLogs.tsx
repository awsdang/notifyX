import { useState } from 'react';
import {
    ScrollText,
    Search,
    Filter,
    User,
    Shield,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Download
} from 'lucide-react';
import { Button } from './ui/button';
import { clsx } from 'clsx';

interface AuditEntry {
    id: string;
    timestamp: string;
    actor: string;
    action: string;
    resource: string;
    category: 'security' | 'operation' | 'automation' | 'template';
    details: string;
    severity: 'info' | 'warning' | 'critical';
}

const MOCK_LOGS: AuditEntry[] = [
    {
        id: 'aud_1',
        timestamp: '2026-01-26 21:30:12',
        actor: 'admin@notifyx.io',
        action: 'UPDATE_CREDENTIALS',
        resource: 'App: Consumer-Pro',
        category: 'security',
        details: 'APNS .p8 certificate rotated and validated successfully.',
        severity: 'info'
    },
    {
        id: 'aud_2',
        timestamp: '2026-01-26 20:45:55',
        actor: 'system_bot',
        action: 'WORKFLOW_TRIGGER',
        resource: 'Workflow: Onboarding',
        category: 'automation',
        details: 'Automation triggered for 1,200 participants.',
        severity: 'info'
    },
    {
        id: 'aud_3',
        timestamp: '2026-01-26 19:12:01',
        actor: 'dev_user_99',
        action: 'DELETE_TEMPLATE',
        resource: 'Template: Promo_SummerV1',
        category: 'template',
        details: 'User deleted a production template with 5 localized variants.',
        severity: 'warning'
    },
    {
        id: 'aud_4',
        timestamp: '2026-01-26 18:00:00',
        actor: 'admin@notifyx.io',
        action: 'AUTH_FAILURE_BURST',
        resource: 'Webhook: Analytics_Sync',
        category: 'security',
        details: 'Detected 50 consecutive authentication failures on sync endpoint.',
        severity: 'critical'
    }
];

export function AuditLogs() {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [isLoading, setIsLoading] = useState(false);

    const filteredLogs = MOCK_LOGS.filter(log => {
        const matchesSearch = log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.actor.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.details.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = filterCategory === 'all' || log.category === filterCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="flex flex-col h-[calc(100vh-12rem)] animate-in fade-in duration-500">
            {/* Action Bar */}
            <div className="bg-white p-6 rounded-t-[2.5rem] border border-b-0 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-6 flex-1">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search by action, actor, or details..."
                            className="w-full ps-10 pe-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <select
                            className="bg-transparent border-none text-sm font-bold text-gray-600 focus:ring-0 outline-none"
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                        >
                            <option value="all">All Categories</option>
                            <option value="security">Security</option>
                            <option value="operation">Operations</option>
                            <option value="automation">Automation</option>
                            <option value="template">Templates</option>
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button variant="outline" className="rounded-xl border-gray-100 text-gray-600">
                        <Download size={16} className="me-2" /> Export CSV
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="rounded-xl border-gray-100 text-gray-400"
                        onClick={() => { setIsLoading(true); setTimeout(() => setIsLoading(false), 800); }}
                    >
                        <RefreshCw size={16} className={clsx(isLoading && "animate-spin")} />
                    </Button>
                </div>
            </div>

            {/* Logs Table */}
            <div className="flex-1 bg-white border border-t-0 rounded-b-[2.5rem] overflow-hidden flex flex-col shadow-sm">
                <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-start border-collapse">
                        <thead className="sticky top-0 bg-slate-50/80 backdrop-blur-md border-b text-[10px] font-bold text-gray-400 uppercase tracking-widest z-10">
                            <tr>
                                <th className="px-8 py-4">Timestamp</th>
                                <th className="px-6 py-4">Category</th>
                                <th className="px-6 py-4">Action & Resource</th>
                                <th className="px-6 py-4">Actor</th>
                                <th className="px-8 py-4">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredLogs.map((log) => (
                                <tr key={log.id} className="group hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-5 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900 line-clamp-1">{log.timestamp.split(' ')[1]}</span>
                                            <span className="text-[10px] text-gray-400">{log.timestamp.split(' ')[0]}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className={clsx(
                                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                            log.category === 'security' ? "bg-red-50 text-red-700" :
                                                log.category === 'operation' ? "bg-blue-50 text-blue-700" :
                                                    log.category === 'automation' ? "bg-purple-50 text-purple-700" :
                                                        "bg-emerald-50 text-emerald-700"
                                        )}>
                                            <div className={clsx(
                                                "w-1.5 h-1.5 rounded-full",
                                                log.category === 'security' ? "bg-red-500" :
                                                    log.category === 'operation' ? "bg-blue-500" :
                                                        log.category === 'automation' ? "bg-purple-500" :
                                                            "bg-emerald-500"
                                            )} />
                                            {log.category}
                                        </span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900">{log.action.replace(/_/g, ' ')}</span>
                                            <span className="text-xs text-blue-600 font-medium">{log.resource}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                                                <User size={12} className="text-gray-400" />
                                            </div>
                                            <span className="text-xs font-medium text-gray-600">{log.actor}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex items-center justify-between gap-4">
                                            <p className="text-xs text-gray-500 line-clamp-1 group-hover:line-clamp-none transition-all duration-300 max-w-md">{log.details}</p>
                                            {log.severity !== 'info' && (
                                                <Shield size={14} className={clsx(
                                                    log.severity === 'critical' ? "text-red-500 animate-pulse" : "text-amber-500"
                                                )} />
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {filteredLogs.length === 0 && (
                        <div className="py-24 text-center">
                            <ScrollText className="w-12 h-12 text-gray-100 mx-auto mb-4" />
                            <p className="text-gray-400 text-sm">No audit logs found matching your criteria.</p>
                        </div>
                    )}
                </div>

                {/* Pagination Footer */}
                <div className="p-6 bg-slate-50/50 border-t flex items-center justify-between text-xs text-gray-500">
                    <p>Showing <strong>{filteredLogs.length}</strong> of <strong>1,240</strong> total log entries</p>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="rounded-lg h-8 px-2" disabled><ChevronLeft size={14} /></Button>
                        <div className="flex items-center gap-1">
                            <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold">1</span>
                            <span className="w-8 h-8 rounded-lg hover:bg-white flex items-center justify-center transition-colors cursor-pointer">2</span>
                            <span className="w-8 h-8 rounded-lg hover:bg-white flex items-center justify-center transition-colors cursor-pointer">3</span>
                        </div>
                        <Button variant="ghost" size="sm" className="rounded-lg h-8 px-2"><ChevronRight size={14} /></Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
