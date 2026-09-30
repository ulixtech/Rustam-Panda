// Rustam Panda Dossier Report Controller
// Developed by @abbyisonline

document.addEventListener('DOMContentLoaded', () => {
  const metaModelBadge = document.getElementById('meta-model-badge');
  const metaDate = document.getElementById('meta-date');
  const metaAdCount = document.getElementById('meta-ad-count');
  const kpiModel = document.getElementById('kpi-model');
  const kpiAds = document.getElementById('kpi-ads');
  const reportBody = document.getElementById('report-rendered-body');
  const toast = document.getElementById('toast');

  const btnPrintPdf = document.getElementById('btn-print-pdf');
  const btnCopyMd = document.getElementById('btn-copy-md');
  const btnDownloadMd = document.getElementById('btn-download-md');
  const btnClose = document.getElementById('btn-close-page');

  let rawMarkdown = '';

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2200);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Full Markdown to HTML parser with Tables, HR, Lists, Code, and Section numbers
  function renderMarkdownToHtml(markdown) {
    if (!markdown) return '';

    function parseInline(text) {
      if (!text) return '';
      let s = escapeHtml(text);
      s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
      s = s.replace(/_([^_]+?)_/g, '<em>$1</em>');
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      return s;
    }

    function isTableRow(line) {
      if (!line) return false;
      const trimmed = line.trim();
      if (!trimmed.includes('|')) return false;
      if (trimmed.startsWith('#')) return false;
      if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return false;
      return true;
    }

    function parseTableCells(row) {
      let trimmed = row.trim();
      if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
      if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
      return trimmed.split('|').map(c => c.trim());
    }

    function isTableSeparator(row) {
      if (!row || !row.includes('|')) return false;
      const cells = parseTableCells(row);
      if (cells.length === 0) return false;
      return cells.every(c => /^:?-{1,}:?$/.test(c.trim()));
    }

    function getAlignment(sepCell) {
      const trimmed = sepCell.trim();
      const left = trimmed.startsWith(':');
      const right = trimmed.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      return 'left';
    }

    const lines = markdown.split(/\r?\n/);
    const output = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // 1. Empty line
      if (!trimmed) {
        i++;
        continue;
      }

      // 2. Horizontal Rule (---, ***, ___)
      if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        output.push('<hr class="adspy-report-hr" />');
        i++;
        continue;
      }

      // 3. Fenced Code Block
      if (trimmed.startsWith('```')) {
        const lang = trimmed.slice(3).trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++;
        output.push(`<div class="adspy-code-block-wrapper"><pre class="adspy-code-block"><code class="language-${escapeHtml(lang)}">${escapeHtml(codeLines.join('\n'))}</code></pre></div>`);
        continue;
      }

      // 4. Headings (# to ######)
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const title = parseInline(headingMatch[2]);
        output.push(`<h${level}>${title}</h${level}>`);
        i++;
        continue;
      }

      // 5. Standalone Numbered Section Headings like "2. 👥 Title" or "1. **Title**"
      const isStandaloneSectionHeading = /^\d+\.\s+[\u{1F300}-\u{1F9FF}]/u.test(trimmed) || 
        (/^\d+\.\s+\*\*[^*]+\*\*/.test(trimmed) && (!lines[i + 1] || !/^\d+\./.test(lines[i + 1].trim())));
      if (isStandaloneSectionHeading) {
        const title = parseInline(trimmed.replace(/^\d+\.\s+/, ''));
        const numMatch = trimmed.match(/^(\d+\.)/);
        const prefix = numMatch ? numMatch[1] : '';
        output.push(`<h3><span class="adspy-section-num">${prefix}</span> ${title}</h3>`);
        i++;
        continue;
      }

      // 6. Markdown Table
      if (isTableRow(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        const headerCells = parseTableCells(trimmed);
        const sepCells = parseTableCells(lines[i + 1]);
        const alignments = sepCells.map(c => getAlignment(c));

        i += 2; // skip header & separator
        const bodyRows = [];
        while (i < lines.length && isTableRow(lines[i])) {
          if (isTableSeparator(lines[i])) {
            i++;
            continue;
          }
          bodyRows.push(parseTableCells(lines[i]));
          i++;
        }

        let tableHtml = '<div class="adspy-table-wrapper"><table class="adspy-report-table"><thead><tr>';
        headerCells.forEach((th, idx) => {
          const align = alignments[idx] || 'left';
          tableHtml += `<th style="text-align: ${align}">${parseInline(th)}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';

        bodyRows.forEach((row, rIdx) => {
          tableHtml += `<tr class="${rIdx % 2 === 1 ? 'adspy-tr-stripe' : ''}">`;
          row.forEach((td, idx) => {
            const align = alignments[idx] || 'left';
            tableHtml += `<td style="text-align: ${align}">${parseInline(td)}</td>`;
          });
          for (let c = row.length; c < headerCells.length; c++) {
            tableHtml += '<td></td>';
          }
          tableHtml += '</tr>';
        });

        tableHtml += '</tbody></table></div>';
        output.push(tableHtml);
        continue;
      }

      // 7. Blockquote
      if (trimmed.startsWith('>')) {
        const quoteLines = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        output.push(`<blockquote>${quoteLines.map(l => parseInline(l)).join('<br />')}</blockquote>`);
        continue;
      }

      // 8. Unordered List (- or *)
      if (/^[\-\*]\s+/.test(trimmed)) {
        let listHtml = '<ul>';
        while (i < lines.length && /^[\-\*]\s+/.test(lines[i].trim())) {
          const itemText = lines[i].trim().replace(/^[\-\*]\s+/, '');
          listHtml += `<li>${parseInline(itemText)}</li>`;
          i++;
        }
        listHtml += '</ul>';
        output.push(listHtml);
        continue;
      }

      // 9. Ordered List (1. 2. 3.)
      if (/^\d+\.\s+/.test(trimmed)) {
        let listHtml = '<ol>';
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
          listHtml += `<li>${parseInline(itemText)}</li>`;
          i++;
        }
        listHtml += '</ol>';
        output.push(listHtml);
        continue;
      }

      // 10. Regular Paragraph
      const paraLines = [];
      while (i < lines.length) {
        const cur = lines[i].trim();
        if (!cur) break;
        if (/^(\-{3,}|\*{3,}|_{3,})$/.test(cur)) break;
        if (cur.startsWith('```')) break;
        if (/^#{1,6}\s+/.test(cur)) break;
        if (isTableRow(cur) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) break;
        if (cur.startsWith('>')) break;
        if (/^[\-\*]\s+/.test(cur)) break;
        if (/^\d+\.\s+/.test(cur)) break;
        paraLines.push(cur);
        i++;
      }
      if (paraLines.length > 0) {
        output.push(`<p>${paraLines.map(l => parseInline(l)).join('<br />')}</p>`);
      }
    }

    return `<div class="adspy-report-content">${output.join('\n')}</div>`;
  }

  function loadReportData() {
    // 1. Try chrome.storage.local
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['rustam_active_report'], (res) => {
        if (res && res.rustam_active_report) {
          applyReport(res.rustam_active_report);
        } else {
          tryFallbackStorage();
        }
      });
    } else {
      tryFallbackStorage();
    }
  }

  function tryFallbackStorage() {
    try {
      const raw = localStorage.getItem('rustam_active_report');
      if (raw) {
        applyReport(JSON.parse(raw));
      } else {
        showEmptyState();
      }
    } catch (e) {
      showEmptyState();
    }
  }

  function applyReport(data) {
    rawMarkdown = data.markdown || '';
    const model = data.model || 'AI Model';
    const totalAds = data.totalAds || 0;
    const date = data.date || new Date().toLocaleString();

    if (metaModelBadge) metaModelBadge.textContent = model;
    if (metaDate) metaDate.textContent = date;
    if (metaAdCount) metaAdCount.textContent = `${totalAds} Ads`;

    if (kpiModel) kpiModel.textContent = model.split('/').pop().toUpperCase();
    if (kpiAds) kpiAds.textContent = totalAds;

    const safeFilename = `Rustam_Panda_AI_Report_${Date.now()}`;
    document.title = safeFilename;

    if (reportBody) {
      reportBody.innerHTML = renderMarkdownToHtml(rawMarkdown);
    }

    // Auto-trigger print after font and layout settlement
    const urlParams = new URLSearchParams(window.location.search);
    const noAutoPrint = urlParams.get('autoprint') === 'false';
    if (!noAutoPrint) {
      setTimeout(() => {
        window.print();
      }, 450);
    }
  }

  function showEmptyState() {
    if (reportBody) {
      reportBody.innerHTML = `
        <div style="text-align: center; padding: 60px 20px;">
          <h2 style="color: #64748b; font-size: 18px; margin-bottom: 8px;">No Active Dossier Found</h2>
          <p style="color: #94a3b8; font-size: 13px;">Please run an AI Analysis in the Rustam Panda extension overlay to generate this report.</p>
        </div>
      `;
    }
  }

  // Action Buttons
  if (btnPrintPdf) {
    btnPrintPdf.addEventListener('click', () => {
      window.print();
    });
  }

  if (btnCopyMd) {
    btnCopyMd.addEventListener('click', () => {
      if (!rawMarkdown) return;
      navigator.clipboard.writeText(rawMarkdown).then(() => {
        showToast('Copied Markdown to clipboard!');
      });
    });
  }

  if (btnDownloadMd) {
    btnDownloadMd.addEventListener('click', () => {
      if (!rawMarkdown) return;
      const blob = new Blob([rawMarkdown], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rustam_panda_ai_report_${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Downloaded .md report!');
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      window.close();
    });
  }

  loadReportData();
});
