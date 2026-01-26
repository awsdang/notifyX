import { useState, useEffect } from 'react';
import {
    FileText,
    Plus,
    Search,
    Globe,
    Languages,
    Layout,
    Trash2,
    Clock,
    Copy,
    Save,
    X,
    MessageSquare,
    AlignLeft,
    AlignRight
} from 'lucide-react';
import { Button } from './ui/button';
import { useAuthenticatedFetch } from '../context/AuthContext';
import { clsx } from 'clsx';
import { NotificationPreview } from './NotificationPreview';

interface Template {
    id: string;
    appId: string;
    name: string;
    description: string;
    defaultLanguage: string;
    availableLanguages: string[];
    updatedAt: string;
}

interface TemplateContent {
    language: string;
    title: string;
    body: string;
    data?: Record<string, string>;
}

interface TemplatesManagerProps {
    appId: string;
}

const SUPPORTED_LANGUAGES = [
    { code: 'en', name: 'English', dir: 'ltr' },
    { code: 'ar', name: 'Arabic', dir: 'rtl' },
    { code: 'he', name: 'Hebrew', dir: 'rtl' },
    { code: 'fr', name: 'French', dir: 'ltr' },
    { code: 'es', name: 'Spanish', dir: 'ltr' },
    { code: 'de', name: 'German', dir: 'ltr' },
    { code: 'zh', name: 'Chinese', dir: 'ltr' },
];

