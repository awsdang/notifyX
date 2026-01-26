import { useState } from 'react'
import { Settings, Bell } from 'lucide-react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LoginPage } from './components/LoginPage'
import { ABTesting } from './components/ABTesting'
import { Campaigns } from './components/Campaigns'
import { UsersDevices } from './components/UsersDevices'
import { WebhookManager } from './components/WebhookManager'
import { TemplatesManager } from './components/TemplatesManager'
import { AutomationWorkflow } from './components/AutomationWorkflow'
import { SDKGenerator } from './components/SDKGenerator'
import { AuditLogs } from './components/AuditLogs'
import { WebhookSimulator } from './components/WebhookSimulator'
import { Button } from './components/ui/button'

// New Architecture Components
import { Sidebar } from './components/Sidebar'
import { DashboardPage } from './pages/DashboardPage'
import { CredentialsPage } from './pages/CredentialsPage'
import { SendNotificationForm } from './components/SendNotificationForm'
import { useAppManager } from './hooks/useAppManager'
import type { Application } from './types'

function AppContent() {
  const { logout, token, canManageCredentials } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  const { apps, createApp } = useAppManager();

  const [selectedAppForCredentials, setSelectedAppForCredentials] = useState<Application | null>(null);
  const [selectedAppForTemplates, setSelectedAppForTemplates] = useState<Application | null>(null);

  const handleCreateApp = async () => {
    const name = prompt('Enter app name:');
    if (name) {
      await createApp(name);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        canManageCredentials={canManageCredentials}
        logout={logout}
      />

      <main className="flex-1 overflow-y-auto p-8 lg:p-12 relative scroll-smooth bg-slate-50/50">
        <header className="flex justify-between items-end mb-12">
          <div>
            <h2 className="text-3xl font-black text-slate-900 capitalize tracking-tight">
              {activeTab.replace('abtests', 'A/B Testing').replace('devx', 'SDKs & Webhooks')}
            </h2>
            <p className="text-slate-500 mt-1 font-medium">Manage your notification infrastructure with intelligence.</p>
          </div>
          <div className="flex gap-4">
            <div className="bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">System Online</span>
            </div>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <DashboardPage setActiveTab={setActiveTab} />
        )}

        {activeTab === 'send' && (
          <SendNotificationForm apps={apps} />
        )}

        {activeTab === 'templates' && (
          <div className="space-y-6">
            {!selectedAppForTemplates ? (
              <div className="space-y-4">
                <p className="text-gray-500">Select an app to manage its localized templates:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {apps.length === 0 ? (
                    <div className="col-span-full bg-white rounded-xl border p-6 text-center text-gray-400">
                      <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No apps registered. Create an app first!</p>
                    </div>
                  ) : (
                    apps.map((app: Application) => (
                      <button
                        key={app.id}
                        onClick={() => setSelectedAppForTemplates(app)}
                        className="bg-white rounded-xl border p-6 text-left hover:border-blue-500 hover:shadow-md transition-all"
                      >
                        <h4 className="font-semibold text-lg">{app.name}</h4>
                        <p className="text-xs text-gray-400 font-mono mt-1">{app.id}</p>
                        <p className="text-sm text-blue-600 mt-3">Manage Templates →</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setSelectedAppForTemplates(null)} className="mb-2">
                  ← Back to App Selection
                </Button>
                <TemplatesManager appId={selectedAppForTemplates.id} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'automation' && <AutomationWorkflow />}
        {activeTab === 'simulator' && <WebhookSimulator />}
        {activeTab === 'audit' && <AuditLogs />}

        {activeTab === 'devx' && (
          <div className="space-y-8">
            <SDKGenerator />
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Webhook Management</h3>
                  <p className="text-sm text-gray-500 mt-1">Receive real-time delivery and click insights</p>
                </div>
              </div>
              <WebhookManager appId={apps[0]?.id || ''} appName={apps[0]?.name || ''} token={token || ''} />
            </div>
          </div>
        )}

        {activeTab === 'apps' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-gray-500">{apps.length} app(s) registered</p>
              <Button size="sm" onClick={handleCreateApp}>+ Create App</Button>
            </div>
            <div className="bg-white rounded-xl border divide-y">
              {apps.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No apps registered. Create your first app!</p>
                </div>
              )}
              {apps.map((app: Application) => (
                <div key={app.id} className="p-4 flex justify-between items-center">
                  <div>
                    <h4 className="font-medium">{app.name}</h4>
                    <p className="text-xs text-gray-400 font-mono">{app.id}</p>
                  </div>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Active</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'users' && <UsersDevices apps={apps} token={token} />}
        {activeTab === 'campaigns' && <Campaigns apps={apps} token={token} />}
        {activeTab === 'abtests' && <ABTesting apps={apps} token={token} />}

        {activeTab === 'credentials' && canManageCredentials && (
          <div className="space-y-6">
            {!selectedAppForCredentials ? (
              <div className="space-y-4">
                <p className="text-gray-500">Select an app to manage its push provider credentials:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {apps.length === 0 ? (
                    <div className="col-span-full bg-white rounded-xl border p-6 text-center text-gray-400">
                      <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No apps registered. Create an app first!</p>
                    </div>
                  ) : (
                    apps.map((app: Application) => (
                      <button
                        key={app.id}
                        onClick={() => setSelectedAppForCredentials(app)}
                        className="bg-white rounded-xl border p-6 text-left hover:border-blue-500 hover:shadow-md transition-all"
                      >
                        <h4 className="font-semibold text-lg">{app.name}</h4>
                        <p className="text-xs text-gray-400 font-mono mt-1">{app.id}</p>
                        <p className="text-sm text-blue-600 mt-3 flex items-center gap-1">
                          Manage Credentials →
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={() => setSelectedAppForCredentials(null)}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  ← Back to Apps
                </button>
                <CredentialsPage
                  appId={selectedAppForCredentials.id}
                  appName={selectedAppForCredentials.name}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  )
}

function AuthenticatedApp() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Bell className="w-6 h-6 text-white" />
          </div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <LoginPage />;
  return <AppContent />;
}

export default App
