import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import { startReaper } from './lib/reaper.js';
import { startXr } from './lib/xr18.js';
import { startYargAuto } from './lib/yargAuto.js';

createApp(App).mount('#app');
startReaper();
startXr();
startYargAuto();
