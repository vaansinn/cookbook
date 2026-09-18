// Presentation and command preparation only. Requirements come from the server;
// never load visible planning cards or resolve recipes to calculate this list.
export const shoppingLayouts = ['category', 'alphabetical', 'dish', 'amount'];
export const categories = ['produce', 'bakery', 'cupboard', 'herbs', 'chilled', 'frozen', 'other'];
export const personalUnits = ['g', 'kg', 'ml', 'l', 'piece', 'head', 'loaf', 'bunch', 'pack', 'bottle', 'tsp', 'tbsp'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function scopeFromSearch(search) {
  const query = new URLSearchParams(search);
  const values = query.getAll('scope');
  return !values.length ? null : values.length === 1 && UUID.test(values[0]) ? values[0] : 'invalid';
}
export function decimal(value) {
  const match = typeof value === 'string' && /^(0|[1-9]\d{0,12})(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) throw new Error('invalidAmount');
  return BigInt(match[1]) * 1000n + BigInt((match[2] || '').padEnd(3, '0'));
}
export function decimalText(value) {
  return `${value / 1000n}.${String(value % 1000n).padStart(3, '0')}`;
}
export function displayAmount(value, unit, language, t) {
  if (unit === 'taste') return t.toTaste;
  if (value === null) return t.unquantified;
  // Exact decimal display, without changing any authoritative quantity.
  const parts = String(value).split('.');
  const integral = new Intl.NumberFormat(language).format(BigInt(parts[0]));
  const fraction = (parts[1] || '').replace(/0+$/, '');
  const unitLabel = decimal(String(value)) === 1000n ? t[`unit_${unit}_one`] || t[`unit_${unit}`] || unit : t[`unit_${unit}`] || unit;
  return `${integral}${fraction ? (language === 'de' ? ',' : '.') + fraction : ''}${unit ? ` ${unitLabel}` : ''}`;
}
export function amountEdit(value, row, correctMinimum = false) {
  try {
    let amount = decimal(value.trim().replace(',', '.'));
    const minimum = decimal(row.required);
    const corrected = amount < minimum && correctMinimum;
    if (corrected) amount = minimum;
    if (amount < minimum || amount > 1000000000000n * 1000n) throw new Error('invalidAmount');
    return { value: corrected ? decimalText(amount) : value, extra: decimalText(amount - minimum), corrected, error: null };
  } catch { return { value, error: 'invalidAmount', corrected: false }; }
}
export function coverage(row, sources = row.sources, includeExtra = true) {
  const parts = sources.map((source) => ({ state: source.state, review: source.review }));
  if (includeExtra && (row.personal_id || decimal(row.extra) > 0n)) parts.push({ state: row.extra_state, review: row.extra_review });
  const covered = parts.filter((part) => !part.review && ['bought', 'have'].includes(part.state));
  const review = parts.some((part) => part.review);
  const checked = parts.length > 0 && covered.length === parts.length;
  let state = review ? 'review' : checked ? parts.every((part) => part.state === 'have') ? 'have'
    : parts.every((part) => part.state === 'bought') ? 'bought' : 'covered' : covered.length ? 'partial' : 'needed';
  if (row.purchase_mode === 'check_cupboard' && sources.length && sources.every((source) => source.confirmed === false)) state = 'unchecked';
  return { checked, mixed: !checked && (covered.length > 0 || review), state, empty: parts.length === 0 };
}
export function coverPayload(scopeId, row, sources, status, includeExtra) {
  if (!['needed', 'have', 'bought'].includes(status)) throw new Error('invalidStatus');
  const allowed = new Set(row.sources.map((source) => source.id));
  if (sources.some((source) => !allowed.has(source.id))) throw new Error('invalidSource');
  return { scope_id: scopeId, row_key: row.key, source_ids: [...new Set(sources.map((source) => source.id))], status, include_extra: !!includeExtra && (!!row.personal_id || decimal(row.extra) > 0n) };
}
export function nextCheckStatus(row, state) {
  if (state.checked) return 'needed';
  // Cupboard checking acknowledges stock unless the user explicitly chose to
  // buy. Measured shopping rows keep the ordinary bought/needed toggle.
  return row.purchase_mode === 'check_cupboard' && state.state !== 'needed' ? 'have' : 'bought';
}
export function visibleShoppingNotice(notice, projection, groups) {
  return notice && projection && notice.scopeId === projection.scope.id && notice.revision === projection.revision
    && groups.some((group) => group.rows.some((reference) => reference.key === notice.referenceKey)) ? notice : null;
}
export function shoppingGroups(rows, layout, language, t) {
  const collator = new Intl.Collator(language, { sensitivity: 'base', numeric: true });
  const alpha = (a, b) => collator.compare(a.row.label, b.row.label) || a.key.localeCompare(b.key);
  const references = rows.map((row) => ({ key: row.key, row, sources: row.sources, includeExtra: true }));
  if (layout === 'alphabetical') return [{ key: 'all', title: t.ingredients, rows: references.sort(alpha) }];
  if (layout === 'dish') {
    const groups = new Map();
    for (const row of rows) {
      const sources = new Map();
      for (const source of row.sources) {
        const key = source.group_id || source.item_id;
        if (!sources.has(key)) sources.set(key, []);
        sources.get(key).push(source);
      }
      if (!sources.size) sources.set(row.personal_id ? '@personal' : '@extras', []);
      for (const [key, local] of sources) {
        if (!groups.has(key)) groups.set(key, { key, title: local[0]?.dish_title || (row.personal_id ? t.personal : t.extras), rows: [] });
        groups.get(key).rows.push({ key: `${key}|${row.key}`, row, sources: local, includeExtra: !local.length, dish: !!local.length });
      }
    }
    return [...groups.values()].sort((a, b) => collator.compare(a.title, b.title) || a.key.localeCompare(b.key))
      .map((group) => ({ ...group, rows: group.rows.sort(alpha) }));
  }
  if (layout === 'amount') {
    const rank = (row) => row.purchase_mode === 'check_cupboard' || row.total === null ? 2
      : ['g', 'kg'].includes(row.unit) ? 0 : ['piece', 'head', 'loaf', 'bunch', 'pack', 'bottle'].includes(row.unit) ? 1 : 2;
    const family = (row) => row.purchase_mode === 'check_cupboard' || row.total === null ? '~' : ['l', 'ml'].includes(row.unit) ? 'ml' : row.unit;
    // Conversion is solely a sort key. Display and coverage keep server units.
    const sortValue = (row) => decimal(row.total) * (['kg', 'l'].includes(row.unit) ? 1000n : 1n);
    return ['weight', 'count', 'otherAmounts'].map((key, index) => ({ key, title: t[key], rows: references.filter(({ row }) => rank(row) === index).sort((a, b) => {
      if (index === 2) {
        const af = family(a.row), bf = family(b.row);
        if (af === '~' || bf === '~') return af === bf ? alpha(a, b) : af === '~' ? 1 : -1;
        const f = af.localeCompare(bf); if (f) return f;
      }
      const difference = sortValue(b.row) - sortValue(a.row);
      return difference < 0n ? -1 : difference > 0n ? 1 : alpha(a, b);
    }) })).filter((group) => group.rows.length);
  }
  return categories.map((key) => ({ key, title: t[`category_${key}`], rows: references.filter(({ row }) => (categories.includes(row.category) ? row.category : 'other') === key).sort(alpha) })).filter((group) => group.rows.length);
}
export function initialDates(plan, now = new Date()) {
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return { start_date: date >= plan.start_date && date <= plan.end_date ? date : plan.start_date, end_date: plan.end_date };
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function twoDayRange(plan, from) {
  if (!validDate(from) || from < plan.start_date || from > plan.end_date) throw new Error('invalidDates');
  const date = new Date(`${from}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 1);
  return { start_date: from, end_date: [date.toISOString().slice(0, 10), plan.end_date].sort()[0] };
}
export function scopeCommand(ownerType, owner, form, choices = []) {
  if (!owner || !['plan', 'event'].includes(ownerType)) throw new Error('chooseOwner');
  const result = { owner_type: ownerType, owner_id: owner.id, mode: form.mode };
  if (!['all', 'dates', 'meals'].includes(form.mode) || ownerType === 'event' && form.mode !== 'all') throw new Error('invalidSelection');
  if (form.mode === 'dates') {
    if (!validDate(form.start_date) || !validDate(form.end_date) || form.start_date > form.end_date || form.start_date < owner.start_date || form.end_date > owner.end_date) throw new Error('invalidDates');
    Object.assign(result, { start_date: form.start_date, end_date: form.end_date });
  }
  if (form.mode === 'meals') {
    const allowed = new Set(choices.map((choice) => choice.key));
    if (!Array.isArray(form.selection) || form.selection.some((key) => !allowed.has(key))) throw new Error('invalidSelection');
    result.selection = [...new Set(form.selection)].sort();
  }
  return result;
}
export function personalCommand(scopeId, record, form) {
  const title = form.title.trim();
  if (!title || title.length > 160) throw new Error('invalidTitle');
  const raw = form.amount.trim().replace(',', '.');
  let amount = null, unit = null;
  if (raw || form.unit) {
    const quantity = decimal(raw);
    if (quantity <= 0n || quantity > 1000000000000n * 1000n || !personalUnits.includes(form.unit)) throw new Error('invalidPersonalAmount');
    amount = decimalText(quantity); unit = form.unit;
  }
  return { operation: record ? 'shopping.personal.update' : 'shopping.personal.create',
    payload: { scope_id: scopeId, ...(record ? { item_id: record.personal_id } : {}), title, amount, unit } };
}
export function currentProjection(snapshot, scopeId) {
  const projection = snapshot?.shopping;
  return projection && projection.revision === snapshot.revision && (!scopeId || projection.scope.id === scopeId) ? projection : null;
}
