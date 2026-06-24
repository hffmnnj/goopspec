<script lang="ts">
  import { HugeiconsIcon } from '@hugeicons/svelte';
  import { Loading03Icon } from '@hugeicons/core-free-icons';
</script>

<section class="grid min-h-screen place-items-center px-6">
  <div class="flex items-center gap-3 rounded-[var(--radius)] border border-white/10 bg-white/[0.03] px-5 py-4 shadow-2xl shadow-black/20">
    <HugeiconsIcon
      icon={Loading03Icon}
      size={24}
      color="currentColor"
      strokeWidth={1.5}
      class="animate-spin text-[var(--accent)]"
      aria-hidden="true"
    />
    <p class="text-sm font-medium tracking-[-0.01em]">GoopSpec — loading...</p>
  </div>
</section>
