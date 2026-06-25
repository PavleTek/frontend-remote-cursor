import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Chat from "./pages/Chat.jsx";
import Chats from "./pages/Chats.jsx";
import Connect from "./pages/Connect.jsx";
import Settings from "./pages/Settings.jsx";
import Workspaces from "./pages/Workspaces.jsx";
import "./styles/app.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/connect" element={<Connect />} />
        <Route element={<Layout />}>
          <Route index element={<Chats />} />
          <Route path="workspaces" element={<Workspaces />} />
          <Route path="chat" element={<Chat />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
