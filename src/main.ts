import './styles/app.css';

if (import.meta.env.DEV) {
  const params = new URLSearchParams(window.location.search);
  const wantsCalibration = window.location.pathname.replace(/\/$/, '') === '/calibrate' || params.has('calibrate');
  if (wantsCalibration) void import('./calibrate/calibrationApp').then(({ mountCalibrationApp }) => mountCalibrationApp(document.body));
  else void import('./game');
} else {
  void import('./game');
}
