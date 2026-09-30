/**
 * Rustam Panda - Landing Page Interactive Controller
 * Developed by @abbyisonline
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- INTERACTIVE TERMINAL TAB SWITCHING ---
  const tabButtons = document.querySelectorAll('.demo-tab-btn');
  const demoPanes = document.querySelectorAll('.demo-pane');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      // Update active state on buttons
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update active state on panes
      demoPanes.forEach(pane => {
        if (pane.id === `pane-${targetTab}`) {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      });
    });
  });

  // --- INTERACTIVE TREE EXPAND / COLLAPSE IN DEMO ---
  const demoTreeHeaders = document.querySelectorAll('.demo-tree-node-title');
  demoTreeHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const parentNode = header.closest('.demo-tree-node');
      if (parentNode) {
        const adset = parentNode.querySelector('.demo-tree-adset');
        if (adset) {
          if (adset.style.display === 'none') {
            adset.style.display = 'block';
            header.querySelector('.demo-arrow').textContent = '▼';
          } else {
            adset.style.display = 'none';
            header.querySelector('.demo-arrow').textContent = '▶';
          }
        }
      }
    });
  });

  // --- COPY CODE BUTTONS ---
  const copyButtons = document.querySelectorAll('.btn-copy-code');
  copyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const textToCopy = btn.getAttribute('data-code') || '';
      if (!textToCopy) return;

      navigator.clipboard.writeText(textToCopy).then(() => {
        const originalText = btn.innerHTML;
        btn.innerHTML = '✓ Copied!';
        btn.style.color = '#10b981';
        setTimeout(() => {
          btn.innerHTML = originalText;
          btn.style.color = '';
        }, 1800);
      });
    });
  });

  // --- INTERACTIVE DEMO MODEL SELECTOR ---
  const demoModelSelect = document.getElementById('demo-select-model');
  const demoModelBadge = document.getElementById('demo-model-badge');
  if (demoModelSelect && demoModelBadge) {
    demoModelSelect.addEventListener('change', (e) => {
      demoModelBadge.textContent = e.target.options[e.target.selectedIndex].text;
    });
  }
});
