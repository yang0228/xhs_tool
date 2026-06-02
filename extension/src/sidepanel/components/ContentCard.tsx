import { formatDate, truncateText } from "../lib/utils";

interface ContentCardProps {
  title: string;
  preview: string;
  url?: string | null;
  tags?: string[];
  date: string;
  onClick?: () => void;
  onDelete?: () => void;
}

export default function ContentCard({ title, preview, url, tags, date, onClick, onDelete }: ContentCardProps) {
  return (
    <div
      className="p-3 bg-white rounded-lg border border-gray-200 hover:border-red-200 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <h3 className="text-sm font-medium text-gray-800 flex-1 mr-2">{truncateText(title, 40)}</h3>
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-gray-300 hover:text-red-500 text-xs shrink-0"
          >
            ✕
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{preview}</p>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-gray-400">{formatDate(date)}</span>
        {url && <span className="text-[10px] text-blue-400 truncate max-w-[120px]">{new URL(url).hostname}</span>}
      </div>
      {tags && tags.length > 0 && (
        <div className="flex gap-1 mt-2">
          {tags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-[10px] text-gray-500 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
