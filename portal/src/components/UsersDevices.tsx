import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Users, Smartphone, Search, ChevronLeft, ChevronRight, Trash2, XCircle, RefreshCw, UploadCloud } from 'lucide-react';
import { clsx } from 'clsx';
import { AudienceManager } from './AudienceManager';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface User {
  id: string;
  externalUserId: string;
  appId: string;
  language: string;
  timezone: string;
  createdAt: string;
  app: { id: string; name: string };
  _count: { devices: number };
  devices?: Device[];
}

interface Device {
  id: string;
  userId: string;
  platform: string;
  pushToken: string;
  provider: string;
  isActive: boolean;
  lastSeenAt: string;
  createdAt: string;
  user?: {
    id: string;
    externalUserId: string;
    app: { id: string; name: string };
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface UsersDevicesProps {
  apps: any[];
  token: string | null;
}

export function UsersDevices({ apps, token }: UsersDevicesProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'devices' | 'import'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [usersPagination, setUsersPagination] = useState<Pagination | null>(null);
  const [devicesPagination, setDevicesPagination] = useState<Pagination | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAppId, setFilterAppId] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterProvider, setFilterProvider] = useState('');
  const [filterActive, setFilterActive] = useState('');

  const authApiCall = async (endpoint: string, options: RequestInit = {}) => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    };
    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error?.message || error.error || 'Request failed');
    }
    return response.json();
  };

  const fetchUsers = async (page = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (searchQuery) params.append('search', searchQuery);
      if (filterAppId) params.append('appId', filterAppId);

      const data = await authApiCall(`/users?${params}`);
      setUsers(data.users);
      setUsersPagination(data.pagination);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDevices = async (page = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (filterPlatform) params.append('platform', filterPlatform);
      if (filterProvider) params.append('provider', filterProvider);
      if (filterActive) params.append('isActive', filterActive);
      if (selectedUser) params.append('userId', selectedUser.id);

      const data = await authApiCall(`/devices?${params}`);
      setDevices(data.devices);
      setDevicesPagination(data.pagination);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserDetails = async (userId: string) => {
    setIsLoading(true);
    try {
      const user = await authApiCall(`/users/${userId}`);
      setSelectedUser(user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const deactivateDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to deactivate this device?')) return;
    try {
      await authApiCall(`/devices/${deviceId}/deactivate`, { method: 'PATCH' });
      // Refresh devices
      if (selectedUser) {
        fetchUserDetails(selectedUser.id);
      } else {
        fetchDevices(devicesPagination?.page || 1);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? All their devices will be deactivated.')) return;
    try {
      await authApiCall(`/users/${userId}`, { method: 'DELETE' });
      setSelectedUser(null);
      fetchUsers(usersPagination?.page || 1);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  useEffect(() => {
    if (activeTab === 'users' && !selectedUser) {
      fetchUsers();
    } else if (activeTab === 'devices') {
      fetchDevices();
    }
  }, [activeTab, filterAppId, filterPlatform, filterProvider, filterActive]);

  useEffect(() => {
    if (searchQuery === '' && activeTab === 'users') {
      fetchUsers();
    }
  }, [searchQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'users') {
      fetchUsers();
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'android': return '🤖';
      case 'ios': return '🍎';
      case 'web': return '🌐';
      case 'huawei': return '📱';
      default: return '📱';
    }
  };

  const getProviderBadge = (provider: string) => {
    const colors: Record<string, string> = {
      fcm: 'bg-orange-100 text-orange-700',
      apns: 'bg-blue-100 text-blue-700',
      hms: 'bg-red-100 text-red-700',
      web: 'bg-purple-100 text-purple-700',
    };
    return colors[provider.toLowerCase()] || 'bg-gray-100 text-gray-700';
  };

  // User Details View
  if (selectedUser) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedUser(null)}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Users
        </button>

        <div className="bg-white rounded-xl border p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-xl font-semibold">{selectedUser.externalUserId}</h3>
              <p className="text-sm text-gray-500 mt-1">
                App: <span className="font-medium">{selectedUser.app.name}</span>
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:bg-red-50"
              onClick={() => deleteUser(selectedUser.id)}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete User
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
            <div>
              <p className="text-gray-500">Language</p>
              <p className="font-medium">{selectedUser.language}</p>
            </div>
            <div>
              <p className="text-gray-500">Timezone</p>
              <p className="font-medium">{selectedUser.timezone}</p>
            </div>
            <div>
              <p className="text-gray-500">Devices</p>
              <p className="font-medium">{selectedUser.devices?.length || 0}</p>
            </div>
            <div>
              <p className="text-gray-500">Created</p>
              <p className="font-medium">{formatDate(selectedUser.createdAt)}</p>
            </div>
          </div>

          <h4 className="font-semibold mb-4">Registered Devices</h4>
          {selectedUser.devices && selectedUser.devices.length > 0 ? (
            <div className="space-y-3">
              {selectedUser.devices.map(device => (
                <div
                  key={device.id}
                  className={clsx(
                    "p-4 rounded-lg border flex justify-between items-center",
                    device.isActive ? "bg-white" : "bg-gray-50 opacity-60"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{getPlatformIcon(device.platform)}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{device.platform}</span>
                        <span className={clsx("text-xs px-2 py-0.5 rounded-full", getProviderBadge(device.provider))}>
                          {device.provider.toUpperCase()}
                        </span>
                        {device.isActive ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 font-mono mt-1 truncate max-w-md">
                        {device.pushToken.slice(0, 50)}...
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Last seen: {formatDate(device.lastSeenAt)}
                      </p>
                    </div>
                  </div>
                  {device.isActive && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deactivateDevice(device.id)}
                    >
                      <XCircle className="w-4 h-4 mr-1" /> Deactivate
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-8">No devices registered</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('users')}
          className={clsx(
            "px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors",
            activeTab === 'users'
              ? "bg-blue-600 text-white"
              : "bg-white border text-gray-600 hover:bg-gray-50"
          )}
        >
          <Users className="w-4 h-4" /> Users
        </button>
        <button
          onClick={() => setActiveTab('devices')}
          className={clsx(
            "px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors",
            activeTab === 'devices'
              ? "bg-blue-600 text-white"
              : "bg-white border text-gray-600 hover:bg-gray-50"
          )}
        >
          <Smartphone className="w-4 h-4" /> Devices
        </button>
        <button
          onClick={() => setActiveTab('import')}
          className={clsx(
            "px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors",
            activeTab === 'import'
              ? "bg-purple-600 text-white"
              : "bg-white border text-gray-600 hover:bg-gray-50"
          )}
        >
          <UploadCloud className="w-4 h-4" /> Import Audience
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-wrap gap-4">
          {activeTab === 'users' && (
            <>
              <form onSubmit={handleSearch} className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search by user ID..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
                  />
                </div>
              </form>
              <select
                value={filterAppId}
                onChange={e => setFilterAppId(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm bg-white min-w-[150px]"
              >
                <option value="">All Apps</option>
                {apps.map(app => (
                  <option key={app.id} value={app.id}>{app.name}</option>
                ))}
              </select>
            </>
          )}
          {activeTab === 'devices' && (
            <>
              <select
                value={filterPlatform}
                onChange={e => setFilterPlatform(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm bg-white min-w-[120px]"
              >
                <option value="">All Platforms</option>
                <option value="android">Android</option>
                <option value="ios">iOS</option>
                <option value="web">Web</option>
                <option value="huawei">Huawei</option>
              </select>
              <select
                value={filterProvider}
                onChange={e => setFilterProvider(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm bg-white min-w-[120px]"
              >
                <option value="">All Providers</option>
                <option value="fcm">FCM</option>
                <option value="apns">APNS</option>
                <option value="hms">HMS</option>
                <option value="web">Web Push</option>
              </select>
              <select
                value={filterActive}
                onChange={e => setFilterActive(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm bg-white min-w-[120px]"
              >
                <option value="">All Status</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => activeTab === 'users' ? fetchUsers() : fetchDevices()}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Users List */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No users found</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">User ID</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">App</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Language</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Devices</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map(user => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium">{user.externalUserId}</span>
                        <p className="text-xs text-gray-400 font-mono">{user.id}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{user.app.name}</td>
                      <td className="px-4 py-3 text-gray-600">{user.language}</td>
                      <td className="px-4 py-3">
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">
                          {user._count.devices} device(s)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fetchUserDetails(user.id)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {usersPagination && usersPagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
                  <p className="text-sm text-gray-500">
                    Showing {(usersPagination.page - 1) * usersPagination.limit + 1} to{' '}
                    {Math.min(usersPagination.page * usersPagination.limit, usersPagination.total)} of{' '}
                    {usersPagination.total} users
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchUsers(usersPagination.page - 1)}
                      disabled={usersPagination.page <= 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchUsers(usersPagination.page + 1)}
                      disabled={usersPagination.page >= usersPagination.totalPages}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Devices List */}
      {activeTab === 'devices' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : devices.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Smartphone className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No devices found</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Platform</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Provider</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Last Seen</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {devices.map(device => (
                    <tr key={device.id} className={clsx("hover:bg-gray-50", !device.isActive && "opacity-60")}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{getPlatformIcon(device.platform)}</span>
                          <span className="capitalize">{device.platform}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx("text-xs px-2 py-0.5 rounded-full", getProviderBadge(device.provider))}>
                          {device.provider.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {device.user && (
                          <div>
                            <p className="font-medium">{device.user.externalUserId}</p>
                            <p className="text-xs text-gray-400">{device.user.app.name}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {device.isActive ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Inactive</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(device.lastSeenAt)}</td>
                      <td className="px-4 py-3">
                        {device.isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deactivateDevice(device.id)}
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {devicesPagination && devicesPagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
                  <p className="text-sm text-gray-500">
                    Showing {(devicesPagination.page - 1) * devicesPagination.limit + 1} to{' '}
                    {Math.min(devicesPagination.page * devicesPagination.limit, devicesPagination.total)} of{' '}
                    {devicesPagination.total} devices
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchDevices(devicesPagination.page - 1)}
                      disabled={devicesPagination.page <= 1}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchDevices(devicesPagination.page + 1)}
                      disabled={devicesPagination.page >= devicesPagination.totalPages}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {/* Import Audience */}
      {activeTab === 'import' && (
        <div className="space-y-6">
          {!filterAppId ? (
            <div className="bg-white rounded-xl border p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto">
                <UploadCloud className="w-8 h-8 text-purple-600" />
              </div>
              <div>
                <h4 className="font-bold text-lg">Target App Required</h4>
                <p className="text-sm text-gray-500 max-w-xs mx-auto">Please select an application from the filters above to specify which app the audience belongs to.</p>
              </div>
              <div className="flex justify-center pt-2">
                <select
                  value={filterAppId}
                  onChange={e => setFilterAppId(e.target.value)}
                  className="px-4 py-2 border rounded-xl text-sm bg-white min-w-[200px] shadow-sm"
                >
                  <option value="">Select Target App...</option>
                  {apps.map(app => (
                    <option key={app.id} value={app.id}>{app.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <AudienceManager appId={filterAppId} />
          )}
        </div>
      )}
    </div>
  );
}
