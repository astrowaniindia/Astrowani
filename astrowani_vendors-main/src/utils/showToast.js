// Delegates to the cross-platform toast. This used to call ToastAndroid directly,
// which does nothing on iOS — see components/ToastHost.js.
import { showToast } from '../components/ToastHost';

export default showToast;
