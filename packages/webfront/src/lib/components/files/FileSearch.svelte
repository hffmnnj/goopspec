<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Search01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';

	interface FileSearchProps {
		/** Current search query value. */
		value?: string;
		/** Called when the query changes. */
		onchange?: (query: string) => void;
		/** Optional ARIA label; defaults to "Search files". */
		label?: string;
		/** Input placeholder text. */
		placeholder?: string;
	}

	let {
		value = $bindable(''),
		onchange,
		label = 'Search files',
		placeholder = 'Search files'
	}: FileSearchProps = $props();

	const hasValue = $derived(value.length > 0);

	function handleInput(event: Event & { currentTarget: HTMLInputElement }): void {
		value = event.currentTarget.value;
		onchange?.(value);
	}

	function clear(): void {
		value = '';
		onchange?.('');
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && hasValue) {
			event.preventDefault();
			clear();
		}
	}
</script>

<div class="file-search" role="search">
	<label class="search-field" aria-label={label}>
		<span class="icon" aria-hidden="true">
			<HugeiconsIcon icon={Search01Icon} size={14} strokeWidth={1.5} color="currentColor" />
		</span>
		<input
			class="input"
			type="search"
			aria-label={label}
			{placeholder}
			value={value}
			oninput={handleInput}
			onkeydown={onKeydown}
		/>
		{#if hasValue}
			<button
				type="button"
				class="clear"
				aria-label="Clear search"
				title="Clear search"
				onclick={clear}
			>
				<HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} color="currentColor" />
			</button>
		{/if}
	</label>
</div>

<style>
	.file-search {
		padding: 0.25rem 0.5rem;
	}

	.search-field {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background-color: var(--bg-elevated);
		color: var(--text-secondary);
		transition:
			border-color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.search-field:focus-within {
		border-color: var(--focus-ring);
		background-color: var(--bg-base);
		color: var(--text-primary);
	}

	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
	}

	.input {
		flex: 1 1 auto;
		min-width: 0;
		border: none;
		background: transparent;
		font: inherit;
		font-size: 0.8125rem;
		color: var(--text-primary);
		outline: none;
	}

	.input::placeholder {
		color: var(--text-muted);
	}

	.clear {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		width: 1.25rem;
		height: 1.25rem;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.clear:hover {
		color: var(--text-primary);
		background-color: var(--bg-surface);
	}

	.clear:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}

	@media (prefers-reduced-motion: reduce) {
		.search-field,
		.clear {
			transition: none;
		}
	}
</style>