export function TemplatesManager({ appId }: TemplatesManagerProps) {
    const authFetch = useAuthenticatedFetch();
    const [templates, setTemplates] = useState<Template[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Editor State
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [editingContent, setEditingContent] = useState<TemplateContent | null>(null);
    const [activeLang, setActiveLang] = useState('en');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        loadTemplates();
    }, [appId]);

    const loadTemplates = async () => {
        setIsLoading(true);
        try {
            const data = await authFetch(`/apps/${appId}/templates`);
            setTemplates(data);
        } catch (error) {
            console.error('Failed to load templates:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelectTemplate = async (template: Template) => {
        setSelectedTemplate(template);
        setActiveLang(template.defaultLanguage);
        try {
            const content = await authFetch(`/apps/${appId}/templates/${template.id}/content/${template.defaultLanguage}`);
            setEditingContent(content);
        } catch (error) {
            setEditingContent({
                language: template.defaultLanguage,
                title: '',
                body: ''
            });
        }
    };

    const handleLangSwitch = async (langCode: string) => {
        if (!selectedTemplate) return;
        setActiveLang(langCode);
        try {
            const content = await authFetch(`/apps/${appId}/templates/${selectedTemplate.id}/content/${langCode}`);
            setEditingContent(content);
        } catch (error) {
            setEditingContent({
                language: langCode,
                title: '',
                body: ''
            });
        }
    };

    const handleSaveContent = async () => {
        if (!selectedTemplate || !editingContent) return;
        setIsSaving(true);
        try {
            await authFetch(`/apps/${appId}/templates/${selectedTemplate.id}/content`, {
                method: 'PUT',
                body: JSON.stringify(editingContent)
            });
            // Update local state if needed
            if (!selectedTemplate.availableLanguages.includes(editingContent.language)) {
                setSelectedTemplate({
                    ...selectedTemplate,
                    availableLanguages: [...selectedTemplate.availableLanguages, editingContent.language]
                });
                setTemplates(templates.map(t =>
                    t.id === selectedTemplate.id
                        ? { ...t, availableLanguages: [...t.availableLanguages, editingContent.language] }
                        : t
                ));
            }
        } catch (error) {
            alert('Failed to save template content');
        } finally {
            setIsSaving(false);
        }
    };

    const filteredTemplates = templates.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const activeLangInfo = SUPPORTED_LANGUAGES.find(l => l.code === activeLang) || SUPPORTED_LANGUAGES[0];

    return (
        <div className="flex h-[calc(100vh-12rem)] bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Sidebar: Template List */}
            <div className="w-80 border-r border-gray-100 flex flex-col bg-gray-50/30">
                <div className="p-6 border-b border-gray-100 bg-white">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" />
                            Templates
                        </h3>
                        <Button variant="ghost" size="icon" onClick={() => setIsCreateModalOpen(true)} className="rounded-xl h-8 w-8">
                            <Plus className="w-4 h-4" />
                        </Button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search templates..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {isLoading ? (
                        Array(3).fill(0).map((_, i) => (
                            <div key={i} className="h-16 bg-white rounded-2xl animate-pulse border border-gray-50" />
                        ))
                    ) : filteredTemplates.length === 0 ? (
                        <div className="text-center py-12">
                            <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                            <p className="text-xs text-gray-400">No templates found</p>
                        </div>
                    ) : (
                        filteredTemplates.map(template => (
                            <button
                                key={template.id}
                                onClick={() => handleSelectTemplate(template)}
                                className={clsx(
                                    "w-full p-4 rounded-2xl text-left transition-all border group",
                                    selectedTemplate?.id === template.id
                                        ? "bg-blue-600 border-blue-600 shadow-lg shadow-blue-500/20 text-white"
                                        : "bg-white border-transparent hover:border-gray-100 hover:bg-white"
                                )}
                            >
                                <h4 className="font-bold text-sm truncate">{template.name}</h4>
                                <div className="flex items-center gap-2 mt-2">
                                    <div className="flex -space-x-1">
                                        {template.availableLanguages.slice(0, 3).map(lang => (
                                            <div key={lang} className={clsx(
                                                "w-5 h-5 rounded-full border-2 flex items-center justify-center text-[8px] font-bold uppercase",
                                                selectedTemplate?.id === template.id ? "bg-blue-500 border-blue-600" : "bg-gray-100 border-white"
                                            )}>
                                                {lang}
                                            </div>
                                        ))}
                                    </div>
                                    <span className={clsx("text-[10px] font-medium opacity-60", selectedTemplate?.id === template.id ? "text-white" : "text-gray-400")}>
                                        {template.availableLanguages.length} languages
                                    </span>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Main Editor / Detail */}
            <div className="flex-1 flex flex-col bg-white">
                {!selectedTemplate ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                        <div className="w-20 h-20 bg-gray-50 rounded-[2.5rem] flex items-center justify-center mb-6">
                            <Layout className="w-10 h-10 text-gray-200" />
                        </div>
                        <h4 className="text-xl font-bold text-gray-900 mb-2">Select a Template</h4>
                        <p className="text-sm text-gray-400 max-w-xs mx-auto">Choose a template from the list to edit its content and manage multi-language support.</p>
                    </div>
                ) : (
                    <>
                        {/* Editor Header */}
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h3 className="text-xl font-bold text-gray-900">{selectedTemplate.name}</h3>
                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded-lg uppercase tracking-wider">{selectedTemplate.id}</span>
                                </div>
                                <p className="text-sm text-gray-500 mt-1">{selectedTemplate.description}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button variant="ghost" className="rounded-xl px-4 gap-2 text-red-600 hover:bg-red-50 hover:text-red-700">
                                    <Trash2 className="w-4 h-4" />
                                    Delete
                                </Button>
                                <Button onClick={handleSaveContent} disabled={isSaving} className="rounded-xl px-6 gap-2 shadow-lg shadow-blue-500/20">
                                    {isSaving ? <Clock className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Save Changes
                                </Button>
                            </div>
                        </div>

                        {/* Language Selector Tabs */}
                        <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
                            <Languages className="w-4 h-4 text-gray-400 mr-2 shrink-0" />
                            {SUPPORTED_LANGUAGES.map(lang => (
                                <button
                                    key={lang.code}
                                    onClick={() => handleLangSwitch(lang.code)}
                                    className={clsx(
                                        "px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 border",
                                        activeLang === lang.code
                                            ? "bg-white border-blue-100 text-blue-600 shadow-sm"
                                            : "bg-transparent border-transparent text-gray-400 hover:text-gray-600"
                                    )}
                                >
                                    {lang.name}
                                    {selectedTemplate.availableLanguages.includes(lang.code) && (
                                        <div className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full ml-1.5" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Editor Layout */}
                        <div className="flex-1 flex overflow-hidden">
                            {/* Content Input */}
                            <div className="flex-1 p-8 overflow-y-auto space-y-8 border-r border-gray-50">
                                <section className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <MessageSquare className="w-4 h-4" />
                                            Notification Title
                                        </label>
                                        <Button variant="ghost" size="sm" className="h-7 text-[10px] font-bold text-blue-600 rounded-lg">
                                            <Copy className="w-3 h-3 mr-1" /> Variable
                                        </Button>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Order arrived! {{orderId}}"
                                        value={editingContent?.title || ''}
                                        onChange={(e) => setEditingContent(prev => prev ? { ...prev, title: e.target.value } : null)}
                                        dir={activeLangInfo.dir}
                                        className={clsx(
                                            "w-full px-6 py-4 bg-white border border-gray-100 rounded-2xl text-lg font-bold focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 outline-none transition-all placeholder:text-gray-200 shadow-sm",
                                            activeLangInfo.dir === 'rtl' ? "text-right" : "text-left"
                                        )}
                                    />
                                </section>

                                <section className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <Layout className="w-4 h-4" />
                                            Notification Body
                                        </label>
                                        <div className="flex gap-1">
                                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg"><AlignLeft className="w-3 h-3" /></Button>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg bg-gray-100"><AlignRight className="w-3 h-3" /></Button>
                                        </div>
                                    </div>
                                    <textarea
                                        placeholder="Your delicious burger is at your doorstep..."
                                        rows={6}
                                        value={editingContent?.body || ''}
                                        onChange={(e) => setEditingContent(prev => prev ? { ...prev, body: e.target.value } : null)}
                                        dir={activeLangInfo.dir}
                                        className={clsx(
                                            "w-full px-6 py-4 bg-white border border-gray-100 rounded-2xl text-sm leading-relaxed focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/50 outline-none transition-all placeholder:text-gray-200 shadow-sm",
                                            activeLangInfo.dir === 'rtl' ? "text-right" : "text-left"
                                        )}
                                    ></textarea>
                                </section>

                                <section className="p-6 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                                    <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                        <Globe className="w-4 h-4" />
                                        Regional Best Practice
                                    </h4>
                                    <p className="text-xs text-blue-700/70 leading-relaxed">
                                        {activeLangInfo.dir === 'rtl'
                                            ? 'Ensure punctuation is placed correctly for RTL text. Mobile devices correctly swap layout icons like back arrows automatically.'
                                            : 'Keep titles under 40 characters for best visibility across all mobile notification centers.'
                                        }
                                    </p>
                                </section>
                            </div>

                            {/* Live Preview Pane */}
                            <div className="w-[400px] p-8 bg-gray-50/50 flex flex-col items-center">
                                <div className="w-full flex items-center justify-between mb-8">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Device Preview</label>
                                    <div className="flex gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                                        <div className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                                    </div>
                                </div>

                                <div className="w-full max-w-[320px] scale-95 origin-top">
                                    <NotificationPreview
                                        platform="android"
                                        title={editingContent?.title || 'Notification Title'}
                                        body={editingContent?.body || 'Message body content goes here...'}
                                        direction={activeLangInfo.dir as 'ltr' | 'rtl'}
                                    />
                                </div>

                                <div className="mt-12 w-full space-y-4">
                                    <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Metadata Variables</h5>
                                    <div className="grid grid-cols-2 gap-2">
                                        {['userName', 'orderId', 'link', 'discount'].map(v => (
                                            <div key={v} className="px-3 py-2 bg-white rounded-xl border border-gray-100 text-[10px] font-mono text-gray-500 flex items-center justify-between group cursor-pointer hover:border-blue-200">
                                                <span>{v}</span>
                                                <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Create Template Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden">
                        <div className="p-8 border-b flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">New Template</h3>
                                <p className="text-sm text-gray-500">Define a reusable notification blueprint</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setIsCreateModalOpen(false)} className="rounded-xl">
                                <X className="w-5 h-5" />
                            </Button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700 ml-1">Template Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g., Order Confirmation"
                                    className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-700 ml-1">Description</label>
                                <textarea
                                    placeholder="Sent when customer successfully pays..."
                                    rows={3}
                                    className="w-full px-5 py-3 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                ></textarea>
                            </div>
                        </div>
                        <div className="p-8 bg-gray-50 flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)} className="rounded-xl px-6">Cancel</Button>
                            <Button className="rounded-xl px-8 shadow-lg shadow-blue-500/20">Create Template</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
