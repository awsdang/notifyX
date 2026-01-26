import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { clsx } from 'clsx';
import { FlaskConical, Play, XCircle, Trash2, BarChart3, Plus } from 'lucide-react';
import { NotificationPreview } from './NotificationPreview';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface ABTestVariant {
    id?: string;
    name: string;
    weight: number;
    title: string;
    subtitle?: string;
    body: string;
    image?: string;
    sentCount?: number;
    deliveredCount?: number;
    failedCount?: number;
}

interface ABTest {
    id: string;
    appId: string;
    name: string;
    description?: string;
    status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
    targetingMode: 'ALL' | 'USER_LIST' | 'CSV';
    targetUserIds?: string[];
    scheduledAt?: string;
    startedAt?: string;
    completedAt?: string;
    createdAt: string;
    variants: ABTestVariant[];
    _count?: { assignments: number };
}

interface ABTestingProps {
    apps: { id: string; name: string }[];
    token: string | null;
}

export function ABTesting({ apps, token }: ABTestingProps) {
    const [tests, setTests] = useState<ABTest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedTest, setSelectedTest] = useState<ABTest | null>(null);
    const [showResultsModal, setShowResultsModal] = useState(false);
    const [previewVariant, setPreviewVariant] = useState<ABTestVariant | null>(null);

    const authApiCall = async (endpoint: string, options: RequestInit = {}) => {
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
        };
        const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error?.message || error.error || 'Request failed');
        }
        return response.json();
    };

    useEffect(() => {
        loadTests();
    }, []);

    const loadTests = async () => {
        try {
            setIsLoading(true);
            const data = await authApiCall('/ab-tests');
            setTests(data);
        } catch (error) {
            console.error('Failed to load A/B tests:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const startTest = async (id: string) => {
        try {
            await authApiCall(`/ab-tests/${id}/start`, { method: 'POST' });
            loadTests();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const cancelTest = async (id: string) => {
        if (!confirm('Are you sure you want to cancel this A/B test?')) return;
        try {
            await authApiCall(`/ab-tests/${id}/cancel`, { method: 'POST' });
            loadTests();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const deleteTest = async (id: string) => {
        if (!confirm('Are you sure you want to delete this A/B test?')) return;
        try {
            await authApiCall(`/ab-tests/${id}`, { method: 'DELETE' });
            loadTests();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const viewResults = async (id: string) => {
        try {
            const data = await authApiCall(`/ab-tests/${id}/results`);
            setSelectedTest({ ...tests.find(t => t.id === id)!, ...data.test });
            setShowResultsModal(true);
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'DRAFT': return 'bg-gray-100 text-gray-700';
            case 'ACTIVE': return 'bg-blue-100 text-blue-700';
            case 'COMPLETED': return 'bg-green-100 text-green-700';
            case 'CANCELLED': return 'bg-red-100 text-red-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-semibold">A/B Testing</h3>
                    <p className="text-sm text-gray-500">Test different notification variants to optimize engagement</p>
                </div>
                <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Create A/B Test
                </Button>
            </div>

            {isLoading ? (
                <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
                    Loading...
                </div>
            ) : tests.length === 0 ? (
                <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
                    <FlaskConical className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No A/B tests yet. Create your first test!</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {tests.map(test => (
                        <div key={test.id} className="bg-white rounded-xl border p-6 hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="font-semibold text-lg">{test.name}</h4>
                                        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', getStatusColor(test.status))}>
                                            {test.status}
                                        </span>
                                    </div>
                                    {test.description && <p className="text-sm text-gray-500">{test.description}</p>}
                                    <p className="text-xs text-gray-400 mt-1">
                                        App: {apps.find(a => a.id === test.appId)?.name || test.appId}
                                        {' • '}Targeting: {test.targetingMode}
                                        {test._count && ` • ${test._count.assignments} assignments`}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    {test.status === 'DRAFT' && (
                                        <>
                                            <Button size="sm" onClick={() => startTest(test.id)}>
                                                <Play className="w-4 h-4 mr-1" /> Start
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => deleteTest(test.id)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </>
                                    )}
                                    {test.status === 'ACTIVE' && (
                                        <Button size="sm" variant="outline" onClick={() => cancelTest(test.id)}>
                                            <XCircle className="w-4 h-4 mr-1" /> Cancel
                                        </Button>
                                    )}
                                    {(test.status === 'COMPLETED' || test.status === 'ACTIVE') && (
                                        <Button size="sm" variant="outline" onClick={() => viewResults(test.id)}>
                                            <BarChart3 className="w-4 h-4 mr-1" /> Results
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Variants Preview */}
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                {test.variants.map(variant => (
                                    <button
                                        key={variant.id || variant.name}
                                        onClick={() => setPreviewVariant(variant)}
                                        className="p-3 bg-gray-50 rounded-lg text-left hover:bg-gray-100 transition-colors"
                                    >
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-medium text-sm">Variant {variant.name}</span>
                                            <span className="text-xs text-gray-400">{variant.weight}%</span>
                                        </div>
                                        <p className="text-xs text-gray-600 line-clamp-1">{variant.title}</p>
                                        {variant.sentCount !== undefined && (
                                            <p className="text-xs text-gray-400 mt-1">
                                                Sent: {variant.sentCount} | Delivered: {variant.deliveredCount}
                                            </p>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <CreateABTestModal
                    apps={apps}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => {
                        setShowCreateModal(false);
                        loadTests();
                    }}
                    authApiCall={authApiCall}
                />
            )}

            {/* Preview Modal */}
            {previewVariant && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full">
                        <h3 className="text-lg font-semibold mb-4">Variant {previewVariant.name} Preview</h3>
                        <NotificationPreview
                            platform="android"
                            title={previewVariant.title}
                            subtitle={previewVariant.subtitle}
                            body={previewVariant.body}
                            image={previewVariant.image}
                        />
                        <div className="mt-4 flex justify-end">
                            <Button variant="outline" onClick={() => setPreviewVariant(null)}>Close</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Results Modal */}
            {showResultsModal && selectedTest && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
                        <div className="p-6 border-b">
                            <h3 className="text-lg font-semibold">A/B Test Results: {selectedTest.name}</h3>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                {selectedTest.variants.map(v => {
                                    const total = v.sentCount || 0;
                                    const delivered = v.deliveredCount || 0;
                                    const rate = total > 0 ? Math.round((delivered / total) * 100) : 0;
                                    return (
                                        <div key={v.id || v.name} className="bg-gray-50 rounded-xl p-4">
                                            <div className="flex justify-between items-center mb-2">
                                                <h4 className="font-semibold">Variant {v.name}</h4>
                                                <span className="text-sm text-gray-500">{v.weight}%</span>
                                            </div>
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">Sent</span>
                                                    <span className="font-medium">{v.sentCount || 0}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">Delivered</span>
                                                    <span className="font-medium text-green-600">{v.deliveredCount || 0}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">Failed</span>
                                                    <span className="font-medium text-red-600">{v.failedCount || 0}</span>
                                                </div>
                                                <div className="flex justify-between pt-2 border-t">
                                                    <span className="text-gray-500">Delivery Rate</span>
                                                    <span className="font-bold text-lg">{rate}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="p-6 border-t bg-gray-50 flex justify-end">
                            <Button variant="outline" onClick={() => setShowResultsModal(false)}>Close</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Create A/B Test Modal
function CreateABTestModal({
    apps,
    onClose,
    onCreated,
    authApiCall,
}: {
    apps: { id: string; name: string }[];
    onClose: () => void;
    onCreated: () => void;
    authApiCall: (endpoint: string, options?: RequestInit) => Promise<any>;
}) {
    const [formData, setFormData] = useState({
        appId: '',
        name: '',
        description: '',
        targetingMode: 'ALL' as 'ALL' | 'USER_LIST' | 'CSV',
        targetUserIds: '',
        scheduledAt: '',
    });

    const [variants, setVariants] = useState<ABTestVariant[]>([
        { name: 'A', weight: 50, title: '', body: '' },
        { name: 'B', weight: 50, title: '', body: '' },
    ]);

    const [isSaving, setIsSaving] = useState(false);
    const [previewVariant, setPreviewVariant] = useState<number>(0);

    const addVariant = () => {
        if (variants.length >= 5) return;
        const names = ['A', 'B', 'C', 'D', 'E'];
        const newWeight = Math.floor(100 / (variants.length + 1));
        const updatedVariants = variants.map(v => ({ ...v, weight: newWeight }));
        updatedVariants.push({ name: names[variants.length]!, weight: 100 - (newWeight * variants.length), title: '', body: '' });
        setVariants(updatedVariants);
    };

    const removeVariant = (index: number) => {
        if (variants.length <= 2) return;
        const updated = variants.filter((_, i) => i !== index);
        const weightPerVariant = Math.floor(100 / updated.length);
        const remainder = 100 - (weightPerVariant * updated.length);
        setVariants(updated.map((v, i) => ({ ...v, weight: weightPerVariant + (i === 0 ? remainder : 0) })));
    };

    const updateVariant = (index: number, field: keyof ABTestVariant, value: any) => {
        setVariants(variants.map((v, i) => i === index ? { ...v, [field]: value } : v));
    };

    const handleSubmit = async () => {
        if (!formData.appId || !formData.name) {
            alert('Please fill in all required fields');
            return;
        }

        const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
        if (totalWeight !== 100) {
            alert('Variant weights must sum to 100%');
            return;
        }

        if (variants.some(v => !v.title || !v.body)) {
            alert('All variants must have title and body');
            return;
        }

        setIsSaving(true);
        try {
            await authApiCall('/ab-tests', {
                method: 'POST',
                body: JSON.stringify({
                    ...formData,
                    targetUserIds: formData.targetUserIds
                        ? formData.targetUserIds.split('\n').map(s => s.trim()).filter(Boolean)
                        : undefined,
                    scheduledAt: formData.scheduledAt || undefined,
                    variants: variants.map(v => ({
                        name: v.name,
                        weight: v.weight,
                        title: v.title,
                        subtitle: v.subtitle || undefined,
                        body: v.body,
                        image: v.image || undefined,
                    })),
                }),
            });
            onCreated();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-auto">
                <div className="p-6 border-b">
                    <h3 className="text-lg font-semibold">Create A/B Test</h3>
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
                            <label className="block text-sm font-medium mb-1">Test Name *</label>
                            <input
                                className="w-full p-2 border rounded-lg text-sm"
                                placeholder="e.g., Welcome notification test"
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

                        <div>
                            <label className="block text-sm font-medium mb-1">Schedule (optional)</label>
                            <input
                                type="datetime-local"
                                className="w-full p-2 border rounded-lg text-sm"
                                value={formData.scheduledAt}
                                onChange={e => setFormData({ ...formData, scheduledAt: e.target.value })}
                            />
                        </div>

                        {/* Variants */}
                        <div className="border-t pt-4">
                            <div className="flex justify-between items-center mb-3">
                                <label className="block text-sm font-medium">Variants</label>
                                {variants.length < 5 && (
                                    <Button size="sm" variant="outline" onClick={addVariant}>
                                        + Add Variant
                                    </Button>
                                )}
                            </div>

                            <div className="space-y-4">
                                {variants.map((variant, index) => (
                                    <div
                                        key={variant.name}
                                        className={clsx(
                                            'p-4 border rounded-lg',
                                            previewVariant === index && 'border-blue-500 bg-blue-50'
                                        )}
                                        onClick={() => setPreviewVariant(index)}
                                    >
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="font-medium">Variant {variant.name}</span>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="99"
                                                    className="w-16 p-1 border rounded text-sm text-center"
                                                    value={variant.weight}
                                                    onClick={e => e.stopPropagation()}
                                                    onChange={e => updateVariant(index, 'weight', parseInt(e.target.value) || 0)}
                                                />
                                                <span className="text-sm text-gray-500">%</span>
                                                {variants.length > 2 && (
                                                    <button
                                                        className="text-red-500 hover:text-red-700"
                                                        onClick={(e) => { e.stopPropagation(); removeVariant(index); }}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <input
                                                className="w-full p-2 border rounded text-sm"
                                                placeholder="Title *"
                                                value={variant.title}
                                                onClick={e => e.stopPropagation()}
                                                onChange={e => updateVariant(index, 'title', e.target.value)}
                                            />
                                            <input
                                                className="w-full p-2 border rounded text-sm"
                                                placeholder="Subtitle (optional)"
                                                value={variant.subtitle || ''}
                                                onClick={e => e.stopPropagation()}
                                                onChange={e => updateVariant(index, 'subtitle', e.target.value)}
                                            />
                                            <textarea
                                                className="w-full p-2 border rounded text-sm"
                                                placeholder="Body *"
                                                rows={2}
                                                value={variant.body}
                                                onClick={e => e.stopPropagation()}
                                                onChange={e => updateVariant(index, 'body', e.target.value)}
                                            />
                                            <input
                                                className="w-full p-2 border rounded text-sm"
                                                placeholder="Image URL (optional)"
                                                value={variant.image || ''}
                                                onClick={e => e.stopPropagation()}
                                                onChange={e => updateVariant(index, 'image', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right: Preview */}
                    <div className="flex flex-col items-center">
                        <p className="text-sm text-gray-500 mb-4">Preview Variant {variants[previewVariant]?.name}</p>
                        <NotificationPreview
                            platform="android"
                            title={variants[previewVariant]?.title || 'Title'}
                            subtitle={variants[previewVariant]?.subtitle}
                            body={variants[previewVariant]?.body || 'Body'}
                            image={variants[previewVariant]?.image}
                        />
                    </div>
                </div>

                <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isSaving}>
                        {isSaving ? 'Creating...' : 'Create A/B Test'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
