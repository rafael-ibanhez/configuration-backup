<script>
	import { onMount } from 'svelte';
	import { api } from '$lib/api.js';

	// --- equipment list (name/description search) ---
	let equipment = $state([]);
	let nameSearch = $state('');
	let loading = $state(true);
	let error = $state('');

	// --- version search ---
	let searchMode = $state('name'); // 'name' | 'version'
	let versionQuery = $state('');
	let versionLoading = $state(false);
	let versionError = $state('');
	let versionResult = $state(null); // { current: [], historical: [] } | null
	let versionSearched = $state(''); // the version that was last searched

	onMount(async () => {
		try {
			equipment = await api.equipment.list();
		} catch (e) {
			error = e.message;
		} finally {
			loading = false;
		}
	});

	const filtered = $derived(
		equipment.filter(
			(e) =>
				e.name.toLowerCase().includes(nameSearch.toLowerCase()) ||
				(e.description ?? '').toLowerCase().includes(nameSearch.toLowerCase())
		)
	);

	async function runVersionSearch() {
		const v = versionQuery.trim();
		if (!v) return;
		versionLoading = true;
		versionError = '';
		versionResult = null;
		try {
			versionResult = await api.equipment.search(v);
			versionSearched = v;
		} catch (e) {
			versionError = e.message;
		} finally {
			versionLoading = false;
		}
	}

	function handleVersionKeydown(e) {
		if (e.key === 'Enter') runVersionSearch();
	}

	function daysSince(dateStr) {
		if (!dateStr) return null;
		return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
	}

	function formatDate(dateStr) {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="space-y-6">
	<!-- Page header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-slate-900">Equipment</h1>
			<p class="text-sm text-slate-500 mt-0.5">Manage configurations and backup status</p>
		</div>
		<a
			href="/settings"
			class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
				<path
					fill-rule="evenodd"
					d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
					clip-rule="evenodd"
				/>
			</svg>
			Add Equipment
		</a>
	</div>

	<!-- Search bar -->
	<div class="space-y-3">
		<!-- Mode toggle -->
		<div class="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1">
			<button
				onclick={() => { searchMode = 'name'; }}
				class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {searchMode === 'name'
					? 'bg-white text-slate-900 shadow-sm border border-slate-200'
					: 'text-slate-500 hover:text-slate-700'}"
			>
				Search by name
			</button>
			<button
				onclick={() => { searchMode = 'version'; }}
				class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {searchMode === 'version'
					? 'bg-white text-slate-900 shadow-sm border border-slate-200'
					: 'text-slate-500 hover:text-slate-700'}"
			>
				Search by version
			</button>
		</div>

		{#if searchMode === 'name'}
			<!-- Name/description filter -->
			<div class="relative">
				<svg
					class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 20 20"
					fill="currentColor"
				>
					<path
						fill-rule="evenodd"
						d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
						clip-rule="evenodd"
					/>
				</svg>
				<input
					bind:value={nameSearch}
					type="search"
					placeholder="Search equipment by name or description…"
					class="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				/>
			</div>
		{:else}
			<!-- Version search -->
			<div class="flex gap-2">
				<div class="relative flex-1">
					<svg
						class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
							clip-rule="evenodd"
						/>
					</svg>
					<input
						bind:value={versionQuery}
						onkeydown={handleVersionKeydown}
						type="search"
						placeholder="Enter software version (e.g. V2.1.5.5)…"
						class="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					/>
				</div>
				<button
					onclick={runVersionSearch}
					disabled={!versionQuery.trim() || versionLoading}
					class="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
				>
					{versionLoading ? 'Searching…' : 'Search'}
				</button>
			</div>
		{/if}
	</div>

	<!-- States / results -->
	{#if searchMode === 'name'}
		{#if loading}
			<div class="flex justify-center py-16">
				<div class="h-8 w-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
			</div>
		{:else if error}
			<div class="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">{error}</div>
		{:else if filtered.length === 0}
			<div class="text-center py-16 text-slate-400 text-sm">
				{nameSearch ? 'No equipment matches your search.' : 'No equipment yet. Go to Settings to add some.'}
			</div>
		{:else}
			{@render equipmentTable(filtered)}
			<p class="text-xs text-slate-400 text-right">{filtered.length} equipment listed</p>
		{/if}

	{:else}
		<!-- Version search results -->
		{#if versionLoading}
			<div class="flex justify-center py-16">
				<div class="h-8 w-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
			</div>
		{:else if versionError}
			<div class="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">{versionError}</div>
		{:else if versionResult}
			<!-- Currently on this version -->
			<div class="space-y-2">
				<h2 class="text-sm font-semibold text-slate-700">
					Currently running
					<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 ml-1">{versionSearched}</span>
					<span class="text-slate-400 font-normal ml-1">({versionResult.current.length})</span>
				</h2>
				{#if versionResult.current.length === 0}
					<div class="text-sm text-slate-400 py-4 text-center">No equipment is currently on this version.</div>
				{:else}
					{@render equipmentTable(versionResult.current)}
				{/if}
			</div>

			<!-- Previously had this version -->
			<div class="space-y-2 mt-6">
				<h2 class="text-sm font-semibold text-slate-700">
					Previously ran
					<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 ml-1">{versionSearched}</span>
					<span class="text-slate-400 font-normal ml-1">({versionResult.historical.length})</span>
				</h2>
				{#if versionResult.historical.length === 0}
					<div class="text-sm text-slate-400 py-4 text-center">No equipment has previously used this version.</div>
				{:else}
					{@render equipmentTable(versionResult.historical, true)}
				{/if}
			</div>

			<!-- Hardware trees covering this version -->
			{#if versionResult.matchingTrees?.length > 0}
				<div class="space-y-2 mt-6">
					<h2 class="text-sm font-semibold text-slate-700">
						Hardware trees covering
						<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-50 text-violet-700 ml-1">{versionSearched}</span>
					</h2>
					<div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
						<table class="w-full text-sm">
							<thead>
								<tr class="bg-slate-50 border-b border-slate-200">
									<th class="text-left px-5 py-3 font-medium text-slate-500">Name</th>
									<th class="text-left px-5 py-3 font-medium text-slate-500 w-36">Model</th>
									<th class="text-left px-5 py-3 font-medium text-slate-500 w-52">Version range</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-slate-100">
								{#each versionResult.matchingTrees as t}
									<tr
										onclick={() => (window.location.href = `/hardware-tree/${t.id}`)}
										class="cursor-pointer hover:bg-slate-50 transition-colors"
									>
										<td class="px-5 py-3.5 font-medium text-slate-900">{t.name}</td>
										<td class="px-5 py-3.5 text-slate-600">{t.model}</td>
										<td class="px-5 py-3.5">
											<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
												{t.software_version}{t.version_to ? ` – ${t.version_to}` : '+'}
											</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		{:else}
			<div class="text-center py-16 text-slate-400 text-sm">
				Enter a software version above and press Search.
			</div>
		{/if}
	{/if}
</div>

{#snippet equipmentTable(rows, historical = false)}
	<div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
		<table class="w-full text-sm">
			<thead>
				<tr class="bg-slate-50 border-b border-slate-200">
					<th class="text-left px-5 py-3 font-medium text-slate-500 w-56">Name</th>
					<th class="text-left px-5 py-3 font-medium text-slate-500">Description</th>
					<th class="text-left px-5 py-3 font-medium text-slate-500 w-36">
						{historical ? 'Current Version' : 'Software Version'}
					</th>
					{#if historical}
						<th class="text-left px-5 py-3 font-medium text-slate-500 w-40">Was on version</th>
					{/if}
					<th class="text-left px-5 py-3 font-medium text-slate-500 w-40">Last Backup</th>
					<th class="text-left px-5 py-3 font-medium text-slate-500 w-28">Status</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#each rows as eq}
					{@const days = daysSince(eq.last_backup)}
					{@const stale = days !== null && days > 30}
					<tr
						onclick={() => (window.location.href = `/equipment/${eq.id}`)}
						class="cursor-pointer transition-colors {stale ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-slate-50'}"
					>
						<td class="px-5 py-3.5 font-semibold text-slate-900">{eq.name}</td>
						<td class="px-5 py-3.5 text-slate-500">{eq.description ?? '—'}</td>
						<td class="px-5 py-3.5 text-slate-600">
							{#if eq.current_version}
								<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {historical ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700'}">
									{eq.current_version}
								</span>
							{:else}
								<span class="text-slate-400">—</span>
							{/if}
						</td>
						{#if historical}
							<td class="px-5 py-3.5 text-slate-500 text-xs">{formatDate(eq.had_version_at)}</td>
						{/if}
						<td class="px-5 py-3.5 text-slate-600">{formatDate(eq.last_backup)}</td>
						<td class="px-5 py-3.5">
							{#if days === null}
								<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">No backup</span>
							{:else if stale}
								<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{days}d ago</span>
							{:else}
								<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">{days}d ago</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/snippet}
