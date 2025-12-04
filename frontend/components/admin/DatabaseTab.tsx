import React, { useState, useEffect } from 'react';

interface TableStats {
  name: string;
  rowCount: number;
  sizeMB: number;
}

interface DatabaseStats {
  dbFileSizeMB: number;
  tables: TableStats[];
  totalTables: number;
  totalRows: number;
  totalDataSizeMB: number;
}

interface Props {
  password: string;
  onMessage: (msg: string) => void;
  onError: (err: string) => void;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

// 表名中文映射
const TABLE_NAME_MAP: Record<string, string> = {
  stories: '新闻列表',
  title_translations: '标题翻译',
  article_translations: '文章翻译',
  comments: '评论',
  comment_translations: '评论翻译',
  translation_jobs: '翻译任务',
  settings: '系统设置',
  scheduler_status: '调度状态',
  db_version: '数据库版本',
};

export const DatabaseTab: React.FC<Props> = ({ password, onMessage, onError }) => {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/database/stats`, {
        headers: { Authorization: `Bearer ${password}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.data);
      } else {
        onError('获取数据库统计失败');
      }
    } catch {
      onError('连接失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const formatSize = (sizeMB: number) => {
    if (sizeMB < 0.001) return '< 0.001 MB';
    if (sizeMB < 1) return `${(sizeMB * 1024).toFixed(2)} KB`;
    return `${sizeMB.toFixed(3)} MB`;
  };

  const getTableDisplayName = (name: string) => {
    return TABLE_NAME_MAP[name] || name;
  };

  // 计算进度条宽度
  const getBarWidth = (sizeMB: number, maxSizeMB: number) => {
    if (maxSizeMB === 0) return 0;
    return Math.max(2, (sizeMB / maxSizeMB) * 100);
  };

  const maxTableSize = stats?.tables.reduce((max, t) => Math.max(max, t.sizeMB), 0) || 0;

  return (
    <div>
      <h2 className="text-[#dcdcdc] text-xl font-bold mb-6">数据库监控</h2>

      {/* 总览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#121212] border border-[#333] rounded-lg p-4">
          <div className="text-[#666] text-xs mb-1">数据库文件</div>
          <div className="text-[#ff6600] text-xl font-bold">
            {loading ? '...' : formatSize(stats?.dbFileSizeMB || 0)}
          </div>
        </div>
        <div className="bg-[#121212] border border-[#333] rounded-lg p-4">
          <div className="text-[#666] text-xs mb-1">数据总量</div>
          <div className="text-[#dcdcdc] text-xl font-bold">
            {loading ? '...' : formatSize(stats?.totalDataSizeMB || 0)}
          </div>
        </div>
        <div className="bg-[#121212] border border-[#333] rounded-lg p-4">
          <div className="text-[#666] text-xs mb-1">数据表</div>
          <div className="text-[#dcdcdc] text-xl font-bold">
            {loading ? '...' : stats?.totalTables || 0}
          </div>
        </div>
        <div className="bg-[#121212] border border-[#333] rounded-lg p-4">
          <div className="text-[#666] text-xs mb-1">总记录数</div>
          <div className="text-[#dcdcdc] text-xl font-bold">
            {loading ? '...' : (stats?.totalRows || 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="bg-[#121212] border border-[#333] rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-[#828282] text-sm">各表存储统计（按大小排序）</span>
          <button
            onClick={fetchStats}
            disabled={loading}
            className="bg-[#1a1a1a] text-[#dcdcdc] px-4 py-2 rounded text-sm hover:bg-[#242424] transition-colors border border-[#444] disabled:opacity-50"
          >
            {loading ? '加载中...' : '刷新'}
          </button>
        </div>
      </div>

      {/* 表格列表 */}
      <div className="bg-[#121212] border border-[#333] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[#828282]">加载中...</div>
        ) : !stats || stats.tables.length === 0 ? (
          <div className="p-8 text-center text-[#828282]">暂无数据</div>
        ) : (
          <div className="divide-y divide-[#333]">
            {/* 表头 */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-[#1a1a1a] text-[#666] text-xs font-medium">
              <div className="col-span-4">表名</div>
              <div className="col-span-2 text-right">记录数</div>
              <div className="col-span-2 text-right">估算大小</div>
              <div className="col-span-4">占比</div>
            </div>
            {/* 数据行 */}
            {stats.tables.map((table) => (
              <div
                key={table.name}
                className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-[#1a1a1a] transition-colors items-center"
              >
                <div className="col-span-4">
                  <div className="text-[#dcdcdc] text-sm">{getTableDisplayName(table.name)}</div>
                  <div className="text-[#666] text-xs">{table.name}</div>
                </div>
                <div className="col-span-2 text-right text-[#828282] text-sm">
                  {table.rowCount.toLocaleString()}
                </div>
                <div className="col-span-2 text-right text-[#ff6600] text-sm font-medium">
                  {formatSize(table.sizeMB)}
                </div>
                <div className="col-span-4">
                  <div className="h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#ff6600]/60 rounded-full transition-all"
                      style={{ width: `${getBarWidth(table.sizeMB, maxTableSize)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 说明 */}
      <div className="mt-4 text-[#666] text-xs">
        <p>* 表数据大小为各列实际字节数之和，不含索引和元数据开销</p>
        <p>* 数据库文件大小为实际磁盘占用（含索引、空闲页等）</p>
      </div>
    </div>
  );
};
