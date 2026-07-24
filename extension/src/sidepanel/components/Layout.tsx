import { Outlet } from "react-router-dom";
import NavBar from "./NavBar";
import { ToastViewport } from "./UI";
export default function Layout() {
  return (
    <div className="app-shell">
      <main className="app-main">
        <Outlet />
      </main>
      <NavBar />
      <ToastViewport />
    </div>
  );
}
