import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/scrape", label: "抓取", icon: "🔍" },
  { to: "/drafts", label: "草稿", icon: "✏️" },
  { to: "/materials", label: "素材", icon: "📁" },
  { to: "/images", label: "图片", icon: "🖼️" },
  { to: "/publish", label: "发布", icon: "📤" },
  { to: "/analytics", label: "数据", icon: "📊" },
  { to: "/settings", label: "设置", icon: "⚙️" },
];

export default function NavBar() {
  return (
    <nav className="flex border-t border-gray-200 bg-white shrink-0">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex flex-col items-center flex-1 py-1.5 text-[10px] transition-colors ${
              isActive ? "text-red-500" : "text-gray-500 hover:text-gray-700"
            }`
          }
        >
          <span className="text-base">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
