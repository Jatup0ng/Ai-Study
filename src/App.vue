<script setup>
</script>

<template>
  <router-view />
</template>

<style>
:root {
  --ink: #1b1d29;
  --ink-soft: #6b6f80;
  --ink-faint: #9a9db0;
  --paper: #f5f6fa;
  --card: #ffffff;
  --border: #e3e5ee;
  --border-strong: #cdd1e0;
  --indigo: #4338ca;
  --indigo-dark: #352da3;
  --highlighter: #ffd84d;
  --highlighter-soft: #fff6d9;
  --success: #1e7a3d;
  --success-bg: #e7f6ec;
  --danger: #c0392b;
  --danger-bg: #fdecec;
  --font-heading: 'Sarabun', 'Noto Sans Thai', sans-serif;
  --font-body: 'IBM Plex Sans Thai', 'Noto Sans Thai', sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font-body);
  color: var(--ink);
  background: var(--paper);
}

h1, h2, h3 {
  font-family: var(--font-heading);
  font-weight: 700;
}
</style>
