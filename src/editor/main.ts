import './styles.css';
import { ConfigEditorApp } from './app';

const root = document.querySelector<HTMLElement>('#editor-root');
if (!root) throw new Error('缺少 #editor-root');

if (import.meta.env.PROD) document.querySelector<HTMLElement>('[data-readonly-banner]')!.hidden = false;

void new ConfigEditorApp(root).start();
