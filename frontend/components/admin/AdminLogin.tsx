import React, { useState } from 'react';

interface Props {
  onLogin: (password: string) => Promise<boolean>;
  error: string;
}

export const AdminLogin: React.FC<Props> = ({ onLogin, error }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || loading) return;
    setLoading(true);
    await onLogin(password);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-[#121212] border border-[#333] rounded-lg p-8">
          <div className="text-center mb-6">
            <h1 className="text-[#ff6600] text-2xl font-bold">Hacker News CN</h1>
            <p className="text-[#666] text-sm mt-2">管理面板</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-[#828282] text-xs mb-2">管理密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                className="w-full bg-[#1a1a1a] text-[#dcdcdc] border border-[#444] rounded px-4 py-3 focus:outline-none focus:border-[#ff6600] transition-colors"
                autoFocus
                disabled={loading}
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm mb-4 text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !password.trim()}
              className="w-full bg-[#ff6600] text-black py-3 rounded font-bold hover:bg-[#ff8533] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '验证中...' : '登录'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
