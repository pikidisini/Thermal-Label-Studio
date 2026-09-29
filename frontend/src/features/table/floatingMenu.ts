export type TableMenuItem = { label: string; action: () => void };
export type TableMenuGroup = { title: string; items: TableMenuItem[] };

/** Canvas overlay for table commands. Keep DOM presentation out of Fabric event handling. */
export function createTableFloatingMenu(
  host: HTMLElement,
  selection: DOMRect,
  groups: TableMenuGroup[],
) {
  const hostRect = host.getBoundingClientRect();
  const root = document.createElement('div');
  root.dataset.testid = 'table-context-toolbar';
  root.setAttribute('role', 'toolbar');
  root.setAttribute('aria-label', 'Table editing');
  root.style.cssText = 'position:absolute;z-index:14;';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.dataset.testid = 'table-format-trigger';
  trigger.setAttribute('aria-label', 'Table options');
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.textContent = 'Tabel ▾';
  trigger.style.cssText = 'font:12px Arial;color:#fff;background:#26364d;border:1px solid #7b91ae;border-radius:4px;padding:5px 9px;cursor:pointer;box-shadow:0 2px 8px #0005;';
  root.appendChild(trigger);

  const menu = document.createElement('div');
  menu.dataset.testid = 'table-format-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Table options');
  menu.style.cssText = 'display:none;position:absolute;width:230px;overflow-y:auto;background:#1e2633;color:#f8fafc;border:1px solid #64748b;border-radius:6px;padding:5px;box-shadow:0 10px 28px #0009;';
  root.appendChild(menu);

  const close = () => {
    menu.style.display = 'none';
    trigger.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    menu.style.display = 'block';
    trigger.setAttribute('aria-expanded', 'true');
    const rootLeft = Number.parseFloat(root.style.left) || 0;
    const rootTop = Number.parseFloat(root.style.top) || 0;
    const spaceBelow = host.clientHeight - rootTop - trigger.offsetHeight;
    const placeAbove = spaceBelow < 230 && rootTop > spaceBelow;
    menu.style.top = placeAbove ? 'auto' : '100%';
    menu.style.bottom = placeAbove ? '100%' : 'auto';
    menu.style.left = `${Math.min(0, host.clientWidth - rootLeft - 240)}px`;
    menu.style.maxHeight = `${Math.max(80, Math.min(320, placeAbove ? rootTop : spaceBelow))}px`;
  };
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (menu.style.display === 'none') open(); else close();
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { close(); trigger.focus(); }
  });

  for (const group of groups) {
    if (group.items.length === 0) continue;
    const details = document.createElement('details');
    details.style.cssText = 'border-bottom:1px solid #394659;padding:3px 0;';
    const summary = document.createElement('summary');
    summary.textContent = group.title;
    summary.style.cssText = 'cursor:pointer;font:600 12px Arial;padding:6px;';
    details.appendChild(summary);
    const contents = document.createElement('div');
    contents.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;';
    for (const item of group.items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.setAttribute('aria-label', item.label);
      button.style.cssText = 'font:11px Arial;text-align:left;min-height:27px;padding:4px 6px;color:#f8fafc;background:#334155;border:1px solid #52647d;border-radius:3px;cursor:pointer;';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        item.action();
        close();
      });
      contents.appendChild(button);
    }
    details.appendChild(contents);
    menu.appendChild(details);
  }

  host.appendChild(root);
  const buttonWidth = trigger.getBoundingClientRect().width || 70;
  root.style.left = `${Math.max(0, Math.min(host.clientWidth - buttonWidth, selection.left - hostRect.left))}px`;
  const below = selection.bottom - hostRect.top + 4;
  const above = selection.top - hostRect.top - trigger.offsetHeight - 4;
  root.style.top = `${Math.max(0, below + trigger.offsetHeight < host.clientHeight ? below : above)}px`;
  return { root, menu, open, close };
}
