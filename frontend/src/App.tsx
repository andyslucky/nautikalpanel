import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/compat';
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
    const page = useSignal<'dashboard' | 'servers' | 'settings'>('dashboard');
    const sidebarOpen = useSignal(false);
    const showModal = useSignal(false);

    // One-time app initialization: hash routing, dark mode, and store loading.
    // This effect has empty deps so it runs only on mount — navigating between
    // pages (which updates `page.value` and re-renders this component) must NOT
    // re-fetch game servers / template repositories or tear down the watch
    // WebSocket. Those are SPA-global concerns and should live for the app's
    // lifetime.
    useEffect(() => {
        function updatePageFromHash() {
            const hash = window.location.hash.toLowerCase().replace('#', '') as
                | 'dashboard' | 'servers' | 'settings' | 'home';
            // Treat a stale #home link the same as a direct dashboard land (legacy)
            if (hash === 'home') {
                window.location.replace('#dashboard');
                page.value = 'dashboard';
                return;
            }
            page.value = (['dashboard', 'servers', 'settings'] as const).includes(hash as any)
                ? (hash as 'dashboard' | 'servers' | 'settings')
                : 'dashboard';
        }

        if (window.location.hash === '' || window.location.hash.toLowerCase() === '#home') {
            window.location.hash = '#dashboard';
        }
        updatePageFromHash();
        window.addEventListener('hashchange', updatePageFromHash);

        // Load settings (dark mode)
        const dark = localStorage.getItem('darkMode') === 'true';
        if (dark) document.documentElement.classList.add('dark');

        // Initialize stores once for the whole app lifecycle
        gameStore.init();
        repoStore.init();

        return () => {
            window.removeEventListener('hashchange', updatePageFromHash);
            gameStore.disconnectWatchSocket();
        };
    }, []);

    return (
        <AppLayout page={page.value} sidebarOpen={sidebarOpen}>
            {page.value === 'dashboard' && <DashboardPage showModal={showModal} />}
            {page.value === 'servers' && <ServersPage showModal={showModal} />}
            {page.value === 'settings' && <SettingsPage />}
            <CreateServerModal showModal={showModal} />
            <EditServerModal />
            <ServerDrawer />
            <LogsModal />
            <SftpCredentialsModal />
            <NotificationContainer />
        </AppLayout>
    );
}
