// @ts-check
import {defineConfig} from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
    site: "https://andyslucky.github.io",
    base: "/nautikalpanel",
    integrations: [
        starlight({
            title: 'Nautikal Panel Docs',
            social: [{icon: 'github', label: 'GitHub', href: 'https://github.com/andyslucky/nautikalpanel'}],
            sidebar: [
                {
                    label: 'Getting Started',
                    items: [
                        'getting-started/introduction',
                        'getting-started/installation',
                        'getting-started/development',
                        'getting-started/quick-start',
                    ],
                },
                {
                    label: 'User Guide',
                    items: [
                        {label: 'Dashboard Overview', slug: 'user-guide/dashboard'},
                        {label: 'Creating Servers', slug: 'user-guide/creating-servers'},
                        {label: 'Managing Servers', slug: 'user-guide/managing-servers'},
                        {label: 'SFTP Access', slug: 'user-guide/sftp-access'},
                        {label: 'Viewing Logs', slug: 'user-guide/viewing-logs'},
                        {label: 'Troubleshooting', slug: 'user-guide/troubleshooting'}
                    ],
                },
                {
                    label: 'Templates',
                    items: [
                        {label: 'Game Server Templates', slug: 'templates/game-server-templates'},
                        {label: 'Template Repositories', slug: 'templates/template-repositories'},
                        {label: 'JSON Schema', slug: 'templates/json-schema'},
                    ],
                },
                {
                    label: 'Configuration',
                    items: [
                        {label: 'Server Configuration', slug: 'configuration/server'},
                        {label: 'Kubernetes Settings', slug: 'configuration/kubernetes'},
                        {label: 'Database Settings', slug: 'configuration/database'},
                        {label: 'Paths', slug: 'configuration/templates'},
                        {label: 'Environment Variables', slug: 'configuration/environment-variables'},
                    ],
                },
                {
                    label: 'Advanced',
                    items: [
                        {label: 'Game Server Templates', slug: 'advanced/game-server-templates'},
                        {label: 'Custom K8s Templates', slug: 'advanced/custom-templates'},
                    ],
                },
            ],
        }),
    ],
});
