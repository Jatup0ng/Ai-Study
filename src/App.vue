<script setup>
import AppDialogHost from './component/AppDialogHost.vue'
</script>

<template>
  <router-view />
  <!-- pop up กลางของแอป (กล่องยืนยัน + แจ้งเตือนมุมจอ) — ใช้ผ่าน composables/useDialog.js -->
  <AppDialogHost />
</template>

<style>
/* ==============================================================
   Design tokens (re-ui) — Light เป็นค่าเริ่มต้น, Dark ใช้ data-theme="dark"
   ============================================================== */
:root {
  --bg: #f4f7fc;
  --surface: #ffffff;
  --primary: #5575d9;
  --primary-strong: color-mix(in srgb, var(--primary) 85%, var(--text));
  --on-primary: #ffffff;
  --secondary: #8b7ce8;
  --accent: #75cfc0;
  --text: #26344d;
  --text-muted: #758198;
  --border: #e1e7f0;
  --hover: #e8eeff;

  --success: #2e8b63;
  --success-bg: #e8f7ef;
  --info: #4a66c2;
  --info-bg: #eaf2ff;
  --warning: #9a6a12;
  --warning-bg: #fff4d9;
  --danger: #c0473f;
  --danger-bg: #fdebec;

  /* สีประจำวิชา — ใช้เฉพาะสีในพาเลต (primary / secondary / accent และสีผสมระหว่างกัน) */
  --subj-1: var(--primary);
  --subj-2: var(--accent);
  --subj-3: var(--secondary);
  --subj-4: color-mix(in srgb, var(--primary) 55%, var(--accent));
  --subj-5: color-mix(in srgb, var(--secondary) 55%, var(--primary));
  --subj-6: color-mix(in srgb, var(--accent) 55%, var(--secondary));

  /* ฉากหลังของ pop up */
  --scrim: rgba(38, 52, 77, 0.45);

  --shadow-card: 0 1px 2px rgba(38, 52, 77, 0.04);
  --shadow-lift: 0 10px 24px -14px rgba(38, 52, 77, 0.35);

  --font-heading: 'Sarabun', 'Noto Sans Thai', sans-serif;
  --font-body: 'IBM Plex Sans Thai', 'Noto Sans Thai', sans-serif;
  --font-serif: 'Noto Serif Thai', 'Sarabun', serif;
}

:root[data-theme='dark'] {
  --bg: #151927;
  --surface: #20263a;
  --primary: #91a7ff;
  --primary-strong: #aebcff;
  --on-primary: #151927;
  --secondary: #b0a3ff;
  --accent: #80d9c4;
  --text: #f0f2fa;
  --text-muted: #a5adc2;
  --border: #353d57;
  --hover: #2a324a;

  --success: #7cd9b0;
  --success-bg: #203d36;
  --info: #8fb0ff;
  --info-bg: #243652;
  --warning: #f2c06b;
  --warning-bg: #443725;
  --danger: #f28a94;
  --danger-bg: #472b35;

  --scrim: rgba(21, 25, 39, 0.72);

  --shadow-card: none;
  --shadow-lift: 0 10px 24px -14px rgba(0, 0, 0, 0.6);
}

/* token เสริมที่ผสมจากพาเลตหลัก — เปลี่ยนตามธีมอัตโนมัติ */
:root {
  --text-faint: color-mix(in srgb, var(--text-muted) 70%, var(--bg));
  --border-strong: color-mix(in srgb, var(--border) 65%, var(--text-muted));
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font-body);
  color: var(--text);
  background: var(--bg);
}

h1, h2, h3 {
  font-family: var(--font-heading);
  font-weight: 700;
}

button,
input,
textarea {
  font-family: inherit;
}

/* ปุ่มที่ไม่ได้กำหนดสีเอง ให้ใช้สีตัวอักษรตามธีม (กันตัวหนังสือดำจมในโหมดมืด) */
button {
  color: inherit;
}

:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
</style>
