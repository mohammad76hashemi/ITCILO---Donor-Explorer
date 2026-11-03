/* Shared settings used by app.js and portal.js.
   Edit labels or the default filter set here. */
window.DPE = window.DPE || {};

/* Every donor field that can be used as a filter, with its default label */
DPE.FILTER_FIELDS = {
  sectors: 'Sector',
  regions: 'Region',
  type: 'Organisation type',
  modalities: 'Funding modality',
  priorities: 'Thematic priority',
  sdgs: 'SDGs',
  worksWith: 'Works with',
  countries: 'Country'
};

/* Default filters. place: "quick" = button in the bar, "more" = inside "More filters & sort".
   An admin can change this from "Manage filters"; their version is saved and replaces this one. */
DPE.DEFAULT_FILTERS = [
  { key: 'sectors', label: 'Sector', place: 'quick' },
  { key: 'regions', label: 'Region', place: 'quick' },
  { key: 'type', label: 'Organisation type', place: 'quick' },
  { key: 'modalities', label: 'Funding modality', place: 'quick' },
  { key: 'priorities', label: 'Thematic priority', place: 'more' },
  { key: 'sdgs', label: 'SDGs', place: 'more' },
  { key: 'worksWith', label: 'Works with', place: 'more' }
];

DPE.SDG = {
  1: 'No Poverty', 2: 'Zero Hunger', 3: 'Good Health and Well-being', 4: 'Quality Education',
  5: 'Gender Equality', 6: 'Clean Water and Sanitation', 7: 'Affordable and Clean Energy',
  8: 'Decent Work and Economic Growth', 9: 'Industry, Innovation and Infrastructure',
  10: 'Reduced Inequalities', 11: 'Sustainable Cities and Communities',
  12: 'Responsible Consumption and Production', 13: 'Climate Action', 14: 'Life Below Water',
  15: 'Life on Land', 16: 'Peace, Justice and Strong Institutions', 17: 'Partnerships for the Goals'
};

/* Small DOM helper shared by both scripts: h('p', { class: 'x', text: 'Hi' }, child, ...) */
DPE.h = function h(tag, props, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k === 'checked' || k === 'value' || k === 'selected') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
};
DPE.arr = v => Array.isArray(v) ? v : (v || v === 0) ? [v] : [];
