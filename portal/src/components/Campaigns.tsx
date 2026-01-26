import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { clsx } from 'clsx';
import { Megaphone, Play, Calendar, XCircle, Trash2, BarChart3, Plus, Users } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Campaign, Application } from '../types';
import { CreateCampaignModal } from './CreateCampaignModal';

interface CampaignsProps {
    apps: Application[];
    token: string | null;
}

export function Campaigns({ apps, token }: CampaignsProps) {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

    useEffect(() => {
        loadCampaigns();
    }, [token]);

    const loadCampaigns = async () => {
        setIsLoading(true);
        try {
            const data = await apiFetch<Campaign[]>('/campaigns', {}, token);
            setCampaigns(data);
        } catch (error) {
            console.error('Failed to load campaigns', error);
        } finally {
            setIsLoading(false);
        }
    };

    const sendNow = async (id: string) => {
        try {
            await apiFetch(`/campaigns/${id}/send`, { method: 'POST' }, token);
            loadCampaigns();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const scheduleCampaign = async (id: string) => {
        const date = prompt('Enter schedule date (YYYY-MM-DD HH:mm):');
        if (!date) return;
        try {
            await apiFetch(`/campaigns/${id}/schedule`, {
                method: 'POST',
                body: JSON.stringify({ scheduledAt: new Date(date).toISOString() })
            }, token);
            loadCampaigns();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const cancelCampaign = async (id: string) => {
        try {
            await apiFetch(`/campaigns/${id}/cancel`, { method: 'POST' }, token);
            loadCampaigns();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const deleteCampaign = async (id: string) => {
        if (!confirm('Are you sure you want to delete this campaign?')) return;
        try {
            await apiFetch(`/campaigns/${id}`, { method: 'DELETE' }, token);
            loadCampaigns();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const viewStats = (campaign: Campaign) => {
        setSelectedCampaign(campaign);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'DRAFT': return 'bg-gray-100 text-gray-600';
            case 'SCHEDULED': return 'bg-blue-100 text-blue-600';
            case 'PROCESSING': return 'bg-amber-100 text-amber-600 animate-pulse';
            case 'COMPLETED': return 'bg-green-100 text-green-600';
            case 'CANCELLED': return 'bg-red-100 text-red-600';
            default: return 'bg-gray-100 text-gray-600';
        }
    };

    const getTargetingIcon = (mode: string) => {
        switch (mode) {
            case 'ALL': return <Users size={14} />;
            case 'USER_LIST': return <Users size={14} className="text-blue-500" />;
            case 'CSV': return <Users size={14} className="text-purple-500" />;
            default: return <Users size={14} />;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <p className="text-gray-500">Create and manage multi-channel notification campaigns.</p>
                <Button onClick={() => setShowCreateModal(true)}>
                    <Plus size={18} className="mr-2" /> New Campaign
                </Button>
            </div>

            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 border-b text-gray-500 font-medium">
                        <tr>
                            <th className="px-6 py-3">Campaign</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3">Reach</th>
                            <th className="px-6 py-3">Performance</th>
                            <th className="px-6 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {isLoading ? (
                            <tr><td colSpan={5} className="text-center py-12 text-gray-400">Loading campaigns...</td></tr>
                        ) : campaigns.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="text-center py-12 text-gray-400">
                                    <Megaphone className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>No campaigns found. Create your first one!</p>
                                </td>
                            </tr>
                        ) : (
                            campaigns.map(campaign => (
                                <tr key={campaign.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{campaign.name}</div>
                                        <div className="text-xs text-gray-400 flex items-center gap-2 mt-1">
                                            {getTargetingIcon(campaign.targetingMode)}
                                            {campaign.targetingMode.replace('_', ' ')} • {apps.find(a => a.id === campaign.appId)?.name}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={clsx("px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider", getStatusColor(campaign.status))}>
                                            {campaign.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        <div className="flex items-center gap-1 font-medium">{campaign.totalTargets.toLocaleString()}</div>
                                        <div className="text-[10px] text-gray-400">Target Devices</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {campaign.status === 'COMPLETED' ? (
                                            <div className="space-y-1">
                                                <div className="flex justify-between text-[10px] text-gray-400">
                                                    <span>Delivery</span>
                                                    <span className="text-gray-900 font-medium">{Math.round((campaign.deliveredCount / campaign.sentCount) * 100) || 0}%</span>
                                                </div>
                                                <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-green-500"
                                                        style={{ width: `${(campaign.deliveredCount / campaign.sentCount) * 100 || 0}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-gray-300">—</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            {campaign.status === 'DRAFT' && (
                                                <>
                                                    <button onClick={() => sendNow(campaign.id)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Send Now"><Play size={16} /></button>
                                                    <button onClick={() => scheduleCampaign(campaign.id)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded" title="Schedule"><Calendar size={16} /></button>
                                                </>
                                            )}
                                            {(campaign.status === 'SCHEDULED' || campaign.status === 'PROCESSING') && (
                                                <button onClick={() => cancelCampaign(campaign.id)} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded" title="Cancel"><XCircle size={16} /></button>
                                            )}
                                            <button onClick={() => viewStats(campaign)} className="p-1.5 text-slate-600 hover:bg-slate-50 rounded" title="View Stats"><BarChart3 size={16} /></button>
                                            <button onClick={() => deleteCampaign(campaign.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Delete"><Trash2 size={16} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {showCreateModal && (
                <CreateCampaignModal
                    apps={apps}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => {
                        setShowCreateModal(false);
                        loadCampaigns();
                    }}
                />
            )}

            {selectedCampaign && (
                <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl border-l z-[60] p-8 animate-in slide-in-from-right">
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="text-xl font-bold">Campaign Insights</h3>
                        <button onClick={() => setSelectedCampaign(null)} className="text-gray-400 hover:text-gray-600"><XCircle /></button>
                    </div>

                    <div className="space-y-8">
                        <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Delivery Breakdown</p>
                            <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                    <span className="text-sm text-slate-600">Sent</span>
                                    <span className="text-2xl font-black">{selectedCampaign.sentCount.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm text-slate-600">Delivered</span>
                                    <span className="text-2xl font-black text-green-600">{selectedCampaign.deliveredCount.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-sm text-slate-600">Failed</span>
                                    <span className="text-2xl font-black text-red-600">{selectedCampaign.failedCount.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-bold">Content Preview</h4>
                            <div className="p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                <p className="text-xs font-bold text-gray-400 mb-1">TITLE</p>
                                <p className="text-sm font-semibold mb-3">{selectedCampaign.title}</p>
                                <p className="text-xs font-bold text-gray-400 mb-1">BODY</p>
                                <p className="text-sm text-gray-600">{selectedCampaign.body}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
