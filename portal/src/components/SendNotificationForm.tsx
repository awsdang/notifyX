import { useState } from 'react';
import { Button } from './ui/button';
import { NotificationPreview } from './NotificationPreview';
import { clsx } from 'clsx';
import type { App } from '../types';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface SendNotificationFormProps {
    apps: App[];
}

export function SendNotificationForm({ apps }: SendNotificationFormProps) {
    const { token } = useAuth();
    const [formData, setFormData] = useState({
        appId: '',
        title: '',
        body: '',
        templateId: '',
        data: ''
    });
    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
    const [previewPlatform, setPreviewPlatform] = useState<'ios' | 'android'>('ios');
    const [previewDirection, setPreviewDirection] = useState<'ltr' | 'rtl'>('ltr');

    const sendNotification = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus(null);
        try {
            await apiFetch('/notifications', {
                method: 'POST',
                body: JSON.stringify({
                    ...formData,
                    data: formData.data ? JSON.parse(formData.data) : {}
                })
            }, token);

            setStatus({ type: 'success', message: 'Notification sent successfully!' });
            setFormData({ ...formData, title: '', body: '', data: '' });
        } catch (error: any) {
            setStatus({ type: 'error', message: error.message || 'Failed to send notification' });
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form */}
            <div className="bg-white p-6 rounded-xl border shadow-sm">
                <h3 className="font-semibold mb-4">Compose Notification</h3>
                <form onSubmit={sendNotification} className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">App</label>
                        <select
                            className="w-full p-2 border rounded-md text-sm bg-white"
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
                        <label className="block text-sm font-medium mb-1">Title</label>
                        <input
                            type="text"
                            className="w-full p-2 border rounded-md text-sm"
                            value={formData.title}
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                            placeholder="E.g. Summer Sale!"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Body</label>
                        <textarea
                            className="w-full p-2 border rounded-md text-sm h-24"
                            value={formData.body}
                            onChange={e => setFormData({ ...formData, body: e.target.value })}
                            placeholder="Your message goes here..."
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Custom Data (JSON)</label>
                        <textarea
                            className="w-full p-2 border rounded-md text-sm font-mono h-24"
                            value={formData.data}
                            onChange={e => setFormData({ ...formData, data: e.target.value })}
                            placeholder='{"key": "value"}'
                        />
                    </div>
                    {status && (
                        <div className={clsx(
                            "p-3 rounded-md text-sm font-medium",
                            status.type === 'success' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                        )}>
                            {status.message}
                        </div>
                    )}
                    <Button type="submit" className="mt-2">Send Now</Button>
                </form>
            </div>

            {/* Preview */}
            <div className="flex flex-col gap-6">
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-semibold">Live Preview</h3>
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button
                                onClick={() => setPreviewPlatform('ios')}
                                className={clsx("px-3 py-1 text-xs font-bold rounded-md transition-all", previewPlatform === 'ios' ? "bg-white shadow-sm" : "text-slate-500")}
                            >iOS</button>
                            <button
                                onClick={() => setPreviewPlatform('android')}
                                className={clsx("px-3 py-1 text-xs font-bold rounded-md transition-all", previewPlatform === 'android' ? "bg-white shadow-sm" : "text-slate-500")}
                            >Android</button>
                        </div>
                    </div>

                    <div className="mb-4 flex gap-2">
                        <button onClick={() => setPreviewDirection('ltr')} className={clsx("px-2 py-1 text-[10px] font-bold border rounded", previewDirection === 'ltr' ? "bg-slate-200" : "bg-white")}>LTR</button>
                        <button onClick={() => setPreviewDirection('rtl')} className={clsx("px-2 py-1 text-[10px] font-bold border rounded", previewDirection === 'rtl' ? "bg-slate-200" : "bg-white")}>RTL</button>
                    </div>

                    <div className="flex justify-center p-8 bg-slate-100 rounded-xl">
                        <NotificationPreview
                            platform={previewPlatform}
                            title={formData.title || 'Notification Title'}
                            body={formData.body || 'This is how your message will look to your users.'}
                            subtitle={apps.find(a => a.id === formData.appId)?.name || 'NotifyX'}
                            direction={previewDirection}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
