import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/compat';
import { LocationProvider, ErrorBoundary, Router, Route } from 'preact-iso';
import AppLayout from './components/AppLayout';
import DashboardPage from './pages/DashboardPage';
import ServersPage from './pages/ServersPage';
import SettingsPage from './pages/SettingsPage';
import CreateServerModal from './components/CreateServerModal';
import EditServerModal from './components/EditServerModal';
import ServerDrawer from './components/ServerDrawer';
import LogsModal from './components/LogsModal';
import SftpCredentialsModal from './components/SftpCredentialsModal';
import NotificationContainer from './components/NotificationContainer';
import * as gameStore from './signals/game-server-store';
import * as repoStore from './signals/template-repository-store';

export default function App() {
    const sidebarOpen = useSignal(false);
    const showModal = useSignal(false);

    // One-time app initialization: dark mode and store loading. Routing is
    // owned by preact-iso's <Router> (via the History API), so this effect no
    // longer wires up any navigation listeners — it just bootstraps the parts
    // of the SPA that should live for the app's entire lifetime.
    useEffect(() => {
        // Load settings (dark mode)
        const dark = localStorage.getItem('darkMode') === 'true';
        if (dark) document.documentElement.classList.add('dark');

        // Initialize stores once for the whole app lifecycle. Each store also
        // has an idempotency guard so a re-render never re-fetches or reopens
        // the watch WebSocket.
        gameStore.init();
        repoStore.init();

        return () => {
            gameStore.disconnectWatchSocket();
        };
    }, []);

    return (
        <LocationProvider>
            <ErrorBoundary>
                <AppLayout sidebarOpen={sidebarOpen}>
                    <Router>
                        {/* The dashboard is the landing page: served at `/`,
                            `/dashboard`, and the legacy `/home` alias. Using
                            `<Route>` (rather than `<Page path=.../>` directly)
                            keeps TypeScript happy since preact-iso's global
                            `path`/`default` attribute augmentation only covers
                            the older JSX API, not the `jsxImportSource: preact`
                            runtime this project uses. */}
                        <Route path="/" component={DashboardPage} showModal={showModal} />
                        <Route path="/dashboard" component={DashboardPage} showModal={showModal} />
                        <Route path="/home" component={DashboardPage} showModal={showModal} />
                        <Route path="/servers" component={ServersPage} showModal={showModal} />
                        <Route path="/settings" component={SettingsPage} />
                        {/* Unknown paths fall back to the dashboard. */}
                        <Route default component={DashboardPage} showModal={showModal} />
                    </Router>
                </AppLayout>
                <CreateServerModal showModal={showModal} />
                <EditServerModal />
                <ServerDrawer />
                <LogsModal />
                <SftpCredentialsModal />
                <NotificationContainer />
            </ErrorBoundary>
        </LocationProvider>
    );
}