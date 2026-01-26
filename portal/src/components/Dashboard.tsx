import { BarChart2, Megaphone } from 'lucide-react';
import { StatCard } from './StatCard';
import { Button } from './ui/button';
import { ActivityFeed } from './ActivityFeed';
import type { Stats } from '../types';

interface DashboardProps {
    stats: Stats | null;
    isLoading: boolean;
    setActiveTab: (tab: string) => void;
}

export function Dashboard({ stats, isLoading, setActiveTab }: DashboardProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
                {/* Top Stats Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <StatCard
                        title="Total Notifications"
                        value={stats?.notifications?.total?.toString() || '0'}
                        color="blue"
                    />
                    <StatCard
                        title="Delivery Success Rate"
                        value={`${stats?.delivery?.successRate || 0}%`}
                        color="purple"
                    />
                </div>

                {/* Insights Section */}
                <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <BarChart2 className="w-5 h-5 text-blue-600" />
                        Delivery Insights
                    </h3>
                    {isLoading ? (
                        <div className="py-12 flex items-center justify-center">
                            <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                        </div>
                    ) : stats ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="p-4 rounded-2xl bg-slate-50 border border-gray-50 text-center">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">This Week</p>
                                <p className="text-2xl font-bold text-gray-900">{stats.notifications?.thisWeek || 0}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-50 border border-gray-50 text-center">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">This Month</p>
                                <p className="text-2xl font-bold text-gray-900">{stats.notifications?.thisMonth || 0}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-50 border border-gray-50 text-center">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Pending Queue</p>
                                <p className="text-2xl font-bold text-amber-600">{stats.notifications?.pending || 0}</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-slate-50 border border-gray-50 text-center">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Active Devices</p>
                                <p className="text-2xl font-bold text-gray-900">{stats.resources?.devices || 0}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="py-12 text-center text-gray-400">No data available for the current period.</div>
                    )}

                    {/* Decorative Chart Mockup */}
                    <div className="mt-10 h-32 flex items-end gap-2 px-2">
                        {[40, 70, 45, 90, 65, 80, 55, 95, 75, 85, 60, 100].map((h, i) => (
                            <div
                                key={i}
                                className="flex-1 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-lg transition-all duration-1000 animate-in slide-in-from-bottom"
                                style={{ height: `${h}%`, opacity: 0.1 + (i / 15) }}
                            />
                        ))}
                    </div>
                </div>

                {/* Low Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-[2.5rem] p-8 text-white shadow-xl shadow-indigo-200">
                        <h4 className="text-lg font-bold mb-2">Automate Journeys</h4>
                        <p className="text-sm opacity-80 mb-6">Create complex trigger-based notification workflows with our new canvas. </p>
                        <Button
                            onClick={() => setActiveTab('automation')}
                            className="bg-white text-indigo-700 hover:bg-slate-50 rounded-2xl px-6 h-12 font-bold shadow-lg"
                        >
                            Start Builder
                        </Button>
                    </div>
                    <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm flex flex-col justify-between">
                        <div>
                            <h4 className="text-lg font-bold text-gray-900 mb-2">App Credentials</h4>
                            <p className="text-sm text-gray-500">Securely manage your APNS, FCM, and HMS keys in one encrypted location.</p>
                        </div>
                        <button
                            onClick={() => setActiveTab('credentials')}
                            className="text-sm font-bold text-blue-600 flex items-center gap-1 mt-6 hover:translate-x-1 transition-transform"
                        >
                            Manage Keys <Megaphone className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="lg:col-span-1">
                <ActivityFeed />
            </div>
        </div>
    );
}
