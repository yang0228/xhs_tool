export default function Analytics() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">数据分析</h2>
      <p className="text-sm text-gray-500">查看文章数据与趋势，方便复盘与策略调整</p>

      <div className="grid grid-cols-2 gap-3">
        {["阅读", "点赞", "评论", "收藏"].map((label) => (
          <div key={label} className="p-4 bg-white rounded-lg border border-gray-200 text-center">
            <p className="text-2xl font-bold text-gray-300">-</p>
            <p className="text-xs text-gray-400 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="text-center py-6 text-gray-400">
        <p className="text-sm">发布内容后数据将显示在此处</p>
      </div>
    </div>
  );
}
