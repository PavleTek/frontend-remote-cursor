import { NavLink, Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="shell">
      <div className="shell-content">
        <Outlet />
      </div>
      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/" className="nav-item" end>
          Chats
        </NavLink>
        <NavLink to="/workspaces" className="nav-item">
          Projects
        </NavLink>
        <NavLink to="/chat" className="nav-item">
          New Chat
        </NavLink>
        <NavLink to="/settings" className="nav-item">
          Settings
        </NavLink>
      </nav>
    </div>
  );
}
