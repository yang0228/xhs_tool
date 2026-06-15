import { NavLink, useLocation } from "react-router-dom";
import { Icon } from "./UI";
const tabs = [
  { to: "/scrape", label: "采集", icon: "collect" },
  { to: "/materials", label: "素材库", icon: "library" },
  { to: "/drafts", label: "创作", icon: "edit" },
  { to: "/publish", label: "发布", icon: "publish" },
];
export default function NavBar() {
  const { pathname } = useLocation();
  return (
    <nav className="bottom-nav" aria-label="主要导航">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            "nav-item " +
            (isActive ||
            (tab.to === "/materials" && pathname === "/images") ||
            (tab.to === "/publish" && pathname === "/analytics")
              ? "active"
              : "")
          }
        >
          <Icon name={tab.icon} />
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
