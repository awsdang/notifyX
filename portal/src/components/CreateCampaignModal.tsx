import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { clsx } from 'clsx';
import { NotificationPreview } from './NotificationPreview';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Application } from '../types';

interface CreateCampaignModalProps {
    apps: Application[];
    onClose: () => void;
    onCreated: () => void;
}

export function CreateCampaignModal({
    apps,
    onClose,
    onCreated,
}: CreateCampaignModalProps) {
    const { token } = useAuth();
    const [formData, setFormData] = useState({
        appId: '',
        name: '',
        description: '',
        targetingMode: 'ALL' as 'ALL' | 'USER_LIST' | 'CSV',
        targetUserIds: '',
        title: '',
        subtitle: '',
        body: '',
        image: '',
        priority: 'NORMAL' as 'LOW' | 'NORMAL' | 'HIGH',
    });

    const [isSaving, setIsSaving] = useState(false);
    const [audienceEstimate, setAudienceEstimate] = useState<{ users: number; devices: number } | null>(null);
    const [previewPlatform, setPreviewPlatform] = useState<'android' | 'ios' | 'huawei'>('android');
    const [previewDirection, setPreviewDirection] = useState<'ltr' | 'rtl'>('ltr');

    // Fetch audience estimate when app or targeting changes
    useEffect(() => {
        if (formData.appId) {
            fetchAudienceEstimate();
        }
    }, [formData.appId, formData.targetingMode, formData.targetUserIds]);

    const fetchAudienceEstimate = async () => {
        try {
            const userIds = formData.targetUserIds
                ? formData.targetUserIds.split('\n').map(s => s.trim()).filter(Boolean)
                : undefined;

            const data = await apiFetch<{ users: number; devices: number }>('/campaigns/audience-estimate', {
                method: 'POST',
                body: JSON.stringify({
                    appId: formData.appId,
                    targetingMode: formData.targetingMode,
                    userIds,
                }),
            }, token);
            setAudienceEstimate(data);
        } catch (error) {
            console.error('Failed to get audience estimate:', error);
        }
    };

    const handleSubmit = async () => {
        if (!formData.appId || !formData.name || !formData.title || !formData.body) {
            alert('Please fill in all required fields');
            return;
        }

        setIsSaving(true);
        try {
            await apiFetch('/campaigns', {
                method: 'POST',
                body: JSON.stringify({
                    ...formData,
                    targetUserIds: formData.targetUserIds
                        ? formData.targetUserIds.split('\n').map(s => s.trim()).filter(Boolean)
                        : undefined,
                }),
            }, token);
            onCreated();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-auto">
                <div className="p-6 border-b">
                    <h3 className="text-lg font-semibold">Create Campaign</h3>
                </div>

                <div className="p-6 grid grid-cols-2 gap-6">
                    {/* Left: Form */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">App *</label>
                            <select
                                className="w-full p-2 border rounded-lg text-sm bg-white"
                                value={formData.appId}
                                onChange={e => setFormData({ ...formData, appId: e.target.value })}
                            >
                                <option value="">Select an App</option>
                                {apps.map(app => (
                                    <option key={app.id} value={app.id}>{app.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Campaign Name *</label>
                            <input
                                className="w-full p-2 border rounded-lg text-sm"
                                placeholder="e.g., Black Friday Sale"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Description</label>
                            <input
                                className="w-full p-2 border rounded-lg text-sm"
                                placeholder="Optional description"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Targeting</label>
                                <select
                                    className="w-full p-2 border rounded-lg text-sm bg-white"
                                    value={formData.targetingMode}
                                    onChange={e => setFormData({ ...formData, targetingMode: e.target.value as any })}
                                >
                                    <option value="ALL">All Users</option>
                                    <option value="USER_LIST">Specific Users</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Priority</label>
                                <select
                                    className="w-full p-2 border rounded-lg text-sm bg-white"
                                    value={formData.priority}
                                    onChange={e => setFormData({ ...formData, priority: e.target.value as any })}
                                >
                                    <option value="LOW">Low</option>
                                    <option value="NORMAL">Normal</option>
                                    <option value="HIGH">High</option>
                                </select>
                            </div>
                        </div>

                        {formData.targetingMode === 'USER_LIST' && (
                            <div>
                                <label className="block text-sm font-medium mb-1">User IDs (one per line)</label>
                                <textarea
                                    className="w-full p-2 border rounded-lg text-sm font-mono"
                                    rows={4}
                                    placeholder="user_123&#10;user_456&#10;user_789"
                                    value={formData.targetUserIds}
                                    onChange={e => setFormData({ ...formData, targetUserIds: e.target.value })}
                                />
                            </div>
                        )}

                        {audienceEstimate && (
                            <div className="p-3 bg-blue-50 rounded-lg text-sm">
                                <p className="font-medium text-blue-700">Estimated Reach</p>
                                <p className="text-blue-600">
                                    {audienceEstimate.users} users • {audienceEstimate.devices} devices
                                </p>
                            </div>
                        )}

                        <div className="border-t pt-4">
                            <label className="block text-sm font-medium mb-3">Notification Content</label>

                            <div className="space-y-3">
                                <input
                                    className="w-full p-2 border rounded-lg text-sm"
                                    placeholder="Title *"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                />
                                <input
                                    className="w-full p-2 border rounded-lg text-sm"
                                    placeholder="Subtitle (optional)"
                                    value={formData.subtitle}
                                    onChange={e => setFormData({ ...formData, subtitle: e.target.value })}
                                />
                                <textarea
                                    className="w-full p-2 border rounded-lg text-sm"
                                    placeholder="Body *"
                                    rows={3}
                                    value={formData.body}
                                    onChange={e => setFormData({ ...formData, body: e.target.value })}
                                />
                                <input
                                    className="w-full p-2 border rounded-lg text-sm"
                                    placeholder="Image URL (optional)"
                                    value={formData.image}
                                    onChange={e => setFormData({ ...formData, image: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Right: Preview */}
                    <div className="flex flex-col items-center">
                        <div className="flex items-center gap-2 mb-4">
                            {(['android', 'ios', 'huawei'] as const).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPreviewPlatform(p)}
                                    className={clsx(
                                        "px-3 py-1 text-xs rounded-full font-medium transition-colors",
                                        previewPlatform === p ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    )}
                                >
                                    {p.toUpperCase()}
                                </button>
                            ))}
                            <span className="mx-2 text-gray-300">|</span>
                            <button
                                onClick={() => setPreviewDirection(d => d === 'ltr' ? 'rtl' : 'ltr')}
                                className="px-3 py-1 text-xs rounded-full font-medium bg-gray-100 text-gray-600 hover:bg-gray-200"
                            >
                                {previewDirection.toUpperCase()}
                            </button>
                        </div>
                        <NotificationPreview
                            platform={previewPlatform}
                            title={formData.title || 'Campaign Title'}
                            subtitle={formData.subtitle}
                            body={formData.body || 'Your message will appear here...'}
                            image={formData.image}
                            direction={previewDirection}
                        />
                    </div>
                </div>

                <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isSaving}>
                        {isSaving ? 'Creating...' : 'Create Campaign'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
