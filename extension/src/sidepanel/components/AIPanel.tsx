interface AIPanelProps {
  onAction: (action: string) => void;
  loading?: boolean;
}

const actions = [
  { key: "summarize", label: "AI 摘要", icon: "📝" },
  { key: "keypoints", label: "要点提炼", icon: "🔑" },
  { key: "titles", label: "生成标题", icon: "💡" },
  { key: "rewrite", label: "改写", icon: "🔄" },
  { key: "polish", label: "润色", icon: "✨" },
  { key: "expand", label: "扩写", icon: "📈" },
];

export default function AIPanel({ onAction, loading }: AIPanelProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400 font-medium">AI 工具</p>
      <div className="flex flex-wrap gap-1.5">
        {actions.map((action) => (
          <button
            key={action.key}
            onClick={() => onAction(action.key)}
            disabled={loading}
            className="px-2.5 py-1.5 bg-blue-50 text-blue-600 text-xs rounded-full hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            {action.icon} {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
