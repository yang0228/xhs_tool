import { useEffect, useState } from "react";

export default function Settings() {
  const [backendUrl, setBackendUrl] = useState("http://localhost:8000/api");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    chrome.storage.local.get(["settings"], (result) => {
      if (result.settings) {
        setBackendUrl(result.settings.backendUrl || backendUrl);
        setApiKey(result.settings.apiKey || "");
      }
    });
  }, []);

  const saveSettings = (key: string, url: string) => {
    chrome.storage.local.set({ settings: { backendUrl: url, apiKey: key } });
  };

  const handleSave = () => {
    saveSettings(apiKey, backendUrl);
    setStatus("已保存");
    setTimeout(() => setStatus(""), 2000);
  };

  const handleRegister = async () => {
    try {
      const res = await fetch(backendUrl + "/auth/register", { method: "POST" });
      const data = await res.json();
      const newKey = data.api_key;
      setApiKey(newKey);
      saveSettings(newKey, backendUrl);
      setStatus("已生成并保存新 API Key");
      setTimeout(() => setStatus(""), 3000);
    } catch {
      setStatus("注册失败，请检查后端地址和网络");
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">设置</h2>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 font-medium">后端地址</label>
          <input type="text" value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)}
            className="w-full px-3 py-2 mt-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-300" />
        </div>
        <div>
          <label className="text-xs text-gray-500 font-medium">API Key</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="点击下方按钮自动生成"
            className="w-full px-3 py-2 mt-1 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-300" />
        </div>
        <div className="flex gap-2">
          <button onClick={handleRegister}
            className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors">
            注册新 Key
          </button>
          <button onClick={handleSave}
            className="px-3 py-1.5 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 transition-colors">
            保存设置
          </button>
        </div>
        {status && <p className="text-xs text-green-600">{status}</p>}
      </div>
      <div className="pt-4 border-t border-gray-200">
        <h3 className="text-sm font-semibold mb-2">关于</h3>
        <p className="text-xs text-gray-400">XHS Tool v0.1.0</p>
        <p className="text-xs text-gray-400">隐私优先 · 客户端加密 · DeepSeek AI 驱动</p>
      </div>
    </div>
  );
}
