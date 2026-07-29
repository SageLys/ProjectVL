import './styles.css';
import './print.css';
import { DesignWorkbenchApp } from './app';

const root = document.querySelector<HTMLElement>('#design-root');
if (!root) throw new Error('缺少 #design-root');

void new DesignWorkbenchApp(root).start();
