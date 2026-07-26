import type { DomainBridge } from "./bridge";

export function formatDomainPanelError(message: string): string {
  if (
    /backend unreachable|failed to fetch|networkerror|unexpected end of json|response\.json/i.test(
      message,
    )
  ) {
    return "Backend unavailable. Local dungeon remains active.";
  }
  return message.length > 120 ? `${message.slice(0, 119)}…` : message;
}

/**
 * Compact domain + authority status panel for Dungeon Escape HUD.
 * Avoids projectSurfaceFull — uses dungeon state only (cheap).
 */
export function mountDomainPanel(
  host: HTMLElement,
  bridge: DomainBridge,
): { refresh: () => void; dispose: () => void } {
  const root = document.createElement("section");
  root.className = "domain-panel";
  root.setAttribute("aria-label", "Dungeon domain and authority");
  root.innerHTML = `
    <header class="domain-panel__head">
      <small>DOMAIN</small>
      <strong data-role="title">Dungeons</strong>
      <span data-role="online" class="domain-panel__badge">OFFLINE</span>
    </header>
    <p data-role="summary" class="domain-panel__summary">—</p>
    <dl class="domain-panel__grid">
      <div><dt>seed</dt><dd data-role="seed">—</dd></div>
      <div><dt>floor</dt><dd data-role="floor">—</dd></div>
      <div><dt>room</dt><dd data-role="room">—</dd></div>
      <div><dt>threat</dt><dd data-role="threat">—</dd></div>
      <div><dt>mode</dt><dd data-role="mode">—</dd></div>
      <div><dt>explored</dt><dd data-role="explored">—</dd></div>
    </dl>
    <p data-role="error" class="domain-panel__error" hidden></p>
  `;
  host.append(root);

  const el = {
    summary: root.querySelector('[data-role="summary"]') as HTMLElement,
    seed: root.querySelector('[data-role="seed"]') as HTMLElement,
    floor: root.querySelector('[data-role="floor"]') as HTMLElement,
    room: root.querySelector('[data-role="room"]') as HTMLElement,
    threat: root.querySelector('[data-role="threat"]') as HTMLElement,
    mode: root.querySelector('[data-role="mode"]') as HTMLElement,
    explored: root.querySelector('[data-role="explored"]') as HTMLElement,
    online: root.querySelector('[data-role="online"]') as HTMLElement,
    error: root.querySelector('[data-role="error"]') as HTMLElement,
  };

  let lastSignature = "";

  const refresh = () => {
    const d = bridge.getDungeon();
    const st = bridge.getStatus();
    const signature = `${d.seed}|${d.floor}|${d.room}|${d.threat}|${d.engineMode}|${d.exploredCells}|${st.online}|${st.lastError ?? ""}`;
    if (signature === lastSignature) return;
    lastSignature = signature;

    el.summary.textContent = `Floor ${d.floor} · ${d.room} · ${d.profile || "custom"}`;
    el.seed.textContent = d.seed;
    el.floor.textContent = String(d.floor);
    el.room.textContent = d.room;
    el.threat.textContent = String(d.threat);
    el.mode.textContent = d.engineMode;
    el.explored.textContent = String(d.exploredCells);
    el.online.textContent = st.online ? "ONLINE" : "OFFLINE";
    el.online.classList.toggle("is-online", st.online);
    if (st.lastError) {
      el.error.hidden = false;
      el.error.textContent = formatDomainPanelError(st.lastError);
      el.error.title = st.lastError;
    } else {
      el.error.hidden = true;
      el.error.textContent = "";
      el.error.removeAttribute("title");
    }
  };

  refresh();
  return {
    refresh,
    dispose: () => root.remove(),
  };
}
