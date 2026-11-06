import ReactDOM from 'react-dom/client';
import { App } from './App.jsx';
import './index.css';

// 기존 동작 유지를 위해 StrictMode는 사용하지 않는다(개발 모드 이중 실행 방지).
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
