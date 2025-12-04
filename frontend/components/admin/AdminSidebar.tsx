import React from 'react';
import { AdminTab } from './AdminLayout';

interface Props {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onLogout: () => void;
  isMobile: boolean;
}

const tabs: { id: AdminTab; icon: string; label: string }[] = [
  { id: 'dashboard', icon: '📊', label: '概览' },
  { id: 'settings', icon: '⚙️', label: '调度配置' },
  { id: 'llm-providers', icon: '🤖', label: '大模型配置' },
  { id: 'prompt', icon: '📝', label: '提示词' },
  { id: 'cache', icon: '💾', label: '缓存管理' },
  { id: 'database', icon: '🗄️', label: '数据库监控' },
];

export const AdminSidebar: React.FC<Props> = ({ activeTab, onTabChange, onLogout, isMobile }) => {
  if (isMobile) {
    return (
      <nav className="fixed top-0 left-0 right-0 z-40 bg-[#121212] border-b border-[#333]">
        <div className="flex items-center justify-between px-4 h-14">
          <span className="text-[#ff6600] font-bold text-sm">HN Admin</span>
          <div className="flex items-center gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-3 py-1.5 text-xs rounded transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[#ff6600] text-black'
                    : 'text-[#828282] hover:text-[#dcdcdc]'
                }`}
              >
                {tab.icon}
              </button>
            ))}
            <button
              onClick={onLogout}
              className="ml-2 text-[#828282] hover:text-red-400 text-xs"
            >
              退出
            </button>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-56 bg-[#121212] border-r border-[#333] flex flex-col">
      {/* Logo */}
      <div className="p-5 border-b border-[#333]">
        <h1 className="text-[#ff6600] font-bold text-lg">Hacker News CN</h1>
        <p className="text-[#666] text-xs mt-1">Admin Panel</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-all ${
              activeTab === tab.id
                ? 'bg-[#ff6600]/10 text-[#ff6600] border border-[#ff6600]/30'
                : 'text-[#828282] hover:bg-[#1a1a1a] hover:text-[#dcdcdc] border border-transparent'
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="text-sm font-medium">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-[#333]">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-[#828282] hover:bg-red-900/20 hover:text-red-400 transition-colors"
        >
          <span className="text-lg">🚪</span>
          <span className="text-sm font-medium">退出登录</span>
        </button>
      </div>
    </aside>
  );
};
