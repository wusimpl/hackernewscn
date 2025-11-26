import React, { useEffect, useState } from 'react';

interface TranslatingToastProps {
  count: number;
  onClose: () => void;
  duration?: number;
}

export const TranslatingToast: React.FC<TranslatingToastProps> = ({
  count,
  onClose,
  duration = 8000
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    const enterTimer = window.setTimeout(() => setIsVisible(true), 10);
    timers.push(enterTimer);

    const exitTimer = window.setTimeout(() => {
      setIsVisible(false);
      const closeTimer = window.setTimeout(onClose, 300);
      timers.push(closeTimer);
    }, duration);
    timers.push(exitTimer);

    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
    };
  }, [onClose, duration]);

  return (
    <div
      className={`
        fixed bottom-6 left-6 z-[200] max-w-sm w-full sm:w-80
        bg-[#1a1a1a] border border-[#4a9eff] shadow-2xl rounded-sm
        transition-all duration-300 transform
        flex flex-col overflow-hidden
        ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
      `}
    >
      <div className="bg-[#4a9eff] px-3 py-1 flex justify-between items-center">
        <span className="text-black text-xs font-bold uppercase tracking-wider">后台翻译中</span>
        <button
          onClick={onClose}
          className="text-black hover:bg-black/10 rounded px-1 text-xs"
        >
          ✕
        </button>
      </div>
      <div className="p-3">
        <p className="text-[#dcdcdc] text-sm leading-snug">
          发现 <span className="text-[#4a9eff] font-bold">{count}</span> 篇旧文章尚未翻译
        </p>
        <p className="text-[#828282] text-xs mt-2">
          正在后台翻译中，完成后会自动推送通知
        </p>
        <div className="flex items-center text-[#828282] text-xs mt-2">
          <span className="w-2 h-2 rounded-full bg-[#4a9eff] mr-2 animate-pulse"></span>
          翻译进行中...
        </div>
      </div>
      <div className="h-0.5 bg-[#333] w-full">
        <div
          className="h-full bg-[#4a9eff] transition-all"
          style={{ width: '100%', transition: `width ${duration}ms linear`, animationDirection: 'reverse' }}
        />
      </div>
    </div>
  );
};
