import { Outlet } from "react-router-dom";
import NavBar from "./NavBar";

export default function Layout() {
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <h1 className="text-lg font-bold text-red-500">XHS Tool</h1>
      </header>
      <main className="flex-1 overflow-y-auto p-4">
        <Outlet />
      </main>
      <NavBar />
    </div>
  );
}
