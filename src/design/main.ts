import './styles.css';
import './print.css';
import { DesignWorkbenchApp } from './app';

const root = document.querySelector<HTMLElement>('#design-root');
if (!root) throw new Error('缺少 #design-root');

if (import.meta.env.PROD) document.querySelector<HTMLElement>('[data-readonly-banner]')!.hidden = false;

void new DesignWorkbenchApp(root).start();
