import { cn } from '../helpers/utils';

interface NotificationPreviewProps {
    platform: 'android' | 'ios' | 'huawei';
    title: string;
    subtitle?: string;
    body: string;
    image?: string;
    direction?: 'ltr' | 'rtl';
}

export function NotificationPreview({
    platform,
    title,
    subtitle,
    body,
    image,
    direction = 'ltr',
}: NotificationPreviewProps) {
    const isRTL = direction === 'rtl';

    return (
        <div className={cn(
            "w-80 mx-auto rounded-[40px] bg-gray-900 p-4 shadow-2xl ring-4 ring-gray-800",
            platform === 'ios' && "rounded-[50px]"
        )}>
            {/* Phone Status Bar */}
            <div className="h-8 bg-gray-900 rounded-t-[30px] flex items-center justify-center px-6">
                <div className="flex-1 flex items-center gap-1">
                    <span className="text-white text-xs font-medium">9:41</span>
                </div>
                <div className={cn(
                    "w-24 h-6 bg-black rounded-full",
                    platform === 'android' && "hidden"
                )}></div>
                <div className="flex-1 flex justify-end items-center gap-1">
                    <div className="w-4 h-4 bg-white/30 rounded-sm"></div>
                    <div className="w-6 h-3 bg-white rounded-sm"></div>
                </div>
            </div>

            {/* Screen Content */}
            <div className="bg-gradient-to-b from-slate-100 to-slate-200 min-h-[400px] rounded-[28px] p-4 flex flex-col">
                {/* Notification Card */}
                <div
                    className={cn(
                        "bg-white/95 backdrop-blur-sm rounded-2xl p-4 shadow-lg",
                        isRTL && "text-right"
                    )}
                    dir={direction}
                >
                    <div className="flex items-start gap-3">
                        {/* App Icon */}
                        <div className={cn(
                            "w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0",
                            isRTL && "order-last"
                        )}>
                            NX
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-xs text-gray-500 font-medium">NOTIFYX • now</p>
                            </div>
                            <h4 className="font-semibold text-gray-900 text-sm leading-tight">{title}</h4>
                            {subtitle && (
                                <p className="text-gray-700 text-xs mt-0.5">{subtitle}</p>
                            )}
                            <p className="text-gray-600 text-xs mt-1 leading-relaxed line-clamp-2">{body}</p>
                        </div>
                    </div>

                    {image && (
                        <div className="mt-3 rounded-lg overflow-hidden">
                            <img
                                src={image}
                                alt="Notification image"
                                className="w-full h-32 object-cover"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://placehold.co/300x120/e2e8f0/94a3b8?text=Image';
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Platform Label */}
                <div className="mt-auto pt-4 flex justify-center">
                    <span className={cn(
                        "text-xs px-3 py-1 rounded-full font-medium",
                        platform === 'android' && "bg-green-100 text-green-700",
                        platform === 'ios' && "bg-gray-200 text-gray-700",
                        platform === 'huawei' && "bg-red-100 text-red-700",
                    )}>
                        {platform.toUpperCase()}
                    </span>
                </div>
            </div>

            {/* Home Bar (iOS style) */}
            {platform === 'ios' && (
                <div className="h-6 flex items-end justify-center pb-1">
                    <div className="w-32 h-1 bg-white/50 rounded-full"></div>
                </div>
            )}
        </div>
    );
}
