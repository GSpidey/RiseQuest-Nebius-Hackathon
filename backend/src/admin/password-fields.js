'use strict';
document.querySelectorAll('[data-password-toggle]').forEach(button => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.textContent = reveal ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(reveal));
    button.setAttribute('aria-label', `${reveal ? 'Hide' : 'Show'} ${input.id === 'confirm-password' ? 'confirmation password' : 'password'}`);
  });
});
