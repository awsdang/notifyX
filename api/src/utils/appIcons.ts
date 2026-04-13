type AppIconConfig = {
  notificationIconUrl?: string | null;
  androidNotificationIcon?: string | null;
};

type MessageIconConfig = {
  icon?: string;
  androidIcon?: string;
};

export function resolvePushMessageIcons(
  app: AppIconConfig | null | undefined,
  overrideIconUrl?: string | null,
): MessageIconConfig {
  const icon = overrideIconUrl?.trim() || app?.notificationIconUrl?.trim() || undefined;
  const androidIcon = app?.androidNotificationIcon?.trim() || undefined;

  return {
    ...(icon ? { icon } : {}),
    ...(androidIcon ? { androidIcon } : {}),
  };
}

export function withAppIconData(
  data: Record<string, string> | undefined,
  iconUrl?: string,
): Record<string, string> | undefined {
  if (!iconUrl) {
    return data;
  }

  return {
    ...(data || {}),
    icon: iconUrl,
    appIconUrl: iconUrl,
  };
}
