<script setup>
defineProps({ on: Boolean, disabled: Boolean, label: { type: String, default: '' } });
defineEmits(['toggle']);
</script>
<template>
  <button class="sw" :class="{ on }" :disabled="disabled" @click="$emit('toggle')"><i />{{ label || (on ? 'ON' : 'OFF') }}</button>
</template>
<style scoped>
.sw { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border-radius: 14px; background: var(--btn); border: 1px solid var(--line); color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .06em; }
.sw i { width: 8px; height: 8px; border-radius: 50%; background: #3a414c; }
.sw.on { color: var(--text); border-color: #2c7a4f; background: #10241a; }
.sw.on i { background: var(--ok); box-shadow: 0 0 8px var(--ok); }
.sw:disabled { opacity: .4; }
</style>
