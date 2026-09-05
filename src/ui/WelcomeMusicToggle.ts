/** Welcome note-icon toggle: pressed means music is on. */
export function applyWelcomeMusicToggle(button: HTMLElement, muted: boolean, label: string): void {
  button.setAttribute("aria-pressed", String(!muted));
  button.setAttribute("aria-label", label);
  button.classList.toggle("is-active", !muted);
  button.classList.toggle("is-muted", muted);
  button.title = label;
}
