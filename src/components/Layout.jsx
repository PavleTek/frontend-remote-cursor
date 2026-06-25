import { useState, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { getBackendUrl, getChats } from "../api/client.js";

function truncateTitle(title) {
  if (!title) return "Chat";
  const limit = 10;
  return title.length > limit ? title.slice(0, limit) + "…" : title;
}

export default function Layout() {
  const [lastChat, setLastChat] = useState(null);
  const location = useLocation();

  useEffect(() => {
    async function fetchLastChat() {
      if (!getBackendUrl()) return;
      try {
        const stored = localStorage.getItem("remote-cursor-last-chat");
        if (stored) {
          setLastChat(JSON.parse(stored));
          return;
        }

        // If not in localStorage, fetch from backend
        const result = await getChats();
        const list = Array.isArray(result.data?.chats) ? result.data.chats : [];
        if (list.length > 0) {
          const mostRecent = list[0];
          const lastChatInfo = {
            id: mostRecent.id,
            workspaceSlug: mostRecent.workspaceSlug || "",
            title: mostRecent.title || "Active Chat",
          };
          setLastChat(lastChatInfo);
          localStorage.setItem("remote-cursor-last-chat", JSON.stringify(lastChatInfo));
        }
      } catch (e) {
        console.error("Failed to fetch last active chat:", e);
      }
    }
    fetchLastChat();
  }, [location]);

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
        {lastChat ? (
          <NavLink
            to={`/chat?id=${encodeURIComponent(lastChat.id)}${lastChat.workspaceSlug ? `&workspace=${encodeURIComponent(lastChat.workspaceSlug)}` : ""}`}
            className="nav-item"
          >
            {truncateTitle(lastChat.title)}
          </NavLink>
        ) : (
          <span className="nav-item disabled" style={{ opacity: 0.5, cursor: "not-allowed" }}>
            No Chat
          </span>
        )}
        <NavLink to="/settings" className="nav-item">
          Settings
        </NavLink>
      </nav>
    </div>
  );
}
