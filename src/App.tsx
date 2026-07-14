import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AppProvider } from "./context/AppContext";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider, useThemeContext } from "./context/ThemeContext";
import { HelpDialog } from "./components/HelpDialog";
import { CloseActionGuard } from "./components/CloseActionGuard";
import { AuthGate } from "./components/AuthGate";
import { Layout } from "./components/Layout";
import { Dashboard } from "./views/Dashboard";
import { MySkills } from "./views/MySkills";
import { WorkspaceView } from "./views/WorkspaceView";
import { CODING_WORKSPACE_CONFIG, LOBSTER_WORKSPACE_CONFIG } from "./views/workspaceConfigs";
import { InstallSkillsLayout } from "./views/install/InstallSkillsLayout";
import { MarketTab } from "./views/install/MarketTab";
import { LocalInstallTab } from "./views/install/LocalInstallTab";
import { GitInstallTab } from "./views/install/GitInstallTab";
import { ServerInstallTab } from "./views/install/ServerInstallTab";
import { Settings } from "./views/Settings";
import { ProjectDetail } from "./views/ProjectDetail";
import { Login } from "./views/Login";
import { AdminPanel } from "./views/AdminPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";

function ThemedToaster() {
  const { resolvedTheme } = useThemeContext();
  return (
    <Toaster
      theme={resolvedTheme}
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-primary)",
        },
      }}
    />
  );
}

function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
      <AppProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<AuthGate />}>
                <Route element={<Layout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/my-skills" element={<MySkills />} />
                  <Route path="/global-workspace" element={<WorkspaceView config={CODING_WORKSPACE_CONFIG} />} />
                  <Route path="/global-workspace/:agentKey" element={<WorkspaceView config={CODING_WORKSPACE_CONFIG} />} />
                  <Route path="/lobster-workspace" element={<WorkspaceView config={LOBSTER_WORKSPACE_CONFIG} />} />
                  <Route path="/lobster-workspace/:agentKey" element={<WorkspaceView config={LOBSTER_WORKSPACE_CONFIG} />} />
                  <Route path="/install" element={<InstallSkillsLayout />}>
                    <Route index element={<Navigate to="market" replace />} />
                    <Route path="market" element={<MarketTab />} />
                    <Route path="local" element={<LocalInstallTab />} />
                    <Route path="git" element={<GitInstallTab />} />
                    <Route path="server" element={<ServerInstallTab />} />
                  </Route>
                  <Route path="/project/:id" element={<ProjectDetail />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/admin" element={<AdminPanel />} />
                </Route>
              </Route>
            </Routes>
            <HelpDialog />
            <CloseActionGuard />
          </BrowserRouter>
          <ThemedToaster />
        </AuthProvider>
      </AppProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
