<script>
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';

	let { children } = $props();

	const navLinks = [
		{ href: '/', label: 'Equipment' },
		{ href: '/hardware-tree', label: 'Hardware Tree' },
		{ href: '/settings', label: 'Settings' },
	];

	function isActive(href) {
		if (href === '/') return $page.url.pathname === '/';
		return $page.url.pathname.startsWith(href);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Nilpeter Config backup</title>
</svelte:head>

<div class="min-h-screen bg-slate-50">
	<!-- Navigation bar -->
	<nav class="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex items-center h-14 gap-8">
				<a href="/" class="text-blue-600 font-bold text-lg tracking-tight select-none">
					Nilpeter Config backup
				</a>
				<div class="flex gap-1">
					{#each navLinks as link}
						<a
							href={link.href}
							class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors {isActive(link.href)
								? 'text-blue-600 bg-blue-50'
								: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}"
						>
							{link.label}
						</a>
					{/each}
				</div>
			</div>
		</div>
	</nav>

	<!-- Page content -->
	<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		{@render children()}
	</main>
</div>
