import { useSignal } from '@preact/signals';
import type { ComponentChildren } from 'preact';

export default function AppLayout({ page, sidebarOpen, children }: { page: string; sidebarOpen: ReturnType<typeof useSignal<boolean>>; children: ComponentChildren }) {
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
                        <a href="#home" onClick={() => (sidebarOpen.value = false)} class={page === 'home' ? 'nav-link-active' : 'nav-link-inactive'}>🏠 Home</a>
                        <a href="#settings" onClick={() => (sidebarOpen.value = false)} class={page === 'settings' ? 'nav-link-active' : 'nav-link-inactive'}>⚙️ Settings</a>
                        <p class="version-text pt-2">v1.0.0</p>
                    </nav>
                )}
            </header>

            {/* Sidebar */}
            <aside class="sidebar">
                <h1 class="heading-primary mb-8 dark:text-gray-100">🎮 Nautikal Panel</h1>
                <nav class="flex-1 space-y-2">
                    <a href="#home" class={page === 'home' ? 'nav-link-active' : 'nav-link-inactive'}>🏠 Home</a>
                    <a href="#settings" class={page === 'settings' ? 'nav-link-active' : 'nav-link-inactive'}>⚙️ Settings</a>
                </nav>
                <p class="version-text">v1.0.0</p>
            </aside>

            {/* Main Content */}
            <main class="main-content">{children}</main>
        </>
    );
}
