import './styles/app.css';

const params = new URLSearchParams(window.location.search);
const wantsCalibration = window.location.pathname.replace(/\/$/, '') === '/calibrate'
  || params.has('calibrate');

if (import.meta.env.DEV && wantsCalibration) {
  void import('./calibrate/calibrationApp').then(({ mountCalibrationApp }) => {
    mountCalibrationApp(document.body);
  });
} else {
  void import('./game');
}
