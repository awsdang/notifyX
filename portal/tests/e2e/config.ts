export const SELECTORS = {
    login: {
        emailInput: 'input[type="email"]',
        passwordInput: 'input[type="password"]',
        submitButton: 'button:has-text("Sign In"), button:has-text("Login")',
    },
    sidebar: {
        dashboard: 'button:has-text("Dashboard")',
        sendContent: 'button:has-text("Send Notification")',
        campaigns: 'button:has-text("Campaigns")',
        abTesting: 'button:has-text("A/B Testing")',
        templates: 'button:has-text("Templates")',
        users: 'button:has-text("Users & Devices")',
        automation: 'button:has-text("Automation")',
        devx: 'button:has-text("DevX & SDKs")',
        simulator: 'button:has-text("Simulator")',
        audit: 'button:has-text("Audit Logs")',
        apps: 'button:has-text("Manage Apps")',
        credentials: 'button:has-text("Credentials")',
        logout: 'button:has-text("Sign Out")',
    },
    dashboard: {
        totalNotifications: 'text=Total Notifications',
        successRate: 'text=Delivery Success Rate',
        startBuilder: 'button:has-text("Start Builder")',
        manageKeys: 'text=Manage Keys',
    },
};

export const MOCK_DATA = {
    user: {
        email: 'super@test.local',
        token: 'mock-jwt-token',
        role: 'SUPER_ADMIN',
    },
    apps: [
        { id: 'app_1', name: 'Consumer App', bundleId: 'com.notifyx.consumer' },
        { id: 'app_2', name: 'Driver App', bundleId: 'com.notifyx.driver' },
    ],
    stats: {
        notifications: { total: 15420, thisWeek: 1200, thisMonth: 5400, pending: 42 },
        delivery: { successRate: 98.5 },
        resources: { devices: 8540 },
    },
};
