import { Link, Outlet } from "react-router-dom";
import NavBar from "./NavBar";
import { Icon, ToastViewport } from "./UI";
export default function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" to="/scrape">
          <span className="brand-mark">小</span>
          <span>
            XHS Tool<small>个人创作空间</small>
          </span>
        </Link>
        <div className="row">
          <a
            className="icon-button"
            href={
              typeof chrome.runtime.getURL === "function"
                ? chrome.runtime.getURL("src/sidepanel/index.html")
                : "#"
            }
            target="_blank"
            rel="noreferrer"
            title="在独立标签页打开"
            aria-label="在独立标签页打开"
          >
            <Icon name="expand" size={17} />
          </a>
          <Link
            className="icon-button"
            to="/settings"
            aria-label="设置"
            title="设置"
          >
            <Icon name="settings" size={19} />
          </Link>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <NavBar />
      <ToastViewport />
    </div>
  );
}
