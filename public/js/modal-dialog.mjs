// Keep keyboard focus and pointer gestures inside an open dialog.
export function containDialog(root, { backdrop = root, onClose, initialFocus } = {}) {
  const previous = document.activeElement;
  // The optional walkthrough explains controls inside mission dialogs.
  const guide = root.id === 'modal' ? document.querySelector('.guided-tutorial') : null;
  const roots = [root, guide].filter(Boolean);
  const inerted = [];
  for (let node = root; node.parentElement; node = node.parentElement) {
    for (const sibling of node.parentElement.children) {
      if (sibling === node || sibling === backdrop || sibling === guide || sibling.inert) continue;
      sibling.inert = true;
      inerted.push(sibling);
    }
    if (node.parentElement === document.body) break;
  }
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.tabIndex = -1;
  const focusable = () => roots.flatMap(el => [...el.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')])
    .filter(el => !el.disabled && el.tabIndex >= 0 && !el.closest('[hidden], [inert]') && el.getClientRects().length);
  const focus = () => (initialFocus?.() || focusable()[0] || root).focus({ preventScroll: true });
  const keydown = event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); onClose?.();
    } else if (event.key === 'Tab') {
      const items = focusable(), index = items.indexOf(document.activeElement);
      event.preventDefault(); event.stopImmediatePropagation();
      (items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length] || root).focus();
    }
  };
  const focusin = event => { if (!roots.some(el => el.contains(event.target))) focus(); };
  const stop = event => event.stopPropagation();
  let backdropPress = false;
  const down = event => { backdropPress = event.target === backdrop; stop(event); };
  const click = event => {
    stop(event);
    if (backdropPress && event.target === backdrop) { event.preventDefault(); onClose?.(); }
    backdropPress = false;
  };
  window.addEventListener('keydown', keydown, true);
  document.addEventListener('focusin', focusin);
  for (const el of new Set([root, backdrop])) {
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', stop);
    el.addEventListener('click', click);
  }
  focus();
  return () => {
    window.removeEventListener('keydown', keydown, true);
    document.removeEventListener('focusin', focusin);
    for (const el of new Set([root, backdrop])) {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', stop);
      el.removeEventListener('click', click);
    }
    inerted.forEach(el => { el.inert = false; });
    if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
  };
}
