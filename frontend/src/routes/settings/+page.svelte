<script>
	import { onMount } from 'svelte';
	import { api } from '$lib/api.js';

	// ── State ─────────────────────────────────────────────────────────────────
	let equipment = $state([]);
	let loading = $state(true);
	let saving = $state(false);
	let toast = $state({ show: false, msg: '', ok: true });
	let activePanel = $state(null); // 'add' | 'created' | {id} | null
	let form = $state({ name: '', model: '', description: '' });
	let confirmDeleteId = $state(null);
	let createdId = $state(null);

	// ── Helpers ───────────────────────────────────────────────────────────────
	function showToast(msg, ok = true) {
		toast = { show: true, msg, ok };
		setTimeout(() => (toast.show = false), 3500);
	}

	// ── Data loading ─────────────────────────────────────────────────────────
	async function loadEquipment() {
		equipment = await api.equipment.list();
	}

	onMount(async () => {
		try {
			await loadEquipment();
		} catch (e) {
			showToast(e.message, false);
		} finally {
			loading = false;
		}
	});

	// ── Panel management ──────────────────────────────────────────────────────
	function openAdd() {
		form = { name: '', model: '', description: '' };
		createdId = null;
		activePanel = 'add';
	}

	async function openEdit(id) {
		try {
			saving = true;
			const eq = await api.equipment.get(id);
			form = { name: eq.name, model: eq.model ?? '', description: eq.description ?? '' };
			createdId = null;
			activePanel = id;
		} catch (e) {
			showToast(e.message, false);
		} finally {
			saving = false;
		}
	}

	function closePanel() {
		activePanel = null;
		createdId = null;
		form = { name: '', description: '' };
	}

	// ── Save ──────────────────────────────────────────────────────────────────
	async function saveEquipment() {
		if (!form.name.trim()) {
			showToast('Name is required', false);
			return;
		}
		saving = true;
		try {
			if (activePanel === 'add') {
				const eq = await api.equipment.create({ name: form.name, model: form.model, description: form.description });
				createdId = eq.id;
				showToast(`"${eq.name}" created — add a software version and slots on the equipment page`);
				await loadEquipment();
				activePanel = 'created';
			} else {
				await api.equipment.update(activePanel, { name: form.name, model: form.model, description: form.description });
				showToast(`"${form.name}" updated`);
				await loadEquipment();
				closePanel();
			}
		} catch (e) {
			showToast(e.message, false);
		} finally {
			saving = false;
		}
	}

	// ── Copy / Delete ─────────────────────────────────────────────────────────
	async function copyEquipment(eq) {
		const name = `${eq.name} (copy)`;
		try {
			await api.equipment.copy(eq.id, { name, description: eq.description });
			await loadEquipment();
			showToast(`"${name}" created`);
		} catch (e) {
			showToast(e.message, false);
		}
	}

	// ── Delete equipment ──────────────────────────────────────────────────────
	async function deleteEquipment(id) {
		try {
			await api.equipment.delete(id);
			if (activePanel === id) closePanel();
			await loadEquipment();
			showToast('Equipment deleted');
		} catch (e) {
			showToast(e.message, false);
		} finally {
			confirmDeleteId = null;
		}
	}
</script>

