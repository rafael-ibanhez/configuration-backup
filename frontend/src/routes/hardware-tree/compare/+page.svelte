<script>
	import { api } from '$lib/api.js';

	// ── All trees (loaded once) ───────────────────────────────────────────────
	let allTrees    = $state([]);
	let treesError  = $state('');

	$effect(() => {
		api.hardwareTrees.list()
			.then(data => (allTrees = data))
			.catch(e  => (treesError = e.message));
	});

	// ── Derived selectable options ────────────────────────────────────────────
	// Unique, sorted model names
	const models = $derived(
		[...new Set(allTrees.map(t => t.model))].sort((a, b) => a.localeCompare(b))
	);

	// Versions available for the selected model, sorted
	const versionsForModel = $derived(
		allTrees
			.filter(t => t.model === model)
			.map(t => ({
				value: t.software_version,
				label: t.version_to ? `${t.software_version} – ${t.version_to}` : `${t.software_version}+`,
			}))
			.sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }))
	);

	// ── Form state ────────────────────────────────────────────────────────────
	let model        = $state('');
	let fromVersion  = $state('');
	let toVersion    = $state('');
	let loading      = $state(false);
	let result       = $state(null);
	let formError    = $state('');

	// Reset version picks and result whenever the model changes
	$effect(() => {
		model; // track
		fromVersion = '';
		toVersion   = '';
		result      = null;
	});

	// Also clear result if the version pair changes
	$effect(() => {
		fromVersion; toVersion; // track
		result = null;
	});

	const canCompare = $derived(!!model && !!fromVersion && !!toVersion && fromVersion !== toVersion);

	// ── Submit ────────────────────────────────────────────────────────────────
	async function runCompare() {
		formError = '';
		result    = null;
		if (!canCompare) return;
		loading = true;
		try {
			result = await api.hardwareTrees.compare(model, fromVersion, toVersion);
		} catch (e) {
			formError = e.message;
		} finally {
			loading = false;
		}
	}

	// ── Path-key maps (node.id → pathKey) ────────────────────────────────────
	// Uses the same instance-label heuristic as the backend:
	// the field with fewer spaces is the unique B&R instance name.
	function instanceLabel(node) {
		if (!node.description) return node.name;
		if (!node.name) return node.description;
		const ns = (node.name.match(/ /g) || []).length;
		const ds = (node.description.match(/ /g) || []).length;
		return ns <= ds ? node.name : node.description;
	}
	function buildIdPathMap(nodes, parentPath = [], map = new Map()) {
		for (const node of nodes) {
			const segment = instanceLabel(node);
			const path = [...parentPath, segment];
			map.set(node.id, path.join(' › '));
			if (node.children?.length) buildIdPathMap(node.children, path, map);
		}
		return map;
	}

	const fromPathMap = $derived(result?.from ? buildIdPathMap(result.from.nodes) : new Map());
	const toPathMap   = $derived(result?.to   ? buildIdPathMap(result.to.nodes)   : new Map());

	// ── Diff sets for O(1) lookup ─────────────────────────────────────────────
	const removedKeys  = $derived(result ? new Set(result.diff.removed.map(d => d.pathKey))  : new Set());
	const addedKeys    = $derived(result ? new Set(result.diff.added.map(d => d.pathKey))    : new Set());
	// From-tree uses the original pathKey; to-tree uses toPathKey (differs for moved nodes)
	const modifiedFromKeys = $derived(result ? new Set(result.diff.modified.map(d => d.pathKey))               : new Set());
	const modifiedToKeys   = $derived(result ? new Set(result.diff.modified.map(d => d.toPathKey ?? d.pathKey)) : new Set());
	const fromModifiedMap  = $derived(result ? new Map(result.diff.modified.map(d => [d.pathKey, d]))                       : new Map());
	const toModifiedMap    = $derived(result ? new Map(result.diff.modified.map(d => [d.toPathKey ?? d.pathKey, d]))        : new Map());
	const movedCount       = $derived(result ? result.diff.modified.filter(d => d.moved).length : 0);

	function fmtAddr(node) {
		if (node.address_dec === null && !node.address_hex) return '';
		if (node.address_dec !== null && node.address_hex)
			return `${node.address_dec} / 0x${node.address_hex}`;
		if (node.address_dec !== null) return String(node.address_dec);
		return `0x${node.address_hex}`;
	}
