<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { api } from '$lib/api.js';

	const treeId = $derived(parseInt($page.params.id));

	// ── State ────────────────────────────────────────────────────────────────────
	let tree      = $state(null);
	let loading   = $state(true);
	let error     = $state('');

	// Adding a node: { parentId: number|null }
	let addingNode    = $state(null);
	let newNode       = $state({ name: '', description: '', address_dec: '', address_hex: '' });
	let savingNode    = $state(false);
	let nodeError     = $state('');

	// Editing a node
	let editingNodeId = $state(null);
	let editValues    = $state({ name: '', description: '', address_dec: '', address_hex: '' });
	let savingEdit    = $state(false);
	let editError     = $state('');

	// Delete confirm
	let confirmDeleteNodeId = $state(null);

	// Collapse state: nodeId -> bool
	let collapsed = $state({});

	// Copy modal
	let showCopy  = $state(false);
	let copyForm  = $state({ name: '', model: '', software_version: '', version_to: '', notes: '' });
	let copying   = $state(false);
	let copyError = $state('');

	// Import modal
	let showImport   = $state(false);
	let importFile   = $state(null);
	let importing    = $state(false);
	let importError  = $state('');
	let importResult = $state(null);

	// ── Lifecycle ────────────────────────────────────────────────────────────────
	onMount(loadTree);

	async function loadTree() {
		loading = true;
		error   = '';
		try {
			tree = await api.hardwareTrees.get(treeId);
		} catch (e) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	// ── Address helpers ──────────────────────────────────────────────────────────
	function decToHex(dec) {
		const n = parseInt(dec, 10);
		if (isNaN(n)) return '';
		return n.toString(16).toUpperCase();
	}

	function hexToDec(hex) {
		const trimmed = hex.replace(/^0x/i, '');
		const n = parseInt(trimmed, 16);
		if (isNaN(n)) return '';
		return String(n);
	}

	function onDecInput(obj, field_dec, field_hex, value) {
		obj[field_dec] = value;
		obj[field_hex] = value !== '' ? decToHex(value) : '';
	}

	function onHexInput(obj, field_dec, field_hex, value) {
		obj[field_hex] = value;
		obj[field_dec] = value !== '' ? hexToDec(value) : '';
	}

	// Format address for display
	function fmtAddr(node) {
		if (node.address_dec === null && !node.address_hex) return '—';
		if (node.address_dec !== null && node.address_hex)
			return `${node.address_dec} / 0x${node.address_hex}`;
		if (node.address_dec !== null) return String(node.address_dec);
		return `0x${node.address_hex}`;
	}

	// ── Add node ─────────────────────────────────────────────────────────────────
	function startAdd(parentId) {
		addingNode = { parentId };
		newNode    = { name: '', description: '', address_dec: '', address_hex: '' };
		nodeError  = '';
	}

	function cancelAdd() {
		addingNode = null;
		nodeError  = '';
	}

	async function submitAdd() {
		nodeError = '';
		if (!newNode.name.trim()) return (nodeError = 'Name is required.');

		const isRoot = addingNode.parentId === null;
		if (isRoot && newNode.address_dec === '')
			return (nodeError = 'Top-level slots require a decimal address.');

		savingNode = true;
		try {
			const created = await api.hardwareNodes.create({
				hardware_tree_id: treeId,
				parent_id:   addingNode.parentId ?? null,
				name:        newNode.name.trim(),
				description: newNode.description.trim() || null,
				address_dec: newNode.address_dec !== '' ? parseInt(newNode.address_dec, 10) : null,
				address_hex: newNode.address_hex || null,
			});
			// Refresh tree to get updated nested structure
			tree = await api.hardwareTrees.get(treeId);
			addingNode = null;
		} catch (e) {
			nodeError = e.message;
		} finally {
			savingNode = false;
		}
	}

	// ── Edit node ────────────────────────────────────────────────────────────────
	function startEdit(node) {
		editingNodeId = node.id;
		editValues    = {
			name:        node.name,
			description: node.description ?? '',
			address_dec: node.address_dec !== null ? String(node.address_dec) : '',
			address_hex: node.address_hex ?? '',
		};
		editError = '';
	}

	function cancelEdit() {
		editingNodeId = null;
		editError     = '';
	}

	async function submitEdit(node) {
		editError = '';
		if (!editValues.name.trim()) return (editError = 'Name is required.');
		if (node.parent_id === null && editValues.address_dec === '')
			return (editError = 'Top-level slots require a decimal address.');

		savingEdit = true;
		try {
			await api.hardwareNodes.update(node.id, {
				name:        editValues.name.trim(),
				description: editValues.description.trim() || null,
				address_dec: editValues.address_dec !== '' ? parseInt(editValues.address_dec, 10) : null,
				address_hex: editValues.address_hex || null,
			});
			tree = await api.hardwareTrees.get(treeId);
			editingNodeId = null;
		} catch (e) {
			editError = e.message;
		} finally {
			savingEdit = false;
		}
	}

	// ── Delete node ──────────────────────────────────────────────────────────────
	async function deleteNode(id) {
		try {
			await api.hardwareNodes.delete(id);
			tree = await api.hardwareTrees.get(treeId);
			confirmDeleteNodeId = null;
		} catch (e) {
			error = e.message;
		}
	}

	// ── Collapse / expand all ───────────────────────────────────────────────────
	function collectParentIds(nodes, out = new Set()) {
		for (const n of nodes) {
			if (n.children?.length) {
				out.add(n.id);
				collectParentIds(n.children, out);
			}
		}
		return out;
	}

	function collapseAll() {
		const ids = collectParentIds(tree?.nodes ?? []);
		const next = {};
		for (const id of ids) next[id] = true;
		collapsed = next;
	}

	function expandAll() {
		collapsed = {};
	}

	// ── Copy tree ────────────────────────────────────────────────────────────────
	function openCopy() {
		copyForm  = { name: `${tree?.name ?? ''} (copy)`, model: tree?.model ?? '', software_version: '', version_to: '', notes: tree?.notes ?? '' };
		copying   = false;
		copyError = '';
		showCopy  = true;
	}

	async function submitCopy() {
		copyError = '';
		if (!copyForm.name.trim())             return (copyError = 'Name is required.');
		if (!copyForm.model.trim())            return (copyError = 'Machine model is required.');
		if (!copyForm.software_version.trim()) return (copyError = 'Software version is required.');
		copying = true;
		try {
			const newTree = await api.hardwareTrees.copy(treeId, {
				name:             copyForm.name,
				model:            copyForm.model,
				software_version: copyForm.software_version,
				version_to:       copyForm.version_to.trim() || null,
				notes:            copyForm.notes,
			});
			showCopy = false;
			window.location.href = `/hardware-tree/${newTree.id}`;
		} catch (e) {
			copyError = e.message;
		} finally {
			copying = false;
		}
	}

	// ── Import from Excel ─────────────────────────────────────────────────────────
	function openImport() {
		importFile   = null;
		importing    = false;
		importError  = '';
		importResult = null;
		showImport   = true;
	}

	async function submitImport() {
		if (!importFile) return (importError = 'Please select an Excel file.');
		importing = true;
		importError  = '';
		importResult = null;
		try {
			const { read, utils } = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
			const buf  = await importFile.arrayBuffer();
			const wb   = read(buf);
			const ws   = wb.Sheets[wb.SheetNames[0]];
			const rows = utils.sheet_to_json(ws, { defval: '' });

			if (!rows.length) return (importError = 'The file is empty or has no data rows.');

			// Expected columns: level, name, description, address_dec, address_hex
			// level 0 = top-level slot (root), 1 = child, 2 = grandchild, …
			const nodeStack = []; // stack of recently created node ids per level
			let created = 0;

			for (const row of rows) {
				const lvl  = parseInt(row['level'] ?? row['Level'] ?? 0, 10) || 0;
				const name = String(row['name'] ?? row['Name'] ?? '').trim();
				if (!name) continue;

				const desc    = String(row['description'] ?? row['Description'] ?? '').trim() || null;
				const addrDec = String(row['address_dec'] ?? row['Address Dec'] ?? '').trim();
				const addrHex = String(row['address_hex'] ?? row['Address Hex'] ?? '').trim();

				const parentId = lvl === 0 ? null : (nodeStack[lvl - 1] ?? null);

				// build body — note: null parent means top-level, must have address
				const body = {
					hardware_tree_id: treeId,
					parent_id:   parentId,
					name,
					description: desc,
					address_dec: addrDec !== '' ? parseInt(addrDec, 10) : null,
					address_hex: addrHex || null,
				};

				// Validate top-level address
				if (parentId === null && body.address_dec === null) {
					importError = `Row skipped: "${name}" is a top-level slot but has no decimal address.`;
					continue;
				}

				const node = await api.hardwareNodes.create(body);
				nodeStack[lvl] = node.id;
				// Clear deeper levels
				nodeStack.length = lvl + 1;
				created++;
			}

			tree = await api.hardwareTrees.get(treeId);
			importResult = `Successfully imported ${created} node${created !== 1 ? 's' : ''}.`;
		} catch (e) {
			importError = e.message;
		} finally {
			importing = false;
		}
	}
</script>

<svelte:head>
	<title>{tree ? `${tree.name} (${tree.model} v${tree.software_version}${tree.version_to ? ` – ${tree.version_to}` : '+'})` : 'Hardware Tree'} — Nilpeter Config Backup</title>
</svelte:head>

{#if loading}
	<div class="flex items-center justify-center py-24">
		<div class="h-8 w-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
	</div>
{:else if error}
	<div class="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">{error}</div>
{:else if tree}

<!-- ── Breadcrumb + header ─────────────────────────────────────────────────── -->
<div class="mb-8">
	<a href="/hardware-tree" class="text-sm text-slate-500 hover:text-slate-700 transition-colors">
		← Hardware Trees
	</a>
	<div class="mt-3 flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold text-slate-900">{tree.name}</h1>
			<p class="text-sm text-slate-500 mt-0.5">Model: <span class="font-medium text-slate-700">{tree.model}</span> · Version: <span class="font-medium text-slate-700">{tree.software_version}{tree.version_to ? ` – ${tree.version_to}` : '+'}</span></p>
			{#if tree.notes}
				<p class="text-sm text-slate-500 mt-1">{tree.notes}</p>
			{/if}
		</div>
		<div class="flex items-center gap-2">
			<button
				onclick={openImport}
				class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
				</svg>
				Import Excel
			</button>
			<button
				onclick={openCopy}
				class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
					<path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
					<path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
				</svg>
				Copy Tree
			</button>
			<button
				onclick={() => startAdd(null)}
				class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
				</svg>
				Add Slot
			</button>
		</div>
	</div>
</div>

<!-- ── Add root-level slot form ───────────────────────────────────────────── -->
{#if addingNode?.parentId === null}
	{@render nodeForm(null, true)}
{/if}

<!-- ── Tree ────────────────────────────────────────────────────────────────── -->
{#if tree.nodes.length === 0 && !addingNode}
	<div class="text-center py-16 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
		<svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1">
			<path stroke-linecap="round" stroke-linejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
		</svg>
		<p class="font-medium">No slots yet</p>
		<p class="text-sm mt-1">Click "Add Slot" above to start building the hardware tree.</p>
	</div>
{:else}
	<div class="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
		<!-- Table header -->
		<div class="flex items-center justify-between bg-slate-50 border-b border-slate-200 px-4 py-2">
			<div class="grid grid-cols-[auto_1fr_auto_auto] gap-0 text-xs font-semibold text-slate-500 uppercase tracking-wide flex-1">
				<div class="w-6"></div>
				<div>Name / Description</div>
				<div class="w-36 text-right pr-4">Dec</div>
				<div class="w-36 text-right pr-4">Hex</div>
			</div>
			<div class="flex items-center gap-1 ml-4 shrink-0">
				<button
					onclick={expandAll}
					class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
					title="Expand all nodes"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
					</svg>
					Expand all
				</button>
				<button
					onclick={collapseAll}
					class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
					title="Collapse all nodes"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clip-rule="evenodd" />
					</svg>
					Collapse all
				</button>
			</div>
		</div>
		<div class="divide-y divide-slate-100">
			{#each tree.nodes as node}
				{@render nodeRow(node, 0)}
			{/each}
		</div>
	</div>
{/if}

{/if}

<!-- ── Snippets ────────────────────────────────────────────────────────────── -->

{#snippet nodeRow(node, depth)}
	<!-- Node row -->
	{#if editingNodeId === node.id}
		<!-- Inline edit form -->
		<div class="px-4 py-3 bg-blue-50 border-l-4 border-blue-400" style="padding-left: {16 + depth * 28}px">
			{#if editError}
				<p class="text-xs text-red-600 mb-2">{editError}</p>
			{/if}
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
				<div>
					<label for={"edit-name-" + node.id} class="block text-xs font-medium text-slate-600 mb-1">Name *</label>
					<input
						id={"edit-name-" + node.id}
						bind:value={editValues.name}
						type="text"
						class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for={"edit-desc-" + node.id} class="block text-xs font-medium text-slate-600 mb-1">Description</label>
					<input
						id={"edit-desc-" + node.id}
						bind:value={editValues.description}
						type="text"
						class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for={"edit-addr-dec-" + node.id} class="block text-xs font-medium text-slate-600 mb-1">
						Address (decimal){node.parent_id === null ? ' *' : ''}
					</label>
					<input
						id={"edit-addr-dec-" + node.id}
						value={editValues.address_dec}
						oninput={(e) => onDecInput(editValues, 'address_dec', 'address_hex', e.target.value)}
						type="number"
						min="0"
						placeholder="e.g. 255"
						class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for={"edit-addr-hex-" + node.id} class="block text-xs font-medium text-slate-600 mb-1">Address (hex)</label>
					<div class="flex items-center">
						<span class="inline-flex items-center px-2.5 py-1.5 rounded-l-md border border-r-0 border-slate-300 bg-slate-100 text-xs text-slate-500">0x</span>
						<input
							id={"edit-addr-hex-" + node.id}
							value={editValues.address_hex}
							oninput={(e) => onHexInput(editValues, 'address_dec', 'address_hex', e.target.value)}
							type="text"
							placeholder="FF"
							class="flex-1 rounded-r-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
						/>
					</div>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<button
					onclick={() => submitEdit(node)}
					disabled={savingEdit}
					class="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-60"
				>
					{savingEdit ? 'Saving…' : 'Save'}
				</button>
				<button
					onclick={cancelEdit}
					class="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors"
				>
					Cancel
				</button>
			</div>
		</div>
	{:else}
		<div
			class="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-0 px-4 py-2.5 hover:bg-slate-50 transition-colors group"
			style="padding-left: {16 + depth * 28}px"
		>
			<!-- Collapse toggle -->
			<div class="w-6 flex items-center justify-center">
				{#if (node.children ?? []).length > 0}
					<button
						onclick={() => (collapsed[node.id] = !collapsed[node.id])}
						class="text-slate-400 hover:text-slate-700 transition-colors"
						aria-label={collapsed[node.id] ? 'Expand' : 'Collapse'}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 transition-transform {collapsed[node.id] ? '-rotate-90' : ''}" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
						</svg>
					</button>
				{:else}
					<span class="w-3.5 h-3.5 border-b border-l border-slate-200 rounded-bl ml-2 mb-2 block"></span>
				{/if}
			</div>

			<!-- Name + description -->
			<div class="min-w-0 pl-2">
				<p class="text-sm font-medium text-slate-900 truncate">
					{#if depth === 0}
						<span class="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5 align-middle"></span>
					{/if}
					{node.name}
				</p>
				{#if node.description}
					<p class="text-xs text-slate-400 truncate">{node.description}</p>
				{/if}
			</div>

			<!-- Address decimal -->
			<div class="w-36 text-right pr-4 text-sm text-slate-600 font-mono">
				{#if node.address_dec !== null}
					{node.address_dec}
				{:else}
					<span class="text-slate-300">—</span>
				{/if}
			</div>

			<!-- Address hex -->
			<div class="w-36 text-right pr-4 text-sm text-slate-500 font-mono">
				{#if node.address_hex}
					0x{node.address_hex}
				{:else if node.address_dec !== null}
					0x{decToHex(node.address_dec)}
				{:else}
					<span class="text-slate-300">—</span>
				{/if}
			</div>

			<!-- Actions -->
			<div class="w-24 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
				<!-- Add child -->
				<button
					onclick={() => startAdd(node.id)}
					title="Add child"
					class="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
					</svg>
				</button>
				<!-- Edit -->
				<button
					onclick={() => startEdit(node)}
					title="Edit"
					class="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
						<path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
					</svg>
				</button>
				<!-- Delete -->
				{#if confirmDeleteNodeId === node.id}
					<span class="text-xs text-slate-500">Delete?</span>
					<button onclick={() => deleteNode(node.id)} class="p-1 rounded text-red-600 hover:bg-red-50 transition-colors text-xs font-medium">Yes</button>
					<button onclick={() => (confirmDeleteNodeId = null)} class="p-1 rounded text-slate-500 hover:bg-slate-100 transition-colors text-xs font-medium">No</button>
				{:else}
					<button
						onclick={() => (confirmDeleteNodeId = node.id)}
						title="Delete"
						class="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
						</svg>
					</button>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Inline add-child form -->
	{#if addingNode?.parentId === node.id}
		{@render nodeForm(node.id, false)}
	{/if}

	<!-- Children (recursive) -->
	{#if !collapsed[node.id]}
		{#each (node.children ?? []) as child}
			{@render nodeRow(child, depth + 1)}
		{/each}
	{/if}
{/snippet}

{#snippet nodeForm(parentId, isRoot)}
	<div
		class="px-4 py-4 bg-blue-50 border-l-4 border-blue-400"
		style="padding-left: {isRoot ? 16 : 44}px"
	>
		<p class="text-xs font-semibold text-blue-700 mb-3">
			{isRoot ? 'New top-level slot' : 'New child node'}
		</p>
		{#if nodeError}
			<p class="text-xs text-red-600 mb-2">{nodeError}</p>
		{/if}
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
			<div>
					<label for={"new-name-" + (parentId ?? 'root')} class="block text-xs font-medium text-slate-600 mb-1">Name *</label>
					<input
						id={"new-name-" + (parentId ?? 'root')}
						bind:value={newNode.name}
						type="text"
						placeholder="e.g. CPU Module"
						class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
			</div>
			<div>
					<label for={"new-desc-" + (parentId ?? 'root')} class="block text-xs font-medium text-slate-600 mb-1">Description</label>
					<input
						id={"new-desc-" + (parentId ?? 'root')}
						bind:value={newNode.description}
						type="text"
						placeholder="Brief description"
						class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
			</div>
			<div>
					<label for={"new-addr-dec-" + (parentId ?? 'root')} class="block text-xs font-medium text-slate-600 mb-1">
						Address (decimal){isRoot ? ' *' : ''}
					</label>
					<input
						id={"new-addr-dec-" + (parentId ?? 'root')}
						value={newNode.address_dec}
						oninput={(e) => onDecInput(newNode, 'address_dec', 'address_hex', e.target.value)}
						type="number"
						min="0"
						placeholder="e.g. 255"
						class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
			</div>
			<div>
				<label for={"new-addr-hex-" + (parentId ?? 'root')} class="block text-xs font-medium text-slate-600 mb-1">Address (hex) — auto-fills</label>
				<div class="flex items-center">
					<span class="inline-flex items-center px-2.5 py-1.5 rounded-l-md border border-r-0 border-slate-300 bg-slate-100 text-xs text-slate-500">0x</span>
					<input
						id={"new-addr-hex-" + (parentId ?? 'root')}
						value={newNode.address_hex}
						oninput={(e) => onHexInput(newNode, 'address_dec', 'address_hex', e.target.value)}
						type="text"
						placeholder="FF"
						class="flex-1 rounded-r-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
					/>
				</div>
			</div>
		</div>
		<div class="flex items-center gap-2">
			<button
				onclick={submitAdd}
				disabled={savingNode}
				class="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-60"
			>
				{savingNode ? 'Saving…' : isRoot ? 'Add Slot' : 'Add Child'}
			</button>
			<button
				onclick={cancelAdd}
				class="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
			>
				Cancel
			</button>
		</div>
	</div>
{/snippet}

<!-- ── Copy modal ────────────────────────────────────────────────────────────── -->
{#if showCopy}
	<div
			class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
			onclick={(e) => { if (e.target === e.currentTarget) showCopy = false; }}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { if (e.target === e.currentTarget) showCopy = false; } if (e.key === 'Escape') showCopy = false; }}
			role="dialog" aria-modal="true" aria-label="Copy Hardware Tree" tabindex="-1"
		>
		<div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
			<h2 class="text-lg font-bold text-slate-900">Copy "{tree?.name}"</h2>
			<p class="text-sm text-slate-500">Duplicates all nodes to a new tree.</p>

			{#if copyError}
				<div class="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">{copyError}</div>
			{/if}

			<div>
				<label for="htid-copy-name" class="block text-sm font-medium text-slate-700 mb-1">New name <span class="text-red-500">*</span></label>
				<input id="htid-copy-name" bind:value={copyForm.name} type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
			</div>
			<div>
				<label for="htid-copy-model" class="block text-sm font-medium text-slate-700 mb-1">Machine model <span class="text-red-500">*</span></label>
				<input id="htid-copy-model" bind:value={copyForm.model} type="text" placeholder="e.g. NP-6600" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label for="htid-copy-version-from" class="block text-sm font-medium text-slate-700 mb-1">Version from <span class="text-red-500">*</span></label>
					<input id="htid-copy-version-from" bind:value={copyForm.software_version} type="text" placeholder="e.g. 4.3.0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
				</div>
				<div>
					<label for="htid-copy-version-to" class="block text-sm font-medium text-slate-700 mb-1">Version to <span class="font-normal text-slate-400">(optional)</span></label>
					<input id="htid-copy-version-to" bind:value={copyForm.version_to} type="text" placeholder="leave blank for open-ended" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
				</div>
			</div>
			<p class="text-xs text-slate-400 -mt-2">Leave "Version to" blank for an open-ended range.</p>
			<div>
				<label for="htid-copy-notes" class="block text-sm font-medium text-slate-700 mb-1">Notes <span class="font-normal text-slate-400">(optional)</span></label>
				<textarea id="htid-copy-notes" bind:value={copyForm.notes} rows="2" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"></textarea>
			</div>

			<div class="flex justify-end gap-3 pt-1">
				<button onclick={() => (showCopy = false)} class="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
					Cancel
				</button>
				<button
					onclick={submitCopy}
					disabled={copying}
					class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
				>
					{copying ? 'Copying…' : 'Copy & Open'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- ── Import modal ───────────────────────────────────────────────────────────── -->
{#if showImport}
	<div
			class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
			onclick={(e) => { if (e.target === e.currentTarget) showImport = false; }}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { if (e.target === e.currentTarget) showImport = false; } if (e.key === 'Escape') showImport = false; }}
			role="dialog" aria-modal="true" aria-label="Import from Excel" tabindex="-1"
		>
		<div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5">
			<h2 class="text-lg font-bold text-slate-900">Import from Excel</h2>

			<!-- Format reference -->
			<div class="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
				<p class="font-semibold text-slate-700 mb-1">Expected column format (row 1 = headers):</p>
				<div class="overflow-x-auto">
					<table class="text-xs border-collapse w-full">
						<thead>
							<tr class="bg-slate-200">
								<th class="border border-slate-300 px-2 py-1">level</th>
								<th class="border border-slate-300 px-2 py-1">name</th>
								<th class="border border-slate-300 px-2 py-1">description</th>
								<th class="border border-slate-300 px-2 py-1">address_dec</th>
								<th class="border border-slate-300 px-2 py-1">address_hex</th>
							</tr>
						</thead>
						<tbody>
							<tr><td class="border border-slate-300 px-2 py-1">0</td><td class="border border-slate-300 px-2 py-1">CPU Module</td><td class="border border-slate-300 px-2 py-1">Main board</td><td class="border border-slate-300 px-2 py-1">1</td><td class="border border-slate-300 px-2 py-1">01</td></tr>
							<tr><td class="border border-slate-300 px-2 py-1">1</td><td class="border border-slate-300 px-2 py-1">Sub-unit A</td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1"></td></tr>
							<tr><td class="border border-slate-300 px-2 py-1">2</td><td class="border border-slate-300 px-2 py-1">Deep chip</td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1">255</td><td class="border border-slate-300 px-2 py-1">FF</td></tr>
							<tr><td class="border border-slate-300 px-2 py-1">0</td><td class="border border-slate-300 px-2 py-1">I/O Module</td><td class="border border-slate-300 px-2 py-1"></td><td class="border border-slate-300 px-2 py-1">2</td><td class="border border-slate-300 px-2 py-1">02</td></tr>
						</tbody>
					</table>
				</div>
				<p class="mt-1 text-slate-500">level 0 = top-level slot (address required). Deeper levels are children of the nearest previous shallower row. Nodes will be appended to existing tree.</p>
			</div>

			{#if importError}
				<div class="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{importError}</div>
			{/if}
			{#if importResult}
				<div class="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">{importResult}</div>
			{/if}

			<div>
				<label class="block text-sm font-medium text-slate-700 mb-1">Excel file (.xlsx / .xls)</label>
				<input
					type="file"
					accept=".xlsx,.xls"
					onchange={(e) => (importFile = e.target.files?.[0] ?? null)}
					class="block w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
				/>
			</div>

			<div class="flex justify-end gap-3 pt-1">
				<button onclick={() => (showImport = false)} class="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
					{importResult ? 'Close' : 'Cancel'}
				</button>
				{#if !importResult}
					<button
						onclick={submitImport}
						disabled={importing || !importFile}
						class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
					>
						{importing ? 'Importing…' : 'Import'}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
