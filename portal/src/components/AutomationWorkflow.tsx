import { useState } from 'react';
import {
    Zap,
    Plus,
    ChevronRight,
    Bell,
    Clock,
    Users,
    Settings2,
    Trash2,
    Play,
    Pause
} from 'lucide-react';
import { Button } from './ui/button';
import { clsx } from 'clsx';

interface WorkflowNode {
    id: string;
    type: 'trigger' | 'delay' | 'action' | 'condition';
    label: string;
    description: string;
    icon: React.ReactNode;
    color: string;
}

const TRIGGER_TYPES: WorkflowNode[] = [
    { id: 't1', type: 'trigger', label: 'On Registration', description: 'When a new user joins', icon: <Users size={18} />, color: 'bg-blue-500' },
    { id: 't2', type: 'trigger', label: 'On Event', description: 'Custom app event triggered', icon: <Zap size={18} />, color: 'bg-amber-500' }
];

const ACTION_TYPES: WorkflowNode[] = [
    { id: 'a1', type: 'action', label: 'Send Template', description: 'Dispatch a push notification', icon: <Bell size={18} />, color: 'bg-purple-500' },
    { id: 'a2', type: 'action', label: 'Update Profile', description: 'Modify user metadata', icon: <Settings2 size={18} />, color: 'bg-emerald-500' }
];

export function AutomationWorkflow() {
    const [workflowName, setWorkflowName] = useState('New Automation Workflow');
    const [isActive, setIsActive] = useState(false);
    const [nodes, setNodes] = useState<WorkflowNode[]>([
        TRIGGER_TYPES[0]
    ]);

    const addAction = () => {
        setNodes([...nodes, ACTION_TYPES[0]]);
    };

    const removeNode = (index: number) => {
        if (nodes.length <= 1) return;
        setNodes(nodes.filter((_, i) => i !== index));
    };

    return (
        <div className="flex flex-col h-[calc(100vh-12rem)] animate-in fade-in duration-500">
            {/* Header */}
            <header className="bg-white px-8 py-6 border rounded-t-3xl flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                        <Zap className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                        <input
                            value={workflowName}
                            onChange={(e) => setWorkflowName(e.target.value)}
                            className="text-lg font-bold text-gray-900 bg-transparent border-none p-0 focus:ring-0 outline-none w-64"
                        />
                        <p className="text-xs text-gray-400 mt-0.5">Automated delivery pipeline</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className={clsx(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all",
                        isActive ? "bg-green-50 border-green-100 text-green-700" : "bg-gray-50 border-gray-100 text-gray-400"
                    )}>
                        <div className={clsx("w-2 h-2 rounded-full", isActive ? "bg-green-500" : "bg-gray-300")} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{isActive ? 'Live' : 'Draft'}</span>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => setIsActive(!isActive)}
                        className="rounded-xl px-4 h-10"
                    >
                        {isActive ? <Pause size={16} className="mr-2" /> : <Play size={16} className="mr-2" />}
                        {isActive ? 'Pause' : 'Activate'}
                    </Button>
                    <Button className="bg-blue-600 hover:bg-blue-700 rounded-xl px-6 h-10 shadow-lg shadow-blue-500/20">
                        Save Workflow
                    </Button>
                </div>
            </header>

            {/* Workflow Canvas */}
            <div className="flex-1 bg-slate-50/50 rounded-b-3xl border border-t-0 p-12 overflow-y-auto relative">
                {/* Visual Connector Line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-200 via-blue-200 to-transparent -translate-x-1/2" />

                <div className="max-w-xl mx-auto space-y-12 relative flex flex-col items-center">
                    {nodes.map((node, index) => (
                        <div key={`${node.id}-${index}`} className="w-full flex flex-col items-center group">
                            <div className="w-full bg-white rounded-[2rem] border border-gray-100 p-6 shadow-sm hover:shadow-xl hover:border-blue-100 transition-all duration-500 relative">
                                <div className="flex items-center gap-5">
                                    <div className={clsx("w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg", node.color)}>
                                        {node.icon}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{node.type}</span>
                                            {index === 0 && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-bold rounded">START</span>}
                                        </div>
                                        <h4 className="text-lg font-bold text-gray-900">{node.label}</h4>
                                        <p className="text-sm text-gray-500">{node.description}</p>
                                    </div>
                                    {index > 0 && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeNode(index)}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl"
                                        >
                                            <Trash2 size={18} />
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Link Connector */}
                            {index < nodes.length - 1 && (
                                <div className="h-12 w-8 flex items-center justify-center">
                                    <ChevronRight className="rotate-90 text-blue-300" />
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Add Action Button */}
                    <button
                        onClick={addAction}
                        className="w-14 h-14 bg-white rounded-full shadow-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-purple-500 hover:text-purple-600 hover:scale-110 transition-all duration-300 z-10"
                    >
                        <Plus size={24} />
                    </button>

                    <div className="text-center pt-8">
                        <p className="text-xs text-gray-400">Add an action to the workflow above to expand the automation chain.</p>
                    </div>
                </div>
            </div>

            {/* Side Panel (Contextual) - Mockup */}
            <aside className="fixed right-12 top-[20rem] w-64 bg-white/80 backdrop-blur-md rounded-3xl border border-white/50 p-6 shadow-2xl space-y-6 animate-in slide-in-from-right-10 duration-700">
                <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Selected Component</h5>
                <div className="space-y-4">
                    <div className="p-4 bg-purple-50/50 rounded-2xl border border-purple-100">
                        <div className="flex items-center gap-2 text-purple-700 font-bold text-sm mb-1">
                            <Clock size={14} /> Wait Time
                        </div>
                        <p className="text-[10px] text-purple-600/70">Wait for 2 days before sending the next template.</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 ml-1">Condition Logic</label>
                        <div className="px-3 py-2 bg-gray-50 rounded-xl text-[10px] text-gray-600 border border-transparent">
                            If <span className="text-blue-600 font-bold">is_paying</span> is <span className="font-bold">true</span>
                        </div>
                    </div>
                </div>
                <div className="pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <span>Success Rate</span>
                        <span className="text-green-600 font-bold">98.2%</span>
                    </div>
                </div>
            </aside>
        </div>
    );
}
