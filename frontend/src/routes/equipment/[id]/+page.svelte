<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { api } from '$lib/api.js';

	const equipmentId = $derived($page.params.id);

	// ── Equipment state ───────────────────────────────────────────────────────
	let equipment = $state(null);
	let loading = $state(true);
	let error = $state('');

	// ── Version state ─────────────────────────────────────────────────────────
	let versions = $state([]);
	let selectedVersionId = $state(null);
	let showAddVersion = $state(false);
	let versionForm = $state({ version: '', notes: '' });
	let savingVersion = $state(false);

	// ── Slot state ────────────────────────────────────────────────────────────────
	let addingSlot = $state(false);
	let newSlotName = $state('');
	let savingSlot = $state(false);
	let uploadingSlotId = $state(null);
	let renamingSlotId = $state(null);
	let renameValue = $state('');
	let confirmDeleteSlotId = $state(null);
	let lightboxSlot = $state(null); // slot object shown in lightbox

	// ── Derived ─────────────────────────────────────────────────────────────────
	const selectedVersion = $derived(versions.find(v => v.id === selectedVersionId) ?? null);

	// ── Linked hardware tree ──────────────────────────────────────────────────
	let linkedTree = $state(null);
	$effect(() => {
		if (equipment?.model && selectedVersion?.version) {
			api.equipment.getHardwareTree(equipmentId, selectedVersion.version)
				.then(t => (linkedTree = t))
				.catch(() => (linkedTree = null));
		} else {
			linkedTree = null;
		}
	});

	// ── Backup state ────────────────────────────────────────────────────────────────
	let backups = $state({}); // { originalName: [file, ...] }
	let expandedOldFiles = $state({}); // { originalName: bool }
	let uploading = $state(false);
	let uploadError = $state('');

	// ── Toast ─────────────────────────────────────────────────────────────────
	let toast = $state({ show: false, msg: '', ok: true });

	function showToast(msg, ok = true) {
		toast = { show: true, msg, ok };
		setTimeout(() => (toast.show = false), 3000);
	}

	// ── Helpers ───────────────────────────────────────────────────────────────
	function formatDate(dateStr) {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function formatBytes(bytes) {
		if (!bytes) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	// ── Data loading ──────────────────────────────────────────────────────────
	async function loadAll() {
		const [eq, bkps] = await Promise.all([
			api.equipment.get(equipmentId),
			api.equipment.getBackups(equipmentId)
		]);
		equipment = eq;
		versions = eq.versions ?? [];
		backups = bkps;
		if (versions.length > 0 && selectedVersionId === null) {
			selectedVersionId = versions[0].id;
		}
	}

	onMount(async () => {
		try {
			await loadAll();
		} catch (e) {
			error = e.message;
		} finally {
			loading = false;
		}
	});

	// ── Software version ──────────────────────────────────────────────────────
	async function addVersion() {
		if (!versionForm.version.trim()) return;
		savingVersion = true;
		try {
			const v = await api.equipment.addVersion(equipmentId, versionForm);
			versions = [{ ...v, slots: [] }, ...versions];
			selectedVersionId = v.id;
			equipment.current_version = v.version;
			versionForm = { version: '', notes: '' };
			showAddVersion = false;
			showToast('Version logged');
		} catch (e) {
			showToast(e.message, false);
		} finally {
			savingVersion = false;
		}
	}

	// ── Backup upload ─────────────────────────────────────────────────────────
	async function handleFileUpload(event) {
		const files = event.target.files;
		if (!files?.length) return;
		uploading = true;
		uploadError = '';
		try {
			for (const file of files) {
				const fd = new FormData();
				fd.append('file', file);
				await api.backups.upload(equipmentId, fd);
			}
			// Reload backups
			backups = await api.equipment.getBackups(equipmentId);
			// Reload equipment to get updated last_backup
			equipment = await api.equipment.get(equipmentId);
			showToast(`${files.length} file(s) uploaded`);
		} catch (e) {
			uploadError = e.message;
			showToast(e.message, false);
		} finally {
			uploading = false;
			event.target.value = '';
		}
	}

	async function deleteBackup(id, originalName) {
		try {
			await api.backups.delete(id);
			backups = await api.equipment.getBackups(equipmentId);
			showToast('Backup deleted');
		} catch (e) {
			showToast(e.message, false);
		}
	}

	// ── Slot management ───────────────────────────────────────────────────────────────
	async function addSlot() {
		if (!newSlotName.trim() || !selectedVersionId) return;
		savingSlot = true;
		try {
			const slot = await api.slots.create({ software_version_id: selectedVersionId, name: newSlotName.trim() });
			versions = versions.map(v =>
				v.id === selectedVersionId
					? { ...v, slots: [...(v.slots ?? []), slot] }
					: v
			);
			newSlotName = '';
			addingSlot = false;
		} catch (e) {
			showToast(e.message, false);
		} finally {
			savingSlot = false;
		}
	}

	async function uploadSlotImage(slotId, file) {
		uploadingSlotId = slotId;
		try {
			const fd = new FormData();
			fd.append('image', file);
			const updated = await api.slots.uploadImage(slotId, fd);
			versions = versions.map(v => ({
				...v,
				slots: v.slots.map(s => s.id === slotId ? { ...s, ...updated } : s)
			}));
		} catch (e) {
			showToast(e.message, false);
		} finally {
			uploadingSlotId = null;
		}
	}

	async function confirmRenameSlot(slotId) {
		if (!renameValue.trim()) { renamingSlotId = null; return; }
		try {
			await api.slots.update(slotId, { name: renameValue.trim() });
			versions = versions.map(v => ({
				...v,
				slots: v.slots.map(s => s.id === slotId ? { ...s, name: renameValue.trim() } : s)
			}));
			renamingSlotId = null;
		} catch (e) {
			showToast(e.message, false);
		}
	}

	async function deleteSlot(slotId) {
		try {
			await api.slots.delete(slotId);
			versions = versions.map(v => ({
				...v,
				slots: v.slots.filter(s => s.id !== slotId)
			}));
			confirmDeleteSlotId = null;
		} catch (e) {
			showToast(e.message, false);
		}
	}

</script>

<!-- Toast -->
{#if toast.show}
	<div
		class="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
		       {toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}"
	>
		{toast.msg}
	</div>
{/if}

{#if loading}
	<div class="flex justify-center py-20">
		<div class="h-9 w-9 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
	</div>
{:else if error}
	<div class="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">{error}</div>
{:else if equipment}
	<!-- ── Lightbox ──────────────────────────────────────────────────────────── -->
	{#if lightboxSlot}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6"
			role="dialog"
			aria-modal="true"
			aria-label="Image preview"
			tabindex="-1"
			onclick={() => (lightboxSlot = null)}
			onkeydown={(e) => { if (e.key === 'Escape') lightboxSlot = null; }}
		>
			<button
				class="absolute top-4 right-4 p-2 text-white/80 hover:text-white transition-colors"
				onclick={() => (lightboxSlot = null)}
				aria-label="Close"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
			<button
				type="button"
				class="max-w-full max-h-full p-0 bg-transparent border-0"
				onclick={(e) => e.stopPropagation()}
				aria-label={`Image preview: ${lightboxSlot.name}`}
			>
				<img
					src={api.slots.imageUrl(lightboxSlot.id)}
					alt={lightboxSlot.name}
					class="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
				/>
			</button>
			{#if lightboxSlot.name}
				<p class="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium">{lightboxSlot.name}</p>
			{/if}
		</div>
	{/if}

	<div class="space-y-8">
		<!-- ── Breadcrumb + header ──────────────────────────────────────────── -->
		<div>
			<a href="/" class="text-sm text-slate-500 hover:text-slate-700 transition-colors">
				← Equipment
			</a>
			<div class="flex items-start justify-between mt-2">
				<div>
					<h1 class="text-2xl font-bold text-slate-900">{equipment.name}</h1>
					{#if equipment.description}
						<p class="text-sm text-slate-500 mt-1">{equipment.description}</p>
					{/if}
				</div>
				<a
					href="/settings#edit-{equipment.id}"
					onclick={(e) => {
						e.preventDefault();
						window.location.href = '/settings';
					}}
					class="text-sm px-3 py-1.5 rounded-lg font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
				>
					Edit in Settings
				</a>
			</div>
		</div>

		<!-- ── Versions & Slots ─────────────────────────────────────────────── -->
		<div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
			<div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
				<h2 class="text-base font-semibold text-slate-800">Versions &amp; Slots</h2>
				{#if !showAddVersion}
					<button
						onclick={() => (showAddVersion = true)}
						class="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
						</svg>
						Add version
					</button>
				{/if}
			</div>

			<!-- Add version form -->
			{#if showAddVersion}
				<div class="px-5 py-4 bg-slate-50 border-b border-slate-200">
					<div class="flex gap-3 items-end">
						<div class="flex-1">
							<label for="v-version" class="block text-xs font-medium text-slate-600 mb-1">
								Version <span class="text-red-500">*</span>
							</label>
							<input
								id="v-version"
								bind:value={versionForm.version}
								type="text"
								placeholder="e.g. 3.5.1"
								class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>
						<div class="flex-1">
							<label for="v-notes" class="block text-xs font-medium text-slate-600 mb-1">Notes</label>
							<input
								id="v-notes"
								bind:value={versionForm.notes}
								type="text"
								placeholder="Optional notes"
								class="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>
						<button
							onclick={addVersion}
							disabled={savingVersion || !versionForm.version.trim()}
							class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
						>
							{savingVersion ? 'Saving…' : 'Log version'}
						</button>
						<button
							onclick={() => { showAddVersion = false; versionForm = { version: '', notes: '' }; }}
							class="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
						>
							Cancel
						</button>
					</div>
				</div>
			{/if}

			{#if versions.length === 0}
				<p class="px-5 py-8 text-sm text-slate-400 text-center">
					No software versions yet. Click "Add version" to get started.
				</p>
			{:else}
				<!-- Version tabs -->
				<div class="flex items-center gap-1.5 px-5 pt-4 pb-3 flex-wrap border-b border-slate-100">
					{#each versions as v}
						<button
							onclick={() => (selectedVersionId = v.id)}
							class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors
							       {selectedVersionId === v.id
							       	? 'bg-blue-600 text-white shadow-sm'
							       	: 'bg-slate-100 text-slate-600 hover:bg-slate-200'}"
						>
							{v.version}
						</button>
					{/each}
				</div>

				<!-- Slot cards for selected version -->
				{#if selectedVersion}
					{#if linkedTree}
						<div class="mx-5 mt-3 flex items-center justify-between rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm">
							<span class="text-blue-800">Hardware tree: <strong>{linkedTree.name}</strong></span>
							<a href="/hardware-tree/{linkedTree.id}" class="text-blue-600 font-medium hover:underline">View Tree →</a>
						</div>
					{/if}
					<div class="p-5">
						{#if !selectedVersion.slots?.length && !addingSlot}
							<p class="text-sm text-slate-400 mb-4">No slots yet for this version.</p>
						{:else}
							<div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
								{#each (selectedVersion.slots ?? []) as slot}
									<div class="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
										<!-- Image area -->
										{#if slot.image_stored_name}
										<div class="relative aspect-video bg-slate-100 overflow-hidden group">
											<button
												type="button"
												class="w-full h-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
												onclick={() => (lightboxSlot = slot)}
												aria-label={`View ${slot.name} full size`}
											>
												<img
													src={api.slots.imageUrl(slot.id)}
													alt={slot.name}
													class="w-full h-full object-cover"
												/>
											</button>
											{#if uploadingSlotId === slot.id}
												<div class="absolute inset-0 bg-white/70 flex items-center justify-center">
													<div class="h-6 w-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
												</div>
											{/if}
											<label class="absolute bottom-2 right-2 cursor-pointer inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md font-medium bg-white/90 text-slate-700 hover:bg-white shadow transition-colors">
												Replace
												<input
													type="file"
													accept="image/*"
													class="sr-only"
													onchange={(e) => { if (e.target.files?.[0]) uploadSlotImage(slot.id, e.target.files[0]); e.target.value = ''; }}
												/>
											</label>
										</div>
										{:else}
											<label
												class="flex flex-col items-center justify-center gap-2 aspect-video cursor-pointer
												       bg-slate-50 hover:bg-slate-100 transition-colors
												       {uploadingSlotId === slot.id ? 'pointer-events-none' : ''}"
											>
												{#if uploadingSlotId === slot.id}
													<div class="h-6 w-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
												{:else}
													<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-slate-300" viewBox="0 0 20 20" fill="currentColor">
														<path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clip-rule="evenodd" />
													</svg>
													<span class="text-xs text-slate-400">Click to upload</span>
												{/if}
												<input
													type="file"
													accept="image/*"
													class="sr-only"
													onchange={(e) => { if (e.target.files?.[0]) uploadSlotImage(slot.id, e.target.files[0]); e.target.value = ''; }}
												/>
											</label>
										{/if}
										<!-- Slot footer: name + actions -->
										<div class="px-3 py-2.5">
											{#if renamingSlotId === slot.id}
												<div class="flex gap-1.5">
													<input
														bind:value={renameValue}
														type="text"
														class="flex-1 px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
														onkeydown={(e) => { if (e.key === 'Enter') confirmRenameSlot(slot.id); if (e.key === 'Escape') renamingSlotId = null; }}
													/>
													<button onclick={() => confirmRenameSlot(slot.id)} class="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">✓</button>
													<button onclick={() => (renamingSlotId = null)} class="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors">✕</button>
												</div>
											{:else}
												<div class="flex items-center justify-between gap-2">
													<span class="text-sm font-medium text-slate-800 truncate">{slot.name}</span>
													<div class="flex items-center gap-1 shrink-0">
														{#if confirmDeleteSlotId === slot.id}
															<span class="text-xs text-slate-500">Delete?</span>
															<button onclick={() => deleteSlot(slot.id)} class="text-xs px-1.5 py-0.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">Yes</button>
															<button onclick={() => (confirmDeleteSlotId = null)} class="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors">No</button>
														{:else}
															<button
																onclick={() => { renamingSlotId = slot.id; renameValue = slot.name; }}
																class="text-slate-400 hover:text-blue-600 transition-colors p-0.5"
																title="Rename"
															>
																<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
																	<path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
																</svg>
															</button>
															<button
																onclick={() => (confirmDeleteSlotId = slot.id)}
																class="text-slate-400 hover:text-red-500 transition-colors p-0.5"
																title="Delete"
															>
																<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
																	<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
																</svg>
															</button>
														{/if}
													</div>
												</div>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
						<!-- Add slot area -->
						{#if addingSlot}
							<div class="flex gap-2 items-center">
								<input
									bind:value={newSlotName}
									type="text"
									placeholder="New slot name"
									class="flex-1 px-3 py-2 border border-blue-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
									onkeydown={(e) => { if (e.key === 'Enter') addSlot(); if (e.key === 'Escape') { addingSlot = false; newSlotName = ''; } }}
								/>
								<button
									onclick={addSlot}
									disabled={savingSlot || !newSlotName.trim()}
									class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
								>
									{savingSlot ? 'Adding…' : 'Add'}
								</button>
								<button
									onclick={() => { addingSlot = false; newSlotName = ''; }}
									class="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
								>
									Cancel
								</button>
							</div>
						{:else}
							<button
								onclick={() => (addingSlot = true)}
								class="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors border border-dashed border-slate-300 hover:border-blue-400 px-4 py-2 rounded-lg"
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
								</svg>
								Add slot
							</button>
						{/if}
					</div>
				{/if}
			{/if}
		</div>

		<!-- ── Backup Files ──────────────────────────────────────────────────── -->
		<div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
			<div class="flex items-center justify-between px-5 py-4 border-b border-slate-100">
				<h2 class="text-base font-semibold text-slate-800">Backup Files</h2>
				<label
					class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer shadow-sm {uploading
						? 'opacity-60 pointer-events-none'
						: ''}"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
							clip-rule="evenodd"
						/>
					</svg>
					{uploading ? 'Uploading…' : 'Upload backup'}
					<input
						type="file"
						class="sr-only"
						multiple
						onchange={handleFileUpload}
						disabled={uploading}
					/>
				</label>
			</div>

			<div class="px-5 py-4">
				{#if uploadError}
					<div class="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
						{uploadError}
					</div>
				{/if}

				{#if Object.keys(backups).length === 0}
					<p class="text-sm text-slate-400">No backup files uploaded yet.</p>
				{:else}
					<div class="space-y-3">
						{#each Object.entries(backups) as [filename, files]}
							{@const current = files[0]}
							{@const older = files.slice(1)}
							<div class="border border-slate-200 rounded-lg overflow-hidden">
								<!-- Current file -->
								<div class="flex items-center gap-4 px-4 py-3 bg-slate-50">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5 text-blue-500 shrink-0"
										viewBox="0 0 20 20"
										fill="currentColor"
									>
										<path
											fill-rule="evenodd"
											d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
											clip-rule="evenodd"
										/>
									</svg>
									<div class="flex-1 min-w-0">
										<p class="text-sm font-medium text-slate-800 truncate">{filename}</p>
										<p class="text-xs text-slate-400">
											{formatDate(current.uploaded_at)}
											{#if current.size_bytes}
												· {formatBytes(current.size_bytes)}
											{/if}
										</p>
									</div>
									<div class="flex items-center gap-2 shrink-0">
										<span
											class="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700"
										>
											Current
										</span>
										<a
											href={api.backups.downloadUrl(current.id)}
											download
											class="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-3.5 w-3.5"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													fill-rule="evenodd"
													d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-6.707a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L8.586 10 5.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414z"
													clip-rule="evenodd"
												/>
											</svg>
											Download
										</a>
										<button
											onclick={() => deleteBackup(current.id, filename)}
											class="text-slate-400 hover:text-red-500 transition-colors p-0.5"
											title="Delete this backup"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													fill-rule="evenodd"
													d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
													clip-rule="evenodd"
												/>
											</svg>
										</button>
									</div>
								</div>

								<!-- Older versions -->
								{#if older.length > 0}
									<div class="border-t border-slate-100">
										<button
											onclick={() =>
												(expandedOldFiles[filename] = !expandedOldFiles[filename])}
											class="w-full flex items-center gap-2 px-4 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-3.5 w-3.5 transition-transform {expandedOldFiles[filename]
													? 'rotate-90'
													: ''}"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													fill-rule="evenodd"
													d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
													clip-rule="evenodd"
												/>
											</svg>
											{older.length} older version{older.length !== 1 ? 's' : ''}
										</button>
										{#if expandedOldFiles[filename]}
											<div class="divide-y divide-slate-50">
												{#each older as oldFile}
													<div class="flex items-center gap-4 px-4 py-2.5 pl-8">
														<div class="flex-1 min-w-0">
															<p class="text-xs text-slate-500">
																{formatDate(oldFile.uploaded_at)}
																{#if oldFile.size_bytes}
																	· {formatBytes(oldFile.size_bytes)}
																{/if}
															</p>
														</div>
														<div class="flex items-center gap-2 shrink-0">
															<a
																href={api.backups.downloadUrl(oldFile.id)}
																download
																class="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
															>
																Download
															</a>
															<button
																onclick={() => deleteBackup(oldFile.id, filename)}
																class="text-slate-400 hover:text-red-500 transition-colors p-0.5"
																title="Delete"
															>
																<svg
																	xmlns="http://www.w3.org/2000/svg"
																	class="h-3.5 w-3.5"
																	viewBox="0 0 20 20"
																	fill="currentColor"
																>
																	<path
																		fill-rule="evenodd"
																		d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
																		clip-rule="evenodd"
																	/>
																</svg>
															</button>
														</div>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
