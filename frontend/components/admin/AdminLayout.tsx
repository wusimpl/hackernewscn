import React, { useState, useEffect } from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminLogin } from './AdminLogin';
import { DashboardTab } from './DashboardTab';
import { SettingsTab } from './SettingsTab';
import { LLMProvidersTab } from './LLMProvidersTab';
import { PromptTab } from './PromptTab';
import { CacheTab } from './CacheTab';

export type AdminTab = 'dashboard' | 'settings' | 'llm-providers' | 'prompt' | 'cache';

interface SchedulerStatus {
  isRunning: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  storiesFetched: number;
  titlesTranslated: number;
}

interface SchedulerConfig {
  interval: number;
  storyLimit: number;
  maxCommentTranslations: number;
  defaults: {
    interval: number;
    storyLimit: number;
    maxCommentTranslations: number;
  };
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export const AdminLayout: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [config, setConfig] = useState<SchedulerConfig | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const savedToken = sessionStorage.getItem('adminToken');
    if (savedToken) {
      setPassword(savedToken);
      verifyToken(savedToken);
    }
  }, []);

  const verifyToken = async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.data);
        setIsAuthenticated(true);
        sessionStorage.setItem('adminToken', token);
        fetchConfig(token);
      } else {
        sessionStorage.removeItem('adminToken');
      }
    } catch {
      // ignore
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/status`, {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.data);
      }
    } catch {
      // ignore
    }
  };

  const fetchConfig = async (token: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/scheduler-config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.data);
      }
    } catch {
      // ignore
    }
  };

  const handleLogin = async (pwd: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/status`, {
        headers: { Authorization: `Bearer ${pwd}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.data);
        setPassword(pwd);
        setIsAuthenticated(true);
        sessionStorage.setItem('adminToken', pwd);
        setError('');
        fetchConfig(pwd);
        return true;
      } else {
        setError('密码错误');
        return false;
      }
    } catch {
      setError('连接失败');
      return false;
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPassword('');
    setStatus(null);
    setConfig(null);
    sessionStorage.removeItem('adminToken');
  };

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 4000);
  };

  const showError = (err: string) => {
    setError(err);
    setTimeout(() => setError(''), 4000);
  };

  if (!isAuthenticated) {
    return <AdminLogin onLogin={handleLogin} error={error} />;
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <DashboardTab
            status={status}
            password={password}
            onRefresh={fetchStatus}
            onMessage={showMessage}
            onError={showError}
          />
        );
      case 'settings':
        return (
          <SettingsTab
            config={config}
            password={password}
            onConfigUpdate={() => fetchConfig(password)}
            onStatusRefresh={fetchStatus}
            onMessage={showMessage}
            onError={showError}
          />
        );
      case 'llm-providers':
        return (
          <LLMProvidersTab
            password={password}
            onMessage={showMessage}
            onError={showError}
          />
        );
      case 'prompt':
        return (
          <PromptTab
            password={password}
            onMessage={showMessage}
            onError={showError}
          />
        );
      case 'cache':
        return (
          <CacheTab
            onMessage={showMessage}
            onError={showError}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex">
      {/* Sidebar / Mobile Tabs */}
      <AdminSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLogout={handleLogout}
        isMobile={isMobile}
      />

      {/* Main Content */}
      <main className={`flex-1 ${isMobile ? 'pt-14' : 'ml-56'} p-6`}>
        {/* Toast Messages */}
        {(message || error) && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded text-sm ${
            error ? 'bg-red-900/90 text-red-200' : 'bg-green-900/90 text-green-200'
          }`}>
            {error || message}
          </div>
        )}

        <div className="max-w-4xl mx-auto">
          {renderTab()}
        </div>
      </main>
    </div>
  );
};
