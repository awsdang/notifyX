import {
    Bell,
    LayoutDashboard,
    Users,
    Send,
    FileText,
    Settings,
    Key,
    LogOut,
    FlaskConical,
    Megaphone,
    Zap,
    Terminal,
    ScrollText
} from 'lucide-react';
import { NavButton } from './NavButton';

interface SidebarProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
    canManageCredentials: boolean;
    logout: () => void;
}

export function Sidebar({ activeTab, setActiveTab, canManageCredentials, logout }: SidebarProps) {
    return (
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col items-stretch p-4 gap-2 shrink-0 overflow-y-auto">
            <div className="flex items-center gap-3 px-3 py-6 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-200">
                    <Bell className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">NotifyX</h1>
            </div>

            <nav className="flex-1 space-y-1">
                <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={20} />}>Dashboard</NavButton>
                <NavButton active={activeTab === 'send'} onClick={() => setActiveTab('send')} icon={<Send size={20} />}>Send Notification</NavButton>
                <NavButton active={activeTab === 'campaigns'} onClick={() => setActiveTab('campaigns')} icon={<Megaphone size={20} />}>Campaigns</NavButton>
                <NavButton active={activeTab === 'abtests'} onClick={() => setActiveTab('abtests')} icon={<FlaskConical size={20} />}>A/B Testing</NavButton>
                <NavButton active={activeTab === 'templates'} onClick={() => setActiveTab('templates')} icon={<FileText size={20} />}>Templates</NavButton>
                <NavButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={<Users size={20} />}>Users & Devices</NavButton>
                <NavButton active={activeTab === 'automation'} onClick={() => setActiveTab('automation')} icon={<Zap size={20} />}>Automation</NavButton>
                <NavButton active={activeTab === 'devx'} onClick={() => setActiveTab('devx')} icon={<Terminal size={20} />}>DevX & SDKs</NavButton>
                <NavButton active={activeTab === 'simulator'} onClick={() => setActiveTab('simulator')} icon={<FlaskConical size={20} />}>Simulator</NavButton>
                <NavButton active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} icon={<ScrollText size={20} />}>Audit Logs</NavButton>
                <NavButton active={activeTab === 'apps'} onClick={() => setActiveTab('apps')} icon={<Settings size={20} />}>Manage Apps</NavButton>
                {canManageCredentials && (
                    <NavButton active={activeTab === 'credentials'} onClick={() => setActiveTab('credentials')} icon={<Key size={20} />}>Credentials</NavButton>
                )}
            </nav>

            <div className="pt-4 mt-auto border-t border-slate-100">
                <button
                    onClick={logout}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-all w-full"
                >
                    <LogOut size={20} />
                    Sign Out
                </button>
            </div>
        </aside>
    );
}
