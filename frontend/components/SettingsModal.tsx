import React, { useState, useEffect } from 'react';
import { DEFAULT_PROMPT } from '../services/llmService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPrompt: string;
  onSave: (newPrompt: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentPrompt, onSave }) => {
  const [text, setText] = useState(currentPrompt);

  // Sync state when prop changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setText(currentPrompt);
    }
  }, [isOpen, currentPrompt]);

  if (!isOpen) return null;

  const handleReset = () => {
    if (window.confirm('确定恢复为默认提示词?')) {
      setText(DEFAULT_PROMPT);
    }
  };

  const handleSave = () => {
    onSave(text);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#1a1a1a] border border-[#ff6600] w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#ff6600] text-black px-2 py-1 flex justify-between items-center">
          <span className="font-bold">翻译设置</span>
          <button onClick={onClose} className="hover:bg-black/20 px-2 font-mono">✕</button>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col gap-4 overflow-y-auto">
          <div>
            <label className="block text-[#dcdcdc] text-sm mb-2 font-bold">
              系统提示词
            </label>
            <p className="text-[#828282] text-xs mb-2">
              自定义大模型翻译标题的方式。
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full h-64 bg-[#242424] text-[#dcdcdc] border border-[#444] p-2 font-mono text-sm focus:outline-none focus:border-[#ff6600]"
              spellCheck={false}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-2 border-t border-[#333]">
            <button
              onClick={handleReset}
              className="text-[#828282] text-sm hover:text-[#dcdcdc] underline"
            >
              恢复默认
            </button>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="text-[#dcdcdc] text-sm hover:underline px-3 py-1"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="bg-[#ff6600] text-black text-sm font-bold px-4 py-1 hover:bg-[#ff8533]"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};