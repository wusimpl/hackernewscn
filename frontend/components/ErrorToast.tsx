import React, { useEffect, useState } from 'react';

interface ErrorToastProps {
  title: string;
  errorCode?: number;
  errorMessage: string;
  onClose: () => void;
  duration?: number;
}

export const ErrorToast: React.FC<ErrorToastProps> = ({
  title,
  errorCode,
  errorMessage,
  onClose,
  duration = 15000
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const toastRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 入场动画
    const enterTimer = setTimeout(() => setIsVisible(true), 10);

    // 进度条动画
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
    }, 50);

    // 自动关闭
    const exitTimer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearInterval(progressInterval);
    };
  }, [onClose, duration]);

  return (
    <div
      ref={toastRef}
      className={`
        fixed bottom-6 right-6 z-[200] max-w-sm w-full sm:w-80
        bg-[#1a1a1a] border border-red-600 shadow-2xl rounded-sm
        transition-all duration-300 transform
        flex flex-col overflow-hidden
        ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}
      `}
    >
      <div className="bg-red-600 px-3 py-1 flex justify-between items-center">
        <span className="text-white text-xs font-bold uppercase tracking-wider">
          {errorCode ? `错误 ${errorCode}` : '获取失败'}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="text-white hover:bg-white/10 rounded px-1 text-xs"
        >
          ✕
        </button>
      </div>
      <div className="p-3">
        <h4 className="text-[#dcdcdc] text-sm font-medium leading-snug line-clamp-2 mb-2">
          {title}
        </h4>
        <p className="text-[#828282] text-xs leading-relaxed mb-2">
          {errorMessage}
        </p>
        <div className="flex items-center text-[#828282] text-xs">
          <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span>
          内容暂时无法访问
        </div>
      </div>
      {/* 进度条 */}
      <div className="h-0.5 bg-[#333] w-full">
        <div
          className="h-full bg-red-600 transition-all duration-50 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
