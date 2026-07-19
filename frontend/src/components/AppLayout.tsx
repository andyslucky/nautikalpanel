import { useSignal } from '@preact/signals';
import { useLocation } from 'preact-iso';
import type { ComponentChildren } from 'preact';

interface AppLayoutProps {
    sidebarOpen: ReturnType<typeof useSignal<boolean>>;
    children: ComponentChildren;
}

const NAV_ITEMS = [
    { path: '/', label: '📊 Dashboard', page: 'dashboard' },
    { path: '/servers', label: '🖥️ Servers', page: 'servers' },
    { path: '/settings', label: '⚙️ Settings', page: 'settings' },
] as const;

/**
 * Map the current URL path to the page id used for active-link highlighting.
 * The dashboard is the landing page and is served at `/`, `/dashboard`, and
 * the legacy `/home` alias; everything not explicitly the Servers or Settings
 * page is treated as the dashboard.
 */
function pathToPageId(path: string): 'dashboard' | 'servers' | 'settings' {
    if (path === '/servers') return 'servers';
    if (path === '/settings') return 'settings';
    return 'dashboard';
}

export default function AppLayout({ sidebarOpen, children }: AppLayoutProps) {
    // `useLocation()` reflects the current path and re-renders this component
    // when navigation happens (preact-iso handles the History API for us).
    const { path } = useLocation();
    const activePage = pathToPageId(path);

    return (
        <>
            {/* Mobile Header */}
            <header class="mobile-header">
                <div class="flex items-center justify-between">
                    <h1 class="heading-primary dark:text-gray-100">🎮 Nautikal Panel</h1>
                    <button onClick={() => (sidebarOpen.value = !sidebarOpen.value)} class="icon-btn">
                        {!sidebarOpen.value ? (
                            <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                            </svg>
                        ) : (
                            <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        )}
                    </button>
                </div>
                {sidebarOpen.value && (
                    <nav class="mt-4 space-y-2">
                        {NAV_ITEMS.map((item) => (
                            <a
                                key={item.path}
                                href={item.path}
                                onClick={() => (sidebarOpen.value = false)}
                                class={activePage === item.page ? 'nav-link-active' : 'nav-link-inactive'}
                            >
                                {item.label}
                            </a>
                        ))}
                        <p class="version-text pt-2">v1.0.0</p>
                    </nav>
                )}
            </header>

            {/* Sidebar */}
            <aside class="sidebar">
                <h1 class="heading-primary mb-8 dark:text-gray-100">🎮 Nautikal Panel</h1>
                <nav class="flex-1 space-y-2">
                    {NAV_ITEMS.map((item) => (
                        <a
                            key={item.path}
                            href={item.path}
                            class={activePage === item.page ? 'nav-link-active' : 'nav-link-inactive'}
                        >
                            {item.label}
                        </a>
                    ))}
                </nav>
                <p class="version-text">v1.0.0</p>
            </aside>

            {/* Main Content */}
            <main class="main-content">{children}</main>
        </>
    );
}