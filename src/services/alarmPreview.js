// One bounded preview at a time; late audio loads must never restart a stopped preview.
function createAlarmPreview(Sound, { onChange = () => {}, onError = () => {},
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let current = null;
  function stop() {
    const previous = current;
    current = null;
    if (previous) {
      previous.stopped = true;
      clearTimer(previous.timer);
      if (previous.ready) { previous.sound.stop(); previous.sound.release(); }
    }
    onChange(false);
  }
  function play(uri) {
    stop();
    const session = { stopped: false, ready: false, sound: null, timer: null };
    current = session;
    onChange(true);
    session.timer = setTimer(stop, 10000);
    session.sound = new Sound(String(uri), null, error => {
      session.ready = true;
      if (session.stopped || current !== session) { session.sound.release(); return; }
      if (error) { stop(); onError(); return; }
      session.sound.setNumberOfLoops(0);
      session.sound.setVolume(0.7);
      session.sound.play(() => { if (current === session) stop(); });
    });
  }
  return { play, stop };
}
module.exports = { createAlarmPreview };