</script>

<svelte:head><title>Compare Hardware Trees — Nilpeter Config Backup</title></svelte:head>

<!-- ── Breadcrumb + header ────────────────────────────────────────────────── -->
<div class="mb-8">
	<a href="/hardware-tree" class="text-sm text-slate-500 hover:text-slate-700 transition-colors">
		← Hardware Trees
	</a>
	<h1 class="text-2xl font-bold text-slate-900 mt-3">Compare Hardware Trees</h1>
	<p class="text-sm text-slate-500 mt-1">Select a machine model and two software versions to see what changed.</p>
</div>

<!-- ── Input form ─────────────────────────────────────────────────────────── -->
<div class="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mb-8">

	{#if treesError}
		<p class="mb-4 text-sm text-red-600">Could not load hardware trees: {treesError}</p>
	{/if}

	<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">

		<!-- Model -->
		<div>
			<label for="ht-compare-model" class="block text-sm font-medium text-slate-700 mb-1">Machine model</label>
			<select id="ht-compare-model"
				bind:value={model}
				class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
				disabled={models.length === 0}
			>
				<option value="">— select model —</option>
				{#each models as m}
					<option value={m}>{m}</option>
				{/each}
			</select>
		</div>

		<!-- From version -->
		<div>
			<label for="ht-compare-from" class="block text-sm font-medium text-slate-700 mb-1">From version</label>
			<select id="ht-compare-from"
				bind:value={fromVersion}
				class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
				disabled={!model || versionsForModel.length === 0}
			>
				<option value="">— select version —</option>
				{#each versionsForModel as v}
				<option value={v.value} disabled={v.value === toVersion}>{v.label}</option>
				{/each}
			</select>
		</div>

		<!-- To version -->
		<div>
			<label for="ht-compare-to" class="block text-sm font-medium text-slate-700 mb-1">To version</label>
			<select id="ht-compare-to"
				bind:value={toVersion}
				class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
				disabled={!model || versionsForModel.length === 0}
			>
				<option value="">— select version —</option>
				{#each versionsForModel as v}
				<option value={v.value} disabled={v.value === fromVersion}>{v.label}</option>
				{/each}
			</select>
		</div>

	</div>

	{#if formError}
		<p class="mt-3 text-sm text-red-600">{formError}</p>
	{/if}

	<div class="mt-4 flex items-center justify-between">
		{#if model && versionsForModel.length < 2}
			<p class="text-sm text-amber-600">Need at least 2 versions for <strong>{model}</strong> to compare.</p>
		{:else}
			<span></span>
		{/if}
		<button
			onclick={runCompare}
			disabled={loading || !canCompare}
			class="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{#if loading}
				<span class="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin inline-block"></span>
				Comparing…
			{:else}
				Compare
			{/if}
		</button>
	</div>
</div>

{#if result}

<!-- ── Summary pills ──────────────────────────────────────────────────────── -->
<div class="flex flex-wrap gap-3 mb-6">
	<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm">
		<span class="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0"></span>
		<span class="font-semibold text-red-700">{result.summary.removed_count}</span>
		<span class="text-red-600">removed</span>
	</div>
	<div class="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm">
		<span class="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0"></span>
		<span class="font-semibold text-green-700">{result.summary.added_count}</span>
		<span class="text-green-600">added</span>
	</div>
	<div class="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm">
		<span class="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0"></span>
		<span class="font-semibold text-amber-700">{result.summary.modified_count}</span>
		<span class="text-amber-600">modified</span>
	</div>
	{#if movedCount > 0}
	<div class="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm">
		<span class="h-2.5 w-2.5 rounded-full bg-violet-500 shrink-0"></span>
		<span class="font-semibold text-violet-700">{movedCount}</span>
		<span class="text-violet-600">moved</span>
	</div>
	{/if}
	{#if result.summary.removed_count === 0 && result.summary.added_count === 0 && result.summary.modified_count === 0}
		<div class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
			✓ Trees are identical
		</div>
	{/if}
</div>

<!-- ── Diff detail ────────────────────────────────────────────────────────── -->
{#if result.summary.removed_count > 0 || result.summary.added_count > 0 || result.summary.modified_count > 0}
	<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">

		{#if result.summary.removed_count > 0}
			<div class="rounded-xl border border-red-200 bg-red-50 overflow-hidden">
				<div class="px-4 py-3 border-b border-red-200 flex items-center gap-2">
					<span class="h-2 w-2 rounded-full bg-red-500"></span>
					<h3 class="text-sm font-semibold text-red-800">Removed ({result.summary.removed_count})</h3>
				</div>
				<ul class="divide-y divide-red-100 text-sm">
					{#each result.diff.removed as d}
						<li class="px-4 py-2.5">
							<p class="font-medium text-red-900">{d.path.at(-1)}</p>
							<p class="text-xs text-red-500 mt-0.5 leading-relaxed">{d.path.slice(0, -1).join(' › ')}</p>
							{#if fmtAddr(d.node)}
								<p class="text-xs text-red-400 mt-0.5">addr: {fmtAddr(d.node)}</p>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if result.summary.added_count > 0}
			<div class="rounded-xl border border-green-200 bg-green-50 overflow-hidden">
				<div class="px-4 py-3 border-b border-green-200 flex items-center gap-2">
					<span class="h-2 w-2 rounded-full bg-green-500"></span>
					<h3 class="text-sm font-semibold text-green-800">Added ({result.summary.added_count})</h3>
				</div>
				<ul class="divide-y divide-green-100 text-sm">
					{#each result.diff.added as d}
						<li class="px-4 py-2.5">
							<p class="font-medium text-green-900">{d.path.at(-1)}</p>
							<p class="text-xs text-green-500 mt-0.5 leading-relaxed">{d.path.slice(0, -1).join(' › ')}</p>
							{#if fmtAddr(d.node)}
								<p class="text-xs text-green-400 mt-0.5">addr: {fmtAddr(d.node)}</p>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if result.summary.modified_count > 0}
			<div class="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
				<div class="px-4 py-3 border-b border-amber-200 flex items-center gap-2">
					<span class="h-2 w-2 rounded-full bg-amber-500"></span>
					<h3 class="text-sm font-semibold text-amber-800">Modified ({result.summary.modified_count})</h3>
				</div>
				<ul class="divide-y divide-amber-100 text-sm">
					{#each result.diff.modified as d}
						<li class="px-4 py-2.5">
							<div class="flex items-center gap-1.5 flex-wrap">
								<p class="font-medium text-amber-900">{d.path.at(-1)}</p>
								{#if d.moved}
									<span class="text-xs px-1.5 py-0.5 rounded-full font-medium bg-violet-100 text-violet-700">moved</span>
								{/if}
							</div>
							{#if !d.moved}
								<p class="text-xs text-amber-500 mt-0.5">{d.path.slice(0, -1).join(' › ')}</p>
							{/if}
							{#each d.changes as c}
								{#if c.field === 'location'}
									<p class="text-xs text-amber-700 mt-1">
										<span class="font-medium">location:</span><br>
										<span class="line-through text-red-500">{c.from}</span><br>
										<span class="text-green-600">→ {c.to}</span>
									</p>
								{:else}
									<p class="text-xs text-amber-700 mt-1">
										<span class="font-medium">{c.field}:</span>
										<span class="line-through text-red-500 mr-1">{c.from ?? '—'}</span>→
										<span class="text-green-600 ml-1">{c.to ?? '—'}</span>
									</p>
								{/if}
							{/each}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
{/if}

<!-- ── Side-by-side trees ─────────────────────────────────────────────────── -->
{#if result.from || result.to}
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

		<!-- FROM tree -->
		<div class="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
			<div class="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
				<div>
					<span class="text-xs font-medium text-slate-500 uppercase tracking-wide">From</span>
					{#if result.from}
						<p class="text-sm font-semibold text-slate-800 mt-0.5">{result.from.name} <span class="font-normal text-slate-500">v{result.from.software_version}</span></p>
					{:else}
						<p class="text-sm text-slate-400 mt-0.5 italic">Tree not found</p>
					{/if}
				</div>
				{#if result.from}
					<a href="/hardware-tree/{result.from.id}" class="text-xs text-blue-600 hover:underline">Open →</a>
				{/if}
			</div>
			{#if result.from}
				<div class="p-2">
					{@render treeNodes(result.from.nodes, 0, fromPathMap, 'from')}
				</div>
			{/if}
		</div>

		<!-- TO tree -->
		<div class="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
			<div class="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
				<div>
					<span class="text-xs font-medium text-slate-500 uppercase tracking-wide">To</span>
					{#if result.to}
						<p class="text-sm font-semibold text-slate-800 mt-0.5">{result.to.name} <span class="font-normal text-slate-500">v{result.to.software_version}</span></p>
					{:else}
						<p class="text-sm text-slate-400 mt-0.5 italic">Tree not found</p>
					{/if}
				</div>
				{#if result.to}
					<a href="/hardware-tree/{result.to.id}" class="text-xs text-blue-600 hover:underline">Open →</a>
				{/if}
			</div>
			{#if result.to}
				<div class="p-2">
					{@render treeNodes(result.to.nodes, 0, toPathMap, 'to')}
				</div>
			{/if}
		</div>
	</div>
{/if}

{/if}

<!-- ── Recursive tree-node snippet ───────────────────────────────────────── -->
{#snippet treeNodes(nodes, depth, pathMap, side)}
	{#each nodes as node}
		{@const path = pathMap.get(node.id) ?? ''}
		{@const diffEntry = side === 'from' ? fromModifiedMap.get(path) : toModifiedMap.get(path)}
		{@const isMoved = diffEntry?.moved === true}
		{@const cls = side === 'from'
			? (removedKeys.has(path)       ? 'bg-red-50 border-red-200'    :
			   modifiedFromKeys.has(path)  ? 'bg-amber-50 border-amber-200' : 'border-transparent')
			: (addedKeys.has(path)          ? 'bg-green-50 border-green-200' :
			   modifiedToKeys.has(path)    ? 'bg-amber-50 border-amber-200' : 'border-transparent')}
		{@const pill = side === 'from'
			? (removedKeys.has(path)      ? 'removed'                       :
			   modifiedFromKeys.has(path) ? (isMoved ? 'moved' : 'modified') : '')
			: (addedKeys.has(path)        ? 'added'                         :
			   modifiedToKeys.has(path)   ? (isMoved ? 'moved' : 'modified') : '')}
		<div style="margin-left: {depth * 1.25}rem" class="mb-0.5">
			<div class="flex items-start gap-2 rounded-lg border px-2.5 py-1.5 {cls}">
				<span class="text-slate-300 text-xs mt-0.5 shrink-0">
					{depth === 0 ? '▪' : '└'}
				</span>
				<div class="flex-1 min-w-0">
					<span class="text-sm font-medium text-slate-800">{node.name}</span>
					{#if node.address_dec !== null || node.address_hex}
						<span class="ml-2 text-xs text-slate-400">{fmtAddr(node)}</span>
					{/if}
					{#if node.description}
						<p class="text-xs text-slate-400 truncate">{node.description}</p>
					{/if}
					{#if diffEntry}
						<div class="mt-1 space-y-0.5">
							{#each (diffEntry.changes ?? []) as c}
								{#if c.field !== 'location'}
									<p class="text-xs text-amber-700">
										<span class="font-medium">{c.field}:</span>
										{#if side === 'from'}
											<span class="line-through text-red-500">{c.from ?? '—'}</span>
										{:else}
											<span class="text-green-600">{c.to ?? '—'}</span>
										{/if}
									</p>
								{/if}
							{/each}
						</div>
					{/if}
				</div>
				{#if pill}
					<span class="shrink-0 mt-0.5 text-xs px-1.5 py-0.5 rounded-full font-medium
						{pill === 'removed'  ? 'bg-red-100 text-red-700'       : ''}
						{pill === 'added'    ? 'bg-green-100 text-green-700'   : ''}
						{pill === 'moved'    ? 'bg-violet-100 text-violet-700' : ''}
						{pill === 'modified' ? 'bg-amber-100 text-amber-700'   : ''}"
					>{pill}</span>
				{/if}
			</div>
			{#if node.children?.length}
				{@render treeNodes(node.children, depth + 1, pathMap, side)}
			{/if}
		</div>
	{/each}
{/snippet}