<!-- ── Toast ─────────────────────────────────────────────────────────────── -->
{#if toast.show}
	<div
		class="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all
		       {toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}"
	>
		{toast.msg}
	</div>
{/if}

<div class="space-y-8">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-slate-900">Settings</h1>
			<p class="text-sm text-slate-500 mt-0.5">Manage equipment. Software versions and slots are managed on each equipment page.</p>
		</div>
		{#if activePanel === null}
			<button
				onclick={openAdd}
				class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
					<path
						fill-rule="evenodd"
						d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
						clip-rule="evenodd"
					/>
				</svg>
				New Equipment
			</button>
		{/if}
	</div>

	<!-- ── Equipment Form Panel ─────────────────────────────────────────────── -->
	{#if activePanel !== null}
		<div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
			<!-- Panel header -->
			<div class="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
				<h2 class="text-base font-semibold text-slate-800">
					{activePanel === 'add' || activePanel === 'created' ? 'New Equipment' : 'Edit Equipment'}
				</h2>
				<button
					onclick={closePanel}
					class="text-slate-400 hover:text-slate-600 transition-colors"
					aria-label="Close"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
						<path
							fill-rule="evenodd"
							d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>
			</div>

			<div class="p-6 space-y-5">
				{#if activePanel === 'created' && createdId}
					<!-- Success state after creation -->
					<div class="rounded-lg bg-green-50 border border-green-200 p-4 flex items-start gap-3">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-600 mt-0.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
						</svg>
						<div>
							<p class="text-sm font-medium text-green-800">Equipment created!</p>
							<p class="text-sm text-green-700 mt-0.5">
								Next: go to the equipment page to add a software version and upload slot pictures.
							</p>
							<a
								href="/equipment/{createdId}"
								class="inline-flex items-center gap-1 mt-2 text-sm font-medium text-blue-700 hover:text-blue-800 transition-colors"
							>
								Go to {form.name}
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" />
								</svg>
							</a>
						</div>
					</div>
					<div class="flex justify-end">
						<button onclick={closePanel} class="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
							Close
						</button>
					</div>
				{:else}
					<!-- Create / Edit form -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div>
							<label class="block text-xs font-medium text-slate-600 mb-1" for="eq-name">
								Name <span class="text-red-500">*</span>
							</label>
							<input
								id="eq-name"
								bind:value={form.name}
								type="text"
								placeholder="e.g. Router-001"
								class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>
						<div>
							<label class="block text-xs font-medium text-slate-600 mb-1" for="eq-model">Model</label>
							<input
								id="eq-model"
								bind:value={form.model}
								type="text"
								placeholder="e.g. NP-6600"
								class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>
						<div class="sm:col-span-2">
							<label class="block text-xs font-medium text-slate-600 mb-1" for="eq-desc">Description</label>
							<input
								id="eq-desc"
								bind:value={form.description}
								type="text"
								placeholder="Optional description"
								class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>
					</div>

					<div class="flex justify-end gap-3 pt-1 border-t border-slate-100">
						<button
							onclick={closePanel}
							class="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
						>
							Cancel
						</button>
						<button
							onclick={saveEquipment}
							disabled={saving}
							class="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
						>
							{saving ? 'Saving…' : activePanel === 'add' ? 'Create Equipment' : 'Save Changes'}
						</button>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- ── Equipment List ─────────────────────────────────────────────────── -->
	<div>
		<h2 class="text-base font-semibold text-slate-700 mb-3">All Equipment</h2>

		{#if loading}
			<div class="flex justify-center py-10">
				<div class="h-7 w-7 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
			</div>
		{:else if equipment.length === 0}
			<div class="text-center py-12 text-slate-400 text-sm">
				No equipment yet. Click "New Equipment" to get started.
			</div>
		{:else}
			<div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
				<table class="w-full text-sm">
					<thead>
						<tr class="bg-slate-50 border-b border-slate-200">
							<th class="text-left px-5 py-3 font-medium text-slate-500">Name</th>					<th class="text-left px-5 py-3 font-medium text-slate-500">Model</th>							<th class="text-left px-5 py-3 font-medium text-slate-500">Description</th>
							<th class="text-left px-5 py-3 font-medium text-slate-500 w-36">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-100">
						{#each equipment as eq}
							<tr class="transition-colors {activePanel === eq.id ? 'bg-blue-50' : 'hover:bg-slate-50'}">
								<td class="px-5 py-3">
									<a href="/equipment/{eq.id}" class="font-medium text-slate-900 hover:text-blue-700 transition-colors">{eq.name}</a>
								</td>
								<td class="px-5 py-3 text-slate-500">{eq.description ?? '—'}</td>
								<td class="px-5 py-3">
									<div class="flex items-center gap-2">
										<button
											onclick={() => openEdit(eq.id)}
											class="text-xs px-2.5 py-1 rounded-md font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
										>
											Edit
										</button>
										<button
											onclick={() => copyEquipment(eq)}
											class="text-xs px-2.5 py-1 rounded-md font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
											title="Duplicate this equipment"
										>

											Copy
										</button>
										{#if confirmDeleteId === eq.id}
											<span class="text-xs text-slate-500">Sure?</span>
											<button
												onclick={() => deleteEquipment(eq.id)}
												class="text-xs px-2 py-1 rounded-md font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
											>
												Yes
											</button>
											<button
												onclick={() => (confirmDeleteId = null)}
												class="text-xs px-2 py-1 rounded-md text-slate-500 hover:text-slate-700"
											>
												No
											</button>
										{:else}
											<button
												onclick={() => (confirmDeleteId = eq.id)}
												class="text-xs px-2.5 py-1 rounded-md font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
											>
												Delete
											</button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
