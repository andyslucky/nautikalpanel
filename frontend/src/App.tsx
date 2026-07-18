import { useSignal } from '@preact/signals';
import AppLayout from './components/AppLayout';
import HomePage from './pages/HomePage';
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
    const page = useSignal<'home' | 'settings'>('home');
    const sidebarOpen = useSignal(false);
    const showModal = useSignal(false);

    // Hash-based routing
    function updatePageFromHash() {
        const hash = window.location.hash.toLowerCase().replace('#', '') as 'home' | 'settings';
        page.value = ['home', 'settings'].includes(hash) ? hash : 'home';
    }

    if (window.location.hash === '') {
        window.location.hash = '#home';
    }
    updatePageFromHash();
    window.addEventListener('hashchange', () => updatePageFromHash());

    // Load settings (dark mode)
    const dark = localStorage.getItem('darkMode') === 'true';
    if (dark) document.documentElement.classList.add('dark');

    // Initialize stores
    gameStore.init();
    repoStore.init();

    return (
        <AppLayout page={page.value} sidebarOpen={sidebarOpen}>
            {page.value === 'home' && <HomePage showModal={showModal} />}
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
