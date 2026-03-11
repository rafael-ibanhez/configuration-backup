<script>
	import { onMount } from 'svelte';
	import { api } from '$lib/api.js';

	// ── State ────────────────────────────────────────────────────────────────────
	let trees   = $state([]);
	let loading    = $state(true);
	let error      = $state('');

	// Create modal
	let showCreate  = $state(false);
	let createForm  = $state({ name: '', model: '', software_version: '', version_to: '', notes: '' });
	let creating    = $state(false);
	let createError = $state('');
	let conflictId  = $state(null);

	// Delete confirm
	let confirmDeleteId = $state(null);

	// Copy modal
	let copySourceId   = $state(null);
	let copySourceName = $state('');
	let copyForm       = $state({ name: '', model: '', software_version: '', version_to: '', notes: '' });
	let copying        = $state(false);
	let copyError      = $state('');

	// ── Derived ──────────────────────────────────────────────────────────────────
	const grouped = $derived(() => {
		const map = new Map();
		for (const t of trees) {
			if (!map.has(t.model)) map.set(t.model, { model: t.model, items: [] });
			map.get(t.model).items.push(t);
		}
		return [...map.values()];
	});

	// ── Lifecycle ────────────────────────────────────────────────────────────────
	onMount(loadAll);

	async function loadAll() {
		loading = true;
		error   = '';
		try {
			trees = await api.hardwareTrees.list();
		} catch (e) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	// ── Create tree ──────────────────────────────────────────────────────────────
	function openCreate() {
		createForm  = { name: '', model: '', software_version: '', notes: '' };
		creating    = false;
		createError = '';
		conflictId  = null;
		showCreate  = true;
	}

	async function submitCreate() {
		createError = '';
		conflictId  = null;
		if (!createForm.name.trim())             return (createError = 'Name is required.');
		if (!createForm.model.trim())            return (createError = 'Machine model is required.');
		if (!createForm.software_version.trim()) return (createError = 'Software version is required.');
		creating = true;
		try {
			const tree = await api.hardwareTrees.create({
				name:             createForm.name,
				model:            createForm.model,
				software_version: createForm.software_version,
				version_to:       createForm.version_to.trim() || null,
				notes:            createForm.notes,
			});
			trees = [...trees, { ...tree, slot_count: 0 }];
			showCreate = false;
		} catch (e) {
			createError = e.message;
			if (e.message?.includes('already exists')) {
				const existing = trees.find(
					t => t.model === createForm.model && t.software_version === createForm.software_version
				);
				if (existing) conflictId = existing.id;
			}
		} finally {
			creating = false;
		}
	}

	// ── Delete tree ──────────────────────────────────────────────────────────────
	async function deleteTree(id) {
		try {
			await api.hardwareTrees.delete(id);
			trees = trees.filter(t => t.id !== id);
			confirmDeleteId = null;
		} catch (e) {
			error = e.message;
		}
	}

	// ── Copy tree ────────────────────────────────────────────────────────────────
	function openCopy(tree) {
		copySourceId   = tree.id;
		copySourceName = tree.name;
		copyForm       = { name: `${tree.name} (copy)`, model: tree.model, software_version: '', version_to: '', notes: tree.notes ?? '' };
		copying        = false;
		copyError      = '';
	}

	async function submitCopy() {
		copyError = '';
		if (!copyForm.name.trim())             return (copyError = 'Name is required.');
		if (!copyForm.model.trim())            return (copyError = 'Machine model is required.');
		if (!copyForm.software_version.trim()) return (copyError = 'Software version is required.');
		copying = true;
		try {
			const tree = await api.hardwareTrees.copy(copySourceId, {
				name:             copyForm.name,
				model:            copyForm.model,
				software_version: copyForm.software_version,
				version_to:       copyForm.version_to.trim() || null,
				notes:            copyForm.notes,
			});
			trees = [...trees, { ...tree, slot_count: 0 }];
			copySourceId = null;
		} catch (e) {
			copyError = e.message;
		} finally {
			copying = false;
		}
	}

	// ── Helpers ──────────────────────────────────────────────────────────────────
	function fmt(dateStr) {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}
</script>

<svelte:head><title>Hardware Trees — Nilpeter Config Backup</title></svelte:head>

<!-- ── Page header ──────────────────────────────────────────────────────────── -->
<div class="flex items-center justify-between mb-8">
	<div>
		<h1 class="text-2xl font-bold text-slate-900">Hardware Trees</h1>
		<p class="text-sm text-slate-500 mt-1">Track hardware configurations across software versions.</p>
	</div>
	<div class="flex items-center gap-2">
		<a
			href="/hardware-tree/compare"
			class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
				<path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
			</svg>
			Compare
		</a>
		<button
			onclick={openCreate}
			class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
				<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
			</svg>
			New Hardware Tree
		</button>
	</div>
</div>

{#if loading}
	<div class="flex items-center justify-center py-24">
		<div class="h-8 w-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
	</div>
{:else if error}
	<div class="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">{error}</div>
{:else if trees.length === 0}
	<div class="text-center py-24 text-slate-400">
		<svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto mb-4 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
			<path stroke-linecap="round" stroke-linejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
		</svg>
		<p class="font-medium">No hardware trees yet</p>
		<p class="text-sm mt-1">Create your first hardware tree to start tracking configurations.</p>
	</div>
{:else}
	<div class="space-y-8">
			{#each grouped() as group}
				<section>
					<h2 class="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clip-rule="evenodd" />
						</svg>
						{group.model}
					</h2>
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{#each group.items as tree}
						<div class="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
							<a href="/hardware-tree/{tree.id}" class="block p-4 hover:bg-slate-50 transition-colors">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<p class="font-semibold text-slate-900 truncate">{tree.name}</p>
										<p class="text-xs text-slate-500 mt-0.5">{tree.slot_count} top-level slot{tree.slot_count !== 1 ? 's' : ''}</p>
									</div>
									<span class="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
										{tree.software_version}
									</span>
								</div>
								{#if tree.notes}
									<p class="text-xs text-slate-500 mt-2 line-clamp-2">{tree.notes}</p>
								{/if}
								<p class="text-xs text-slate-400 mt-3">{fmt(tree.created_at)}</p>
							</a>
							<div class="border-t border-slate-100 px-4 py-2 flex items-center gap-2">
								<a
									href="/hardware-tree/{tree.id}"
									class="flex-1 text-center text-xs font-medium text-blue-600 hover:text-blue-800 py-1 rounded-md hover:bg-blue-50 transition-colors"
								>
									Open
								</a>
								<button
									onclick={() => openCopy(tree)}
									class="flex-1 text-center text-xs font-medium text-slate-600 hover:text-slate-800 py-1 rounded-md hover:bg-slate-100 transition-colors"
								>
									Copy
								</button>
								{#if confirmDeleteId === tree.id}
									<span class="text-xs text-slate-600 mr-1">Delete?</span>
									<button onclick={() => deleteTree(tree.id)} class="text-xs px-2 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors">Yes</button>
									<button onclick={() => (confirmDeleteId = null)} class="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-md hover:bg-slate-200 transition-colors">No</button>
								{:else}
									<button
										onclick={() => (confirmDeleteId = tree.id)}
										class="flex-1 text-center text-xs font-medium text-red-500 hover:text-red-700 py-1 rounded-md hover:bg-red-50 transition-colors"
									>
										Delete
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/each}
	</div>
{/if}

<!-- ── Create modal ──────────────────────────────────────────────────────────── -->
{#if showCreate}
	<div
		class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
		onclick={(e) => { if (e.target === e.currentTarget) showCreate = false; }}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { if (e.target === e.currentTarget) showCreate = false; } if (e.key === 'Escape') showCreate = false; }}
		role="dialog" aria-modal="true" aria-label="New Hardware Tree" tabindex="-1"
	>
		<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
			<h2 class="text-lg font-bold text-slate-900">New Hardware Tree</h2>

			{#if createError}
				<div class="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
					{createError}
					{#if conflictId}
						— <a href="/hardware-tree/{conflictId}" class="underline font-medium">View existing tree</a>
					{/if}
				</div>
			{/if}

			<div>
				<label for="ht-create-name" class="block text-sm font-medium text-slate-700 mb-1">Name <span class="text-red-500">*</span></label>
				<input id="ht-create-name" bind:value={createForm.name} type="text" placeholder="e.g. Standard Rack v3" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
			</div>
			<div>
				<label for="ht-create-model" class="block text-sm font-medium text-slate-700 mb-1">Machine model <span class="text-red-500">*</span></label>
				<input id="ht-create-model" bind:value={createForm.model} type="text" placeholder="e.g. NP-6600" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
				<p class="text-xs text-slate-400 mt-1">Must match the model set on the equipment for auto-linking.</p>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="ht-create-version-from" class="block text-sm font-medium text-slate-700 mb-1">Version from <span class="text-red-500">*</span></label>
					<input id="ht-create-version-from" bind:value={createForm.software_version} type="text" placeholder="e.g. 2.1.5.0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
				</div>
				<div>
					<label for="ht-create-version-to" class="block text-sm font-medium text-slate-700 mb-1">Version to <span class="font-normal text-slate-400">(optional)</span></label>
					<input id="ht-create-version-to" bind:value={createForm.version_to} type="text" placeholder="e.g. 2.1.9.9" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
				</div>
			</div>
			<p class="text-xs text-slate-400 -mt-2">Leave "Version to" blank for an open-ended range (matches this version and later within the same generation).</p>
			<div>
				<label for="ht-create-notes" class="block text-sm font-medium text-slate-700 mb-1">Notes <span class="font-normal text-slate-400">(optional)</span></label>
				<textarea id="ht-create-notes" bind:value={createForm.notes} rows="2" placeholder="Any relevant notes…" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"></textarea>
			</div>

			<div class="flex justify-end gap-3 pt-1">
				<button onclick={() => (showCreate = false)} class="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
					Cancel
				</button>
				<button
					onclick={submitCreate}
					disabled={creating}
					class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
				>
					{creating ? 'Creating…' : 'Create'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ── Copy modal ────────────────────────────────────────────────────────────── -->
{#if copySourceId !== null}
	<div
		class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
		onclick={(e) => { if (e.target === e.currentTarget) copySourceId = null; }}
		onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { if (e.target === e.currentTarget) copySourceId = null; } if (e.key === 'Escape') copySourceId = null; }}
		role="dialog" aria-modal="true" aria-label="Copy Hardware Tree" tabindex="-1"
	>
		<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
			<h2 class="text-lg font-bold text-slate-900">Copy "{copySourceName}"</h2>
			<p class="text-sm text-slate-500">All nodes will be duplicated to the new tree.</p>

			{#if copyError}
				<div class="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">{copyError}</div>
			{/if}

			<div>
				<label for="ht-copy-name" class="block text-sm font-medium text-slate-700 mb-1">New name <span class="text-red-500">*</span></label>
				<input id="ht-copy-name" bind:value={copyForm.name} type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
			</div>
			<div>
				<label for="ht-copy-model" class="block text-sm font-medium text-slate-700 mb-1">Machine model <span class="text-red-500">*</span></label>
				<input id="ht-copy-model" bind:value={copyForm.model} type="text" placeholder="e.g. NP-6600" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="ht-copy-version-from" class="block text-sm font-medium text-slate-700 mb-1">Version from <span class="text-red-500">*</span></label>
					<input id="ht-copy-version-from" bind:value={copyForm.software_version} type="text" placeholder="e.g. 4.3.0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
				</div>
				<div>
					<label for="ht-copy-version-to" class="block text-sm font-medium text-slate-700 mb-1">Version to <span class="font-normal text-slate-400">(optional)</span></label>
					<input id="ht-copy-version-to" bind:value={copyForm.version_to} type="text" placeholder="e.g. 4.3.9" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
				</div>
			</div>
			<p class="text-xs text-slate-400 -mt-2">Leave "Version to" blank for an open-ended range.</p>
			<div>
				<label for="ht-copy-notes" class="block text-sm font-medium text-slate-700 mb-1">Notes <span class="font-normal text-slate-400">(optional)</span></label>
				<textarea id="ht-copy-notes" bind:value={copyForm.notes} rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"></textarea>
			</div>

			<div class="flex justify-end gap-3 pt-1">
				<button onclick={() => (copySourceId = null)} class="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
					Cancel
				</button>
				<button
					onclick={submitCopy}
					disabled={copying}
					class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
				>
					{copying ? 'Copying…' : 'Copy'}
				</button>
			</div>
		</div>
	</div>
{/if}
