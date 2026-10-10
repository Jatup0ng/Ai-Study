<script setup>
</script>

<template>
  <router-view />
</template>

<style>
/* ==============================================================
   Design tokens (re-ui) — Light เป็นค่าเริ่มต้น, Dark ใช้ data-theme="dark"
   ============================================================== */
:root {
  --bg: #f4f7fc;
  --surface: #ffffff;
  --primary: #5575d9;
  --primary-strong: #4a66c2;
  --on-primary: #ffffff;
  --secondary: #8b7ce8;
  --accent: #75cfc0;
  --text: #26344d;
  --text-muted: #66748c;
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

  /* สีประจำวิชา (ใช้กับการ์ดวิชา) */
  --subj-1: #5575d9;
  --subj-2: #2f8a99;
  --subj-3: #6b58c6;
  --subj-4: #b87a22;
  --subj-5: #c0587a;
  --subj-6: #3d8a57;

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

  --subj-1: #91a7ff;
  --subj-2: #5cc1ce;
  --subj-3: #a99bf0;
  --subj-4: #e6b063;
  --subj-5: #e88da3;
  --subj-6: #7cc48f;

  --shadow-card: none;
  --shadow-lift: 0 10px 24px -14px rgba(0, 0, 0, 0.6);
}

/* ชื่อเดิมที่ view/component เก่ายังเรียกใช้อยู่ — ชี้ไป token ใหม่
   เพื่อให้หน้าที่ยังไม่ได้รีเปลี่ยนสีตามธีมไปก่อน (ลบทิ้งได้เมื่อรีครบทุกหน้า) */
:root {
  --ink: var(--text);
  --ink-soft: var(--text-muted);
  --ink-faint: color-mix(in srgb, var(--text-muted) 70%, var(--bg));
  --paper: var(--bg);
  --card: var(--surface);
  --border-strong: color-mix(in srgb, var(--border) 65%, var(--text-muted));
  --indigo: var(--primary);
  --indigo-dark: var(--primary-strong);
  --highlighter: #ffd84d;
  --highlighter-soft: var(--warning-bg);
}

:root[data-theme='dark'] {
  --highlighter: #f2c06b;
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

:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
</style>
