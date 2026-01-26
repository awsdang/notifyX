import {
    Bell,
    Zap,
    UserPlus,
    Clock,
    AlertCircle
} from 'lucide-react';
import { clsx } from 'clsx';

interface ActivityItem {
    id: string;
    type: 'notification' | 'user' | 'automation' | 'alert';
    title: string;
    timestamp: string;
    description: string;
    status: 'success' | 'pending' | 'warning' | 'error';
}

const MOCK_ACTIVITIES: ActivityItem[] = [
    {
        id: '1',
        type: 'notification',
        title: 'Campaign "Summer Sale" Sent',
        timestamp: '2 mins ago',
        description: 'Dispatched to 15,240 devices via FCM and APNS.',
        status: 'success'
    },
    {
        id: '2',
        type: 'user',
        title: 'Audience Import Successful',
        timestamp: '45 mins ago',
        description: 'New 1,200 users synchronized from "users_july.csv".',
        status: 'success'
    },
    {
        id: '3',
        type: 'automation',
        title: 'Workflow "Welcome Series" Triggered',
        timestamp: '1 hour ago',
        description: 'Automation node 1 dispatch for user: uid_9210.',
        status: 'pending'
    },
    {
        id: '4',
        type: 'alert',
        title: 'APNS Token Expiry Warning',
        timestamp: '3 hours ago',
        description: '240 tokens marked for cleanup due to feedback service.',
        status: 'warning'
    }
];

export function ActivityFeed() {
    return (
        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col h-full animate-in fade-in duration-700">
            <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-white/50 backdrop-blur-sm z-10">
                <div>
                    <h3 className="text-xl font-bold text-gray-900">Recent Activity</h3>
                    <p className="text-sm text-gray-400 mt-1">Live stream of notification delivery and platform events</p>
                </div>
                <div className="flex -space-x-2">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center overflow-hidden">
                            <img src={`https://i.pravatar.cc/150?u=${i + 10}`} alt="user" className="w-full h-full object-cover opacity-80" />
                        </div>
                    ))}
                    <div className="w-8 h-8 rounded-full border-2 border-white bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600">
                        +12
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {MOCK_ACTIVITIES.map((activity) => (
                    <div
                        key={activity.id}
                        className="group p-4 rounded-3xl hover:bg-gray-50 transition-all duration-300 border border-transparent hover:border-gray-100 flex gap-4 items-start"
                    >
                        <div className={clsx(
                            "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110",
                            activity.status === 'success' ? "bg-green-50 text-green-600" :
                                activity.status === 'warning' ? "bg-amber-50 text-amber-600" :
                                    activity.status === 'error' ? "bg-red-50 text-red-600" :
                                        "bg-blue-50 text-blue-600"
                        )}>
                            {activity.type === 'notification' && <Bell size={18} />}
                            {activity.type === 'user' && <UserPlus size={18} />}
                            {activity.type === 'automation' && <Zap size={18} />}
                            {activity.type === 'alert' && <AlertCircle size={18} />}
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <h4 className="text-sm font-bold text-gray-900 truncate">{activity.title}</h4>
                                <span className="text-[10px] font-medium text-gray-400 flex items-center gap-1 shrink-0">
                                    <Clock size={10} /> {activity.timestamp}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{activity.description}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-6 bg-gray-50/50 border-t border-gray-50 text-center">
                <button className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline transition-all">
                    View Comprehensive Audit Logs →
                </button>
            </div>
        </div>
    );
}
