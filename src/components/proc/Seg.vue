<script setup>
// Small segmented control for enum ints.
defineProps({ options: { type: Array, required: true }, modelValue: { type: Number, default: undefined }, disabled: Boolean });
defineEmits(['update:modelValue']);
</script>
<template>
  <div class="seg">
    <button v-for="(o, i) in options" :key="o" :class="{ on: modelValue === i }" :disabled="disabled" @click="$emit('update:modelValue', i)">{{ o }}</button>
  </div>
</template>
<style scoped>
.seg { display: inline-flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--groove); }
.seg button { height: 24px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .05em; white-space: nowrap; }
.seg button.on { background: var(--btn); color: var(--text); box-shadow: inset 0 -2px 0 var(--accent); }
</style>
