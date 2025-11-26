import React, { useEffect, useState } from 'react';

interface NotificationToastProps {
  storyId: number;
  title: string;
  onClick: () => void;
  onClose: () => void;
  duration?: number;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  storyId,
  title,
  onClick,
  onClose,
  duration = 10000
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Small delay to allow enter animation
    const timers: number[] = [];
    const enterTimer = window.setTimeout(() => setIsVisible(true), 10);
    timers.push(enterTimer);

    // Fade out after duration
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
      onClick={onClick}
      className={`
        fixed bottom-6 right-6 z-[200] max-w-sm w-full sm:w-80
        bg-[#1a1a1a] border border-[#ff6600] shadow-2xl rounded-sm
        cursor-pointer transition-all duration-300 transform
        flex flex-col overflow-hidden
        ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
      `}
    >
      <div className="bg-[#ff6600] px-3 py-1 flex justify-between items-center">
        <span className="text-black text-xs font-bold uppercase tracking-wider">收到一篇新文章</span>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="text-black hover:bg-black/10 rounded px-1 text-xs"
        >
          ✕
        </button>
      </div>
      <div className="p-3 hover:bg-[#242424] transition-colors">
        <h4 className="text-[#dcdcdc] text-sm font-medium leading-snug line-clamp-2 mb-1">
          {title}
        </h4>
        <div className="flex items-center text-[#828282] text-xs mt-2">
          <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
          点击立即阅读
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-0.5 bg-[#333] w-full">
        <div
          className="h-full bg-[#ff6600]"
          style={{ width: '100%', transition: `width ${duration}ms linear` }}
        />
      </div>
    </div>
  );
};
